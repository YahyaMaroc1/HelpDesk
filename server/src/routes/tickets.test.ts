import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { SenderType, TicketCategory, TicketStatus } from "../generated/prisma/enums.ts";

// The router's database calls, stubbed so the tests need no database. Mocked before the router is imported, so
// lib/prisma.ts (which connects to DATABASE_URL) is never loaded.
const prisma = {
  ticket: { findMany: mock(), count: mock(), findUnique: mock(), update: mock() },
  user: { findFirst: mock() },
};
mock.module("../lib/prisma.ts", () => ({ prisma }));
// The AI calls, stubbed so the tests never reach Gemini.
const ai = {
  isAiConfigured: mock(),
  polishReply: mock(),
  summarizeTicket: mock(),
  classifyTicket: mock(),
  autoResolveTicket: mock(),
  aiSenderName: "AI Assistant",
};
mock.module("../lib/ai.ts", () => ai);
const { ticketsRouter } = await import("./tickets.ts");

// The router on its own, behind express.json() as in app.ts. Sessions are checked by requireAuth in app.ts, not by
// the router, so these tests cover the route's own validation and lookups. requireAuth's res.locals.user is set to
// `signedInUser`, which routes read for the author of a reply.
const signedInUser = { id: "u1", name: "Alan Agent", email: "alan@example.com" };
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.user = signedInUser;
    next();
  });
  app.use("/api/tickets", ticketsRouter);
  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const ticket = { id: "t1", subject: "Refund please" };
const updatedTicket = { ...ticket, assignedTo: { id: "u1", name: "Alan Agent" }, messages: [] };

beforeEach(() => {
  // An existing ticket and an active user by default; each test overrides what it needs.
  prisma.ticket.findMany.mockReset().mockResolvedValue([ticket]);
  prisma.ticket.count.mockReset().mockResolvedValue(1);
  prisma.ticket.findUnique.mockReset().mockResolvedValue({ id: ticket.id, status: TicketStatus.OPEN });
  prisma.ticket.update.mockReset().mockResolvedValue(updatedTicket);
  prisma.user.findFirst.mockReset().mockResolvedValue({ id: "u1" });
  ai.isAiConfigured.mockReset().mockReturnValue(true);
  ai.polishReply.mockReset().mockResolvedValue("Your refund is on its way. Thank you for your patience!");
  ai.summarizeTicket.mockReset().mockResolvedValue("Jane wants a refund; Alan said it's on its way.");
});

type ResponseBody = { ticket?: { assignedTo: unknown }; error?: string };

async function patchTicket(id: string, body: unknown) {
  const res = await fetch(`${baseUrl}/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ResponseBody };
}

describe("GET /api/tickets", () => {
  async function listTickets(query = "") {
    const res = await fetch(`${baseUrl}/api/tickets${query}`);
    return { status: res.status, body: (await res.json()) as { tickets?: unknown[]; total?: number; error?: string } };
  }

  const agentStatuses = { in: [TicketStatus.OPEN, TicketStatus.RESOLVED, TicketStatus.CLOSED] };

  test("returns a page of tickets and the total, leaving out NEW and PROCESSING tickets", async () => {
    const res = await listTickets();

    expect(res).toEqual({ status: 200, body: { tickets: [ticket], total: 1 } });
    const where = { status: agentStatuses };
    expect(prisma.ticket.findMany.mock.calls[0]?.[0]).toMatchObject({ where, skip: 0, take: 10 });
    expect(prisma.ticket.count).toHaveBeenCalledWith({ where });
  });

  test("filters by status, category and assignee", async () => {
    await listTickets(`?status=${TicketStatus.OPEN}&category=unclassified&assignee=unassigned`);

    const where = { status: TicketStatus.OPEN, category: null, assignedToId: null };
    expect(prisma.ticket.findMany.mock.calls[0]?.[0]).toMatchObject({ where });
    expect(prisma.ticket.count).toHaveBeenCalledWith({ where });
  });

  test("leaves out NEW and PROCESSING tickets when sorting by assignee too", async () => {
    await listTickets("?sortBy=assignee");

    expect(prisma.ticket.findMany).toHaveBeenCalled();
    for (const [{ where }] of prisma.ticket.findMany.mock.calls) {
      expect(where.AND[0]).toEqual({ status: agentStatuses });
    }
  });

  test.each([TicketStatus.NEW, TicketStatus.PROCESSING])("rejects filtering by %s with 400", async (status) => {
    const res = await listTickets(`?status=${status}`);

    expect(res).toEqual({ status: 400, body: { error: "Invalid status" } });
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/tickets/:id", () => {
  async function getTicket(id: string) {
    const res = await fetch(`${baseUrl}/api/tickets/${id}`);
    return { status: res.status, body: (await res.json()) as ResponseBody };
  }

  test("returns the ticket with its messages oldest first", async () => {
    prisma.ticket.findUnique.mockResolvedValue(updatedTicket);

    const res = await getTicket("t1");

    expect(res).toEqual({ status: 200, body: { ticket: updatedTicket } });
    expect(prisma.ticket.findUnique.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "t1" },
      select: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
  });

  test("leaves the email Message-ID out of the messages", async () => {
    await getTicket("t1");

    const { select } = prisma.ticket.findUnique.mock.calls[0]?.[0] as { select: { messages: { select: object } } };
    expect(select.messages.select).not.toHaveProperty("emailMessageId");
  });

  test("answers 404 for a ticket that doesn't exist", async () => {
    prisma.ticket.findUnique.mockResolvedValue(null);

    const res = await getTicket("missing");

    expect(res).toEqual({ status: 404, body: { error: "Ticket not found" } });
  });
});

describe("PATCH /api/tickets/:id", () => {
  test("assigns the ticket to an active user and returns the updated ticket", async () => {
    const res = await patchTicket("t1", { assignedToId: "u1" });

    expect(res).toEqual({ status: 200, body: { ticket: updatedTicket } });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { id: "u1", deletedAt: null }, select: { id: true } });
    expect(prisma.ticket.update).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({ where: { id: "t1" }, data: { assignedToId: "u1" } });
  });

  test("trims the user id", async () => {
    await patchTicket("t1", { assignedToId: "  u1  " });

    expect(prisma.user.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: "u1" } });
    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({ data: { assignedToId: "u1" } });
  });

  test("unassigns the ticket with null, without looking up a user", async () => {
    prisma.ticket.update.mockResolvedValue({ ...updatedTicket, assignedTo: null });

    const res = await patchTicket("t1", { assignedToId: null });

    expect(res.status).toBe(200);
    expect(res.body.ticket?.assignedTo).toBeNull();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({ where: { id: "t1" }, data: { assignedToId: null } });
  });

  test("rejects a user that doesn't exist or was deleted", async () => {
    // The lookup only matches users with deletedAt: null, so both cases find nothing.
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await patchTicket("t1", { assignedToId: "deleted-user" });

    expect(res).toEqual({ status: 400, body: { error: "Assignee not found" } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test.each([
    ["an empty string", { assignedToId: "" }],
    ["only whitespace", { assignedToId: "   " }],
    ["a number", { assignedToId: 42 }],
    ["an object", { assignedToId: { id: "u1" } }],
    ["an id over 100 characters", { assignedToId: "u".repeat(101) }],
  ])("rejects %s", async (_case, body) => {
    const res = await patchTicket("t1", body);

    expect(res).toEqual({ status: 400, body: { error: "Choose an assignee" } });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test("changes the status without touching the other fields", async () => {
    const res = await patchTicket("t1", { status: TicketStatus.RESOLVED });

    expect(res.status).toBe(200);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "t1" },
      data: { status: TicketStatus.RESOLVED, category: undefined, assignedToId: undefined },
    });
  });

  test("records when an open ticket is resolved", async () => {
    await patchTicket("t1", { status: TicketStatus.RESOLVED });

    expect(prisma.ticket.findUnique.mock.calls[0]?.[0]).toEqual({ where: { id: "t1" }, select: { status: true } });
    expect(prisma.ticket.update.mock.calls[0]?.[0].data.resolvedAt).toBeInstanceOf(Date);
  });

  test("records when an open ticket is closed", async () => {
    await patchTicket("t1", { status: TicketStatus.CLOSED });

    expect(prisma.ticket.update.mock.calls[0]?.[0].data.resolvedAt).toBeInstanceOf(Date);
  });

  test("keeps the resolution time when a resolved ticket is closed", async () => {
    prisma.ticket.findUnique.mockResolvedValue({ status: TicketStatus.RESOLVED });

    await patchTicket("t1", { status: TicketStatus.CLOSED });

    expect(prisma.ticket.update.mock.calls[0]?.[0].data).toMatchObject({ status: TicketStatus.CLOSED, resolvedAt: undefined });
  });

  test.each([TicketStatus.RESOLVED, TicketStatus.CLOSED])("clears the resolution time when a %s ticket is reopened", async (from) => {
    prisma.ticket.findUnique.mockResolvedValue({ status: from });

    await patchTicket("t1", { status: TicketStatus.OPEN });

    expect(prisma.ticket.update.mock.calls[0]?.[0].data).toMatchObject({ status: TicketStatus.OPEN, resolvedAt: null });
  });

  test("leaves the resolution time alone when the status doesn't change", async () => {
    prisma.ticket.findUnique.mockResolvedValue({ status: TicketStatus.RESOLVED });

    await patchTicket("t1", { status: TicketStatus.RESOLVED, category: TicketCategory.REFUND_REQUEST });

    expect(prisma.ticket.update.mock.calls[0]?.[0].data.resolvedAt).toBeUndefined();
  });

  test("changes the category", async () => {
    const res = await patchTicket("t1", { category: TicketCategory.TECHNICAL_QUESTION });

    expect(res.status).toBe(200);
    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({
      data: { status: undefined, category: TicketCategory.TECHNICAL_QUESTION, assignedToId: undefined, resolvedAt: undefined },
    });
  });

  test("changes several fields at once", async () => {
    await patchTicket("t1", { status: TicketStatus.CLOSED, category: TicketCategory.REFUND_REQUEST, assignedToId: "u1" });

    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({
      data: { status: TicketStatus.CLOSED, category: TicketCategory.REFUND_REQUEST, assignedToId: "u1" },
    });
  });

  test("rejects a request that changes nothing", async () => {
    const res = await patchTicket("t1", {});

    expect(res).toEqual({ status: 400, body: { error: "Nothing to update" } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test.each([
    ["an unknown status", { status: "PENDING" }, "Invalid status"],
    ["a lowercase status", { status: "open" }, "Invalid status"],
    ["a null status", { status: null }, "Invalid status"],
    ["the AI's NEW status", { status: TicketStatus.NEW }, "Invalid status"],
    ["the AI's PROCESSING status", { status: TicketStatus.PROCESSING }, "Invalid status"],
    ["an unknown category", { category: "BILLING" }, "Invalid category"],
    // Tickets only start unclassified; agents can't clear the category.
    ["a null category", { category: null }, "Invalid category"],
  ])("rejects %s", async (_case, body, error) => {
    const res = await patchTicket("t1", body);

    expect(res).toEqual({ status: 400, body: { error } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test("rejects the whole request when one field is invalid", async () => {
    const res = await patchTicket("t1", { status: TicketStatus.CLOSED, assignedToId: "" });

    expect(res).toEqual({ status: 400, body: { error: "Choose an assignee" } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test("answers 404 for a ticket that doesn't exist", async () => {
    prisma.ticket.findUnique.mockResolvedValue(null);

    const res = await patchTicket("missing", { status: TicketStatus.CLOSED });

    expect(res).toEqual({ status: 404, body: { error: "Ticket not found" } });
    expect(prisma.ticket.findUnique.mock.calls[0]?.[0]).toMatchObject({ where: { id: "missing" } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});

async function postReply(id: string, body: unknown) {
  const res = await fetch(`${baseUrl}/api/tickets/${id}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ResponseBody };
}

describe("POST /api/tickets/:id/replies", () => {
  test("saves the reply as an outbound message from the signed-in user and returns the updated ticket", async () => {
    const res = await postReply("t1", { body: "  Your refund is on its way.\nThanks!  " });

    expect(res).toEqual({ status: 201, body: { ticket: updatedTicket } });
    expect(prisma.ticket.update).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "t1" },
      data: {
        messages: {
          create: {
            senderType: SenderType.AGENT,
            body: "Your refund is on its way.\nThanks!",
            senderEmail: signedInUser.email,
            senderName: signedInUser.name,
          },
        },
      },
    });
  });

  test.each([
    [{}, "Write a reply"],
    [{ body: 42 }, "Write a reply"],
    [{ body: "   \n  " }, "Write a reply"],
    [{ body: "x".repeat(20_001) }, "Reply must be at most 20,000 characters"],
  ])("rejects %j", async (body, error) => {
    const res = await postReply("t1", body);

    expect(res).toEqual({ status: 400, body: { error } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test("accepts a reply of the maximum length", async () => {
    const res = await postReply("t1", { body: "x".repeat(20_000) });

    expect(res.status).toBe(201);
  });

  test("answers 404 for a ticket that doesn't exist", async () => {
    prisma.ticket.findUnique.mockResolvedValue(null);

    const res = await postReply("missing", { body: "Hello" });

    expect(res).toEqual({ status: 404, body: { error: "Ticket not found" } });
    expect(prisma.ticket.findUnique.mock.calls[0]?.[0]).toMatchObject({ where: { id: "missing" } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/tickets/:id/replies/polish", () => {
  async function polish(id: string, body: unknown) {
    const res = await fetch(`${baseUrl}/api/tickets/${id}/replies/polish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as { body?: string; error?: string } };
  }

  test("returns the polished draft without saving anything", async () => {
    prisma.ticket.findUnique.mockResolvedValue({ subject: "Refund please", senderName: "Jane Doe" });

    const res = await polish("t1", { body: "  ur refund is on its way  " });

    expect(res).toEqual({ status: 200, body: { body: "Your refund is on its way. Thank you for your patience!" } });
    expect(prisma.ticket.findUnique.mock.calls[0]?.[0]).toMatchObject({ where: { id: "t1" } });
    expect(ai.polishReply).toHaveBeenCalledWith({
      draft: "ur refund is on its way",
      subject: "Refund please",
      customerName: "Jane Doe",
      agentName: signedInUser.name,
    });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test("passes no customer name when the email had none", async () => {
    prisma.ticket.findUnique.mockResolvedValue({ subject: "Help", senderName: null });

    const res = await polish("t1", { body: "Hello" });

    expect(res.status).toBe(200);
    expect(ai.polishReply).toHaveBeenCalledWith(expect.objectContaining({ subject: "Help", customerName: null }));
  });

  test("accepts a draft of the maximum length", async () => {
    prisma.ticket.findUnique.mockResolvedValue({ subject: "Help", senderName: null });

    const res = await polish("t1", { body: "x".repeat(20_000) });

    expect(res.status).toBe(200);
  });

  test.each([
    [{}, "Write a reply"],
    [{ body: 42 }, "Write a reply"],
    [{ body: "   \n  " }, "Write a reply"],
    [{ body: "x".repeat(20_001) }, "Reply must be at most 20,000 characters"],
  ])("rejects %j", async (body, error) => {
    const res = await polish("t1", body);

    expect(res).toEqual({ status: 400, body: { error } });
    expect(ai.polishReply).not.toHaveBeenCalled();
  });

  test("answers 404 for a ticket that doesn't exist", async () => {
    prisma.ticket.findUnique.mockResolvedValue(null);

    const res = await polish("missing", { body: "Hello" });

    expect(res).toEqual({ status: 404, body: { error: "Ticket not found" } });
    expect(ai.polishReply).not.toHaveBeenCalled();
  });

  test("answers 503 when no Gemini API key is set", async () => {
    ai.isAiConfigured.mockReturnValue(false);

    const res = await polish("t1", { body: "Hello" });

    expect(res).toEqual({ status: 503, body: { error: "Reply polishing isn't set up" } });
    expect(prisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(ai.polishReply).not.toHaveBeenCalled();
  });

  test("answers 502 when the AI call fails", async () => {
    ai.polishReply.mockRejectedValue(new Error("timeout"));
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    const res = await polish("t1", { body: "Hello" });

    // The underlying error is logged, never sent to the client.
    expect(res).toEqual({ status: 502, body: { error: "The AI service didn't respond. Try again." } });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("POST /api/tickets/:id/summary", () => {
  async function summarize(id: string) {
    const res = await fetch(`${baseUrl}/api/tickets/${id}/summary`, { method: "POST" });
    return { status: res.status, body: (await res.json()) as { summary?: string; error?: string } };
  }

  const messages = [
    {
      senderType: SenderType.CUSTOMER,
      senderName: "Jane Doe",
      senderEmail: "jane@example.com",
      body: "Can I get a refund?",
      createdAt: new Date("2026-10-09T09:30:00.000Z"),
    },
    {
      senderType: SenderType.AGENT,
      senderName: "Alan Agent",
      senderEmail: "alan@example.com",
      body: "It's on its way.",
      createdAt: new Date("2026-10-10T11:00:00.000Z"),
    },
  ];

  beforeEach(() => {
    prisma.ticket.findUnique.mockResolvedValue({ subject: "Refund please", senderName: "Jane Doe", messages });
  });

  test("summarizes the whole thread and returns the summary without saving it", async () => {
    const res = await summarize("t1");

    expect(res).toEqual({ status: 200, body: { summary: "Jane wants a refund; Alan said it's on its way." } });
    expect(prisma.ticket.findUnique.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "t1" },
      select: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    expect(ai.summarizeTicket).toHaveBeenCalledWith({ subject: "Refund please", customerName: "Jane Doe", messages });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test("generates a new summary on every request", async () => {
    ai.summarizeTicket.mockResolvedValueOnce("First summary").mockResolvedValueOnce("Second summary");

    expect((await summarize("t1")).body).toEqual({ summary: "First summary" });
    expect((await summarize("t1")).body).toEqual({ summary: "Second summary" });
    expect(ai.summarizeTicket).toHaveBeenCalledTimes(2);
  });

  test("answers 404 for a ticket that doesn't exist", async () => {
    prisma.ticket.findUnique.mockResolvedValue(null);

    const res = await summarize("missing");

    expect(res).toEqual({ status: 404, body: { error: "Ticket not found" } });
    expect(ai.summarizeTicket).not.toHaveBeenCalled();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  test("answers 503 when no Gemini API key is set", async () => {
    ai.isAiConfigured.mockReturnValue(false);

    const res = await summarize("t1");

    expect(res).toEqual({ status: 503, body: { error: "Ticket summaries aren't set up" } });
    expect(prisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(ai.summarizeTicket).not.toHaveBeenCalled();
  });

  test("answers 502 when the AI call fails", async () => {
    ai.summarizeTicket.mockRejectedValue(new Error("timeout"));
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    const res = await summarize("t1");

    expect(res).toEqual({ status: 502, body: { error: "The AI service didn't respond. Try again." } });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
