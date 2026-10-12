import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";

// The model and the database, stubbed. Mocked before auto-resolve-ticket.ts is imported, so lib/prisma.ts (which
// connects to DATABASE_URL) is never loaded and Gemini is never reached. Bun shares module mocks between test files,
// so the ai.ts stub has all of its exports, as in routes/tickets.test.ts.
const isAiConfigured = mock();
const autoResolveTicket = mock();
mock.module("./ai.ts", () => ({
  isAiConfigured,
  autoResolveTicket,
  aiSenderName: "AI Assistant",
  classifyTicket: mock(),
  polishReply: mock(),
  summarizeTicket: mock(),
}));
const prisma = {
  ticket: { findUnique: mock(), updateMany: mock() },
  message: { create: mock() },
  $transaction: mock(),
};
mock.module("./prisma.ts", () => ({ prisma }));

const { autoResolveTicketJob, handOverToAgents } = await import("./auto-resolve-ticket.ts");
const { aiAgentEmail } = await import("./ai-agent.ts");

// The knowledge base is a real file in a temporary directory (KNOWLEDGE_BASE_PATH). lib/knowledge-base.ts isn't
// mocked: Bun's module mocks would replace it in knowledge-base.test.ts too.
let dir: string;
let knowledgeBasePath: string;
const savedPath = process.env.KNOWLEDGE_BASE_PATH;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "helpdesk-auto-resolve-"));
  knowledgeBasePath = join(dir, "kb.md");
  await writeFile(knowledgeBasePath, "# Knowledge base\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  if (savedPath === undefined) delete process.env.KNOWLEDGE_BASE_PATH;
  else process.env.KNOWLEDGE_BASE_PATH = savedPath;
});

const reply = "Hi Jane,\n\nClick Forgot Password on the login page.\n\nBest regards,\nAI Assistant";
let consoleError: ReturnType<typeof spyOn>;
let consoleWarn: ReturnType<typeof spyOn>;

beforeEach(() => {
  isAiConfigured.mockReset().mockReturnValue(true);
  process.env.KNOWLEDGE_BASE_PATH = knowledgeBasePath;
  autoResolveTicket.mockReset().mockResolvedValue(reply);
  prisma.ticket.findUnique.mockReset().mockResolvedValue({
    subject: "Forgot password",
    senderName: "Jane Doe",
    messages: [{ body: "How do I reset my password?" }],
  });
  // Every update matches by default: the ticket is NEW, then PROCESSING.
  prisma.ticket.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prisma.message.create.mockReset().mockResolvedValue({});
  // Runs the callback with the stubbed client as its transaction client.
  prisma.$transaction.mockReset().mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  consoleError = spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

const awaitingAi = { in: [TicketStatus.NEW, TicketStatus.PROCESSING] };
const claimed = { where: { id: "t1", status: awaitingAi }, data: { status: TicketStatus.PROCESSING } };
const opened = { where: { id: "t1", status: awaitingAi }, data: { status: TicketStatus.OPEN } };
// The AI agent lets go of the ticket it couldn't resolve.
const released = {
  where: { id: "t1", status: TicketStatus.OPEN, assignedTo: { email: aiAgentEmail } },
  data: { assignedToId: null },
};
const resolved = { where: { id: "t1", status: TicketStatus.PROCESSING }, data: { status: TicketStatus.RESOLVED, resolvedAt: expect.any(Date) } };

describe("autoResolveTicketJob", () => {
  test("moves the ticket to PROCESSING before asking the AI to answer its first message from the knowledge base", async () => {
    await autoResolveTicketJob("t1");

    expect(prisma.ticket.updateMany).toHaveBeenNthCalledWith(1, claimed);
    expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
      where: { id: "t1" },
      select: {
        subject: true,
        senderName: true,
        messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
      },
    });
    expect(autoResolveTicket).toHaveBeenCalledWith({
      subject: "Forgot password",
      body: "How do I reset my password?",
      customerName: "Jane Doe",
      knowledgeBase: "# Knowledge base",
    });
    expect(prisma.ticket.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      autoResolveTicket.mock.invocationCallOrder[0]!,
    );
  });

  test("resolves the ticket and adds the AI's reply, in one transaction", async () => {
    await autoResolveTicketJob("t1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(resolved);
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        ticketId: "t1",
        senderType: SenderType.AI,
        body: reply,
        senderEmail: aiAgentEmail,
        senderName: "AI Assistant",
      },
    });
  });

  test("adds no reply when an agent set the status while the AI was answering", async () => {
    prisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await autoResolveTicketJob("t1");

    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(resolved);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  test("opens the ticket for the agents when the knowledge base doesn't answer it", async () => {
    autoResolveTicket.mockResolvedValue(null);

    await autoResolveTicketJob("t1");

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(opened);
    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(released);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  test.each([
    ["AI isn't configured", () => isAiConfigured.mockReturnValue(false)],
    ["there's no knowledge base", () => (process.env.KNOWLEDGE_BASE_PATH = join(dir, "missing.md"))],
    ["the ticket has no message", () => prisma.ticket.findUnique.mockResolvedValue({ subject: "Hi", senderName: null, messages: [] })],
    ["the ticket is gone", () => prisma.ticket.findUnique.mockResolvedValue(null)],
  ])("opens the ticket without asking the AI when %s", async (_, arrange) => {
    arrange();

    await autoResolveTicketJob("t1");

    expect(autoResolveTicket).not.toHaveBeenCalled();
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(opened);
    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(released);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  test("does nothing when the ticket is no longer NEW or PROCESSING (or is gone)", async () => {
    prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

    await autoResolveTicketJob("t1");

    expect(prisma.ticket.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(autoResolveTicket).not.toHaveBeenCalled();
  });

  test("logs a failed AI call and opens the ticket right away, without a retry", async () => {
    autoResolveTicket.mockRejectedValue(new Error("quota exceeded"));

    await autoResolveTicketJob("t1");

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(opened);
    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(released);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "The AI couldn't answer ticket t1; opening it for the agents:",
      expect.any(Error),
    );
  });

  test("logs and rethrows when the knowledge base can't be read", async () => {
    // A directory can't be read as a file.
    process.env.KNOWLEDGE_BASE_PATH = dir;

    await expect(autoResolveTicketJob("t1")).rejects.toThrow();

    expect(consoleError).toHaveBeenCalledWith("Couldn't auto-resolve ticket t1:", expect.any(Error));
  });

  test("logs and rethrows a failed save so the job is retried", async () => {
    prisma.message.create.mockRejectedValue(new Error("connection lost"));

    await expect(autoResolveTicketJob("t1")).rejects.toThrow("connection lost");

    expect(consoleError).toHaveBeenCalledWith("Couldn't auto-resolve ticket t1:", expect.any(Error));
  });
});

describe("handOverToAgents", () => {
  test("opens a ticket that's still NEW or PROCESSING, then unassigns it if the AI agent has it", async () => {
    await handOverToAgents("t1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.updateMany).toHaveBeenNthCalledWith(1, opened);
    expect(prisma.ticket.updateMany).toHaveBeenNthCalledWith(2, released);
  });
});
