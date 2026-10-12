import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { TicketCategory } from "../generated/prisma/enums.ts";

// The model and the database, stubbed. Mocked before classify-ticket.ts is imported, so lib/prisma.ts (which
// connects to DATABASE_URL) is never loaded and Gemini is never reached. Bun shares module mocks between test
// files, so the ai.ts stub has all of its exports, as in routes/tickets.test.ts.
const isAiConfigured = mock();
const classifyTicket = mock();
mock.module("./ai.ts", () => ({ isAiConfigured, classifyTicket, polishReply: mock(), summarizeTicket: mock() }));
const prisma = { ticket: { findUnique: mock(), updateMany: mock() } };
mock.module("./prisma.ts", () => ({ prisma }));

const { classifyTicketJob } = await import("./classify-ticket.ts");

let consoleError: ReturnType<typeof spyOn>;

beforeEach(() => {
  isAiConfigured.mockReset().mockReturnValue(true);
  classifyTicket.mockReset().mockResolvedValue(TicketCategory.TECHNICAL_QUESTION);
  // An unclassified ticket by default.
  prisma.ticket.findUnique
    .mockReset()
    .mockResolvedValue({ subject: "App crashes", category: null, messages: [{ body: "It crashes on start." }] });
  prisma.ticket.updateMany.mockReset().mockResolvedValue({ count: 1 });
  consoleError = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => consoleError.mockRestore());

describe("classifyTicketJob", () => {
  test("classifies the ticket's subject and first message", async () => {
    await classifyTicketJob("t1");

    expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
      where: { id: "t1" },
      select: { subject: true, category: true, messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } } },
    });
    expect(classifyTicket).toHaveBeenCalledWith({ subject: "App crashes", body: "It crashes on start." });
  });

  test("saves the category unless an agent has set one meanwhile", async () => {
    await classifyTicketJob("t1");

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", category: null },
      data: { category: TicketCategory.TECHNICAL_QUESTION },
    });
  });

  test("does nothing when AI isn't configured", async () => {
    isAiConfigured.mockReturnValue(false);

    await classifyTicketJob("t1");

    expect(prisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(classifyTicket).not.toHaveBeenCalled();
  });

  test.each([
    ["is gone", null],
    ["already has a category", { subject: "App crashes", category: TicketCategory.GENERAL_QUESTION, messages: [{ body: "Hi" }] }],
    ["has no message", { subject: "App crashes", category: null, messages: [] }],
  ])("does nothing when the ticket %s", async (_, ticket) => {
    prisma.ticket.findUnique.mockResolvedValue(ticket);

    await classifyTicketJob("t1");

    expect(classifyTicket).not.toHaveBeenCalled();
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
  });

  test("logs and rethrows a failed AI call so the job is retried, leaving the ticket unclassified", async () => {
    classifyTicket.mockRejectedValue(new Error("quota exceeded"));

    await expect(classifyTicketJob("t1")).rejects.toThrow("quota exceeded");

    expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("Couldn't classify ticket t1:", expect.any(Error));
  });

  test("logs and rethrows a failed save so the job is retried", async () => {
    prisma.ticket.updateMany.mockRejectedValue(new Error("connection lost"));

    await expect(classifyTicketJob("t1")).rejects.toThrow("connection lost");

    expect(consoleError).toHaveBeenCalledWith("Couldn't classify ticket t1:", expect.any(Error));
  });
});
