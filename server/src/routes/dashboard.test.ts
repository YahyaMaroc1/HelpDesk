import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";

// The router's database calls, stubbed so the tests need no database. Mocked before the router is imported, so
// lib/prisma.ts (which connects to DATABASE_URL) is never loaded.
const prisma = { ticket: { count: mock() }, $queryRaw: mock() };
mock.module("../lib/prisma.ts", () => ({ prisma }));
const { dashboardRouter } = await import("./dashboard.ts");

// The router on its own, as in app.ts. Sessions are checked by requireAuth in app.ts, not by the router.
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use("/api/dashboard", dashboardRouter);
  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const aiResolvedWhere = {
  status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
  messages: { some: { senderType: SenderType.AI }, none: { senderType: SenderType.AGENT } },
};

beforeEach(() => {
  // 40 tickets, 12 open and 10 resolved by the AI, by default.
  prisma.ticket.count.mockReset().mockImplementation(async (args?: { where?: unknown }) => {
    if (!args?.where) return 40;
    if (JSON.stringify(args.where) === JSON.stringify({ status: TicketStatus.OPEN })) return 12;
    if (JSON.stringify(args.where) === JSON.stringify(aiResolvedWhere)) return 10;
    throw new Error(`Unexpected count: ${JSON.stringify(args)}`);
  });
  prisma.$queryRaw.mockReset().mockImplementation(async (sql: TemplateStringsArray) =>
    sql.join("?").includes("generate_series") ? ticketsPerDay : [{ seconds: 5400.5 }],
  );
});

const ticketsPerDay = [
  { date: "2026-10-11", count: 0 },
  { date: "2026-10-12", count: 3 },
];

// A raw query the route ran, as its SQL text and parameters: the tickets-per-day one or the average one.
function rawQuery(perDay: boolean) {
  const call = prisma.$queryRaw.mock.calls.find(
    ([sql]) => (sql as TemplateStringsArray).join("?").includes("generate_series") === perDay,
  );
  const [sql, ...params] = call as [TemplateStringsArray, ...unknown[]];
  return { sql: sql.join("?"), params };
}

async function getDashboard(query = "") {
  const res = await fetch(`${baseUrl}/api/dashboard${query}`);
  return { status: res.status, body: await res.json() };
}

describe("GET /api/dashboard", () => {
  test("returns the ticket counts and the average resolution time", async () => {
    const res = await getDashboard();

    expect(res).toEqual({
      status: 200,
      body: { totalTickets: 40, openTickets: 12, aiResolvedTickets: 10, averageResolutionSeconds: 5400.5, ticketsPerDay },
    });
    expect(prisma.ticket.count).toHaveBeenCalledTimes(3);
  });

  test("averages the resolution time over the resolved tickets", async () => {
    await getDashboard();

    const { sql } = rawQuery(false);
    expect(sql).toContain('AVG("resolvedAt" - "createdAt")');
    expect(sql).toContain('WHERE "resolvedAt" IS NOT NULL');
  });

  test("answers null for the average when no ticket is resolved", async () => {
    prisma.ticket.count.mockResolvedValue(0);
    prisma.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
      sql.join("?").includes("generate_series") ? ticketsPerDay : [{ seconds: null }],
    );

    const res = await getDashboard();

    expect(res.body).toMatchObject({ totalTickets: 0, openTickets: 0, aiResolvedTickets: 0, averageResolutionSeconds: null });
  });

  test("counts the tickets of each of the last 30 days in the viewer's time zone", async () => {
    await getDashboard("?tz=Africa%2FCasablanca");

    const { sql, params } = rawQuery(true);
    expect(sql).toContain("generate_series");
    expect(sql).toContain('LEFT JOIN "ticket"');
    expect(params).toEqual(["Africa/Casablanca", 29, "Africa/Casablanca", "Africa/Casablanca"]);
  });

  test("counts the days in UTC without a time zone", async () => {
    await getDashboard();

    expect(rawQuery(true).params).toEqual(["UTC", 29, "UTC", "UTC"]);
  });

  test.each([
    ["an unknown time zone", "?tz=Mars%2FOlympus"],
    ["an empty time zone", "?tz="],
    ["a time zone over 100 characters", `?tz=${"a".repeat(101)}`],
    ["several time zones", "?tz=UTC&tz=Europe%2FParis"],
  ])("rejects %s", async (_case, query) => {
    const res = await getDashboard(query);

    expect(res).toEqual({ status: 400, body: { error: "Invalid time zone" } });
    expect(prisma.ticket.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
