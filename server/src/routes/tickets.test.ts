import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express from "express";

// The router's database calls, stubbed so the tests need no database. Mocked before the router is imported, so
// lib/prisma.ts (which connects to DATABASE_URL) is never loaded.
const prisma = {
  ticket: { findUnique: mock(), update: mock() },
  user: { findFirst: mock() },
};
mock.module("../lib/prisma.ts", () => ({ prisma }));
const { ticketsRouter } = await import("./tickets.ts");

// The router on its own, behind express.json() as in app.ts. Sessions are checked by requireAuth in app.ts, not by
// the router, so these tests cover the route's own validation and lookups.
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
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
  prisma.ticket.findUnique.mockReset().mockResolvedValue({ id: ticket.id });
  prisma.ticket.update.mockReset().mockResolvedValue(updatedTicket);
  prisma.user.findFirst.mockReset().mockResolvedValue({ id: "u1" });
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
    ["a missing assignedToId", {}],
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

  test("answers 404 for a ticket that doesn't exist", async () => {
    prisma.ticket.findUnique.mockResolvedValue(null);

    const res = await patchTicket("missing", { assignedToId: "u1" });

    expect(res).toEqual({ status: 404, body: { error: "Ticket not found" } });
    expect(prisma.ticket.findUnique.mock.calls[0]?.[0]).toMatchObject({ where: { id: "missing" } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});
