import { Router } from "express";
import { z } from "zod";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";
import { prisma } from "../lib/prisma.ts";
import { validate } from "../lib/validate.ts";

// Agents and admins: app.ts mounts this router behind requireAuth. The dashboard's figures, over all tickets
// (including the NEW and PROCESSING ones the AI is still working on).
export const dashboardRouter = Router();

// Tickets the AI answered and no agent replied to, that are still resolved or closed (a customer's reply reopens
// them).
const aiResolvedFilter = {
  status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
  messages: { some: { senderType: SenderType.AI }, none: { senderType: SenderType.AGENT } },
};

// How many days the tickets-per-day chart covers, today included.
export const ticketsPerDayDays = 30;

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// `tz` is the viewer's IANA time zone (e.g. "Africa/Casablanca"), so tickets are counted by their local day.
const dashboardQuerySchema = z.object({
  tz: z
    .string({ error: "Invalid time zone" })
    .max(100, "Invalid time zone")
    .refine(isTimeZone, "Invalid time zone")
    .default("UTC"),
});

dashboardRouter.get("/", async (req, res) => {
  const query = validate(dashboardQuerySchema, req.query, res);
  if (!query) return;
  const { tz } = query;

  const [totalTickets, openTickets, aiResolvedTickets, [average], ticketsPerDay] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: TicketStatus.OPEN } }),
    prisma.ticket.count({ where: aiResolvedFilter }),
    // From creation to resolution (or closing), over the tickets that are resolved or closed now. Null without any.
    prisma.$queryRaw<{ seconds: number | null }[]>`
      SELECT EXTRACT(EPOCH FROM AVG("resolvedAt" - "createdAt"))::float8 AS seconds
      FROM "ticket" WHERE "resolvedAt" IS NOT NULL`,
    // Tickets created on each of the last 30 days in `tz`, oldest first, with days without tickets as 0. createdAt is
    // stored in UTC without a zone, hence the double AT TIME ZONE.
    prisma.$queryRaw<{ date: string; count: number }[]>`
      SELECT to_char(day, 'YYYY-MM-DD') AS date, count(t."id")::int AS count
      FROM generate_series(
        (now() AT TIME ZONE ${tz})::date - ${ticketsPerDayDays - 1}::int,
        (now() AT TIME ZONE ${tz})::date,
        interval '1 day'
      ) AS day
      LEFT JOIN "ticket" t ON (t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = day::date
      GROUP BY day
      ORDER BY day`,
  ]);
  res.json({
    totalTickets,
    openTickets,
    aiResolvedTickets,
    averageResolutionSeconds: average?.seconds ?? null,
    ticketsPerDay,
  });
});
