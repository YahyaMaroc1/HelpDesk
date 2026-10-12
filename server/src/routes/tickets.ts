import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { SenderType, TicketCategory, TicketStatus } from "../generated/prisma/enums.ts";
import { isAiConfigured, polishReply, summarizeTicket } from "../lib/ai.ts";
import type { Session } from "../lib/auth.ts";
import { prisma } from "../lib/prisma.ts";
import { validate } from "../lib/validate.ts";

// Agents and admins: app.ts mounts this router behind requireAuth.
export const ticketsRouter = Router();

// Select fields explicitly so the list stays small and nothing is added to the response by accident.
const ticketListFields = {
  id: true,
  subject: true,
  senderEmail: true,
  senderName: true,
  status: true,
  category: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

// The statuses agents work with: they're the only ones listed and the only ones agents can set. NEW and PROCESSING
// tickets are still with the AI (lib/auto-resolve-ticket.ts), so agents don't start on them. Keep in sync with
// agentTicketStatuses in client/src/lib/ticket.ts.
const agentStatuses = [TicketStatus.OPEN, TicketStatus.RESOLVED, TicketStatus.CLOSED] as const;

// Keep in sync with client/src/pages/TicketsPage.tsx: the sortable columns are its table's column ids, the filters
// are its filter controls, and the page sizes are its page size options. Empty filter values mean "any".
const maxTicketPageSize = 100;
const pageMessage = "Page must be a whole number of at least 1";
const pageSizeMessage = `Page size must be a whole number from 1 to ${maxTicketPageSize}`;
const listTicketsQuerySchema = z.object({
  status: z.enum(agentStatuses, { error: "Invalid status" }).optional(),
  // "unclassified": tickets without a category.
  category: z.union([z.enum(TicketCategory), z.literal("unclassified")], { error: "Invalid category" }).optional(),
  // A user id, or "unassigned".
  assignee: z.string({ error: "Invalid assignee" }).trim().max(100, "Invalid assignee").optional(),
  // Matches the subject, sender email or sender name, ignoring case.
  q: z.string({ error: "Invalid search" }).trim().max(200, "Search must be at most 200 characters").optional(),
  sortBy: z
    .enum(["subject", "senderEmail", "status", "category", "assignee", "createdAt"], { error: "Invalid sort column" })
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"], { error: "Invalid sort order" }).default("desc"),
  // 1-based. A page past the end is empty, with the real `total`.
  page: z.coerce.number({ error: pageMessage }).int(pageMessage).min(1, pageMessage).default(1),
  pageSize: z.coerce
    .number({ error: pageSizeMessage })
    .int(pageSizeMessage)
    .min(1, pageSizeMessage)
    .max(maxTicketPageSize, pageSizeMessage)
    .default(10),
});
type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
type SortBy = ListTicketsQuery["sortBy"];

// Without a status filter, every status agents work with: NEW and PROCESSING tickets are left out.
function ticketFilters({ status, category, assignee, q }: ListTicketsQuery): Prisma.TicketWhereInput {
  return {
    status: status ?? { in: [...agentStatuses] },
    ...(category && { category: category === "unclassified" ? null : category }),
    ...(assignee && { assignedToId: assignee === "unassigned" ? null : assignee }),
    ...(q && {
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { senderEmail: { contains: q, mode: "insensitive" } },
        { senderName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
}

// Status sorts in enum order (Open, Resolved, Closed). Unclassified tickets sort last either way.
function sortColumn(sortBy: SortBy, order: Prisma.SortOrder): Prisma.TicketOrderByWithRelationInput {
  switch (sortBy) {
    case "category":
      return { category: { sort: order, nulls: "last" } };
    case "assignee":
      return { assignedTo: { name: order } };
    default:
      return { [sortBy]: order };
  }
}

// Newest first by default. `?sortBy=<column>&sortOrder=asc|desc` sorts by another column; the id breaks ties so
// equal values keep a stable order between requests. `status`, `category`, `assignee` and `q` filter the list.
// `page` and `pageSize` pick a page; `total` is the number of tickets matching the filters.
ticketsRouter.get("/", async (req, res) => {
  const query = validate(listTicketsQuerySchema, req.query, res);
  if (!query) return;

  const where = ticketFilters(query);
  const skip = (query.page - 1) * query.pageSize;
  const [tickets, total] = await Promise.all([
    query.sortBy === "assignee"
      ? ticketsByAssignee(where, query.sortOrder, skip, query.pageSize)
      : prisma.ticket.findMany({
          select: ticketListFields,
          where,
          orderBy: [sortColumn(query.sortBy, query.sortOrder), { id: query.sortOrder }],
          skip,
          take: query.pageSize,
        }),
    prisma.ticket.count({ where }),
  ]);
  res.json({ tickets, total });
});

// One page of tickets sorted by assignee name, with unassigned tickets last in both directions. Prisma has no
// `nulls` option when ordering by a relation field (and Postgres puts NULLs first when sorting descending), so this
// pages through the assigned tickets, then continues into the unassigned ones.
async function ticketsByAssignee(where: Prisma.TicketWhereInput, order: Prisma.SortOrder, skip: number, take: number) {
  const assignedWhere = { AND: [where, { assignedToId: { not: null } }] };
  const assignedCount = await prisma.ticket.count({ where: assignedWhere });
  const assigned =
    skip < assignedCount
      ? await prisma.ticket.findMany({
          select: ticketListFields,
          where: assignedWhere,
          orderBy: [{ assignedTo: { name: order } }, { id: order }],
          skip,
          take,
        })
      : [];
  if (assigned.length === take) return assigned;

  const unassigned = await prisma.ticket.findMany({
    select: ticketListFields,
    where: { AND: [where, { assignedToId: null }] },
    orderBy: { id: order },
    skip: Math.max(0, skip - assignedCount),
    take: take - assigned.length,
  });
  return [...assigned, ...unassigned];
}

const ticketParamsSchema = z.object({ id: z.string().min(1, "Ticket not found") });

// Select fields explicitly, as for the list. Messages leave out the email Message-ID, which is only for threading.
const ticketDetailFields = {
  ...ticketListFields,
  summary: true,
  updatedAt: true,
  messages: {
    select: { id: true, senderType: true, body: true, senderEmail: true, senderName: true, createdAt: true },
    // Oldest first, as a thread reads. The id breaks ties between messages saved in the same millisecond.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.TicketSelect;

// One ticket with its message thread.
ticketsRouter.get("/:id", async (req, res) => {
  const params = validate(ticketParamsSchema, req.params, res, 404);
  if (!params) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: ticketDetailFields });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  res.json({ ticket });
});

// Keep in sync with the pickers on client/src/pages/TicketDetailPage.tsx. Each field is optional and left as it is
// when missing, but a request must change at least one. `category` can't be cleared: tickets only start
// unclassified. `assignedToId` is an active user's id (from GET /api/assignees), or null to unassign the ticket.
const assigneeMessage = "Choose an assignee";
const updateTicketSchema = z
  .object({
    status: z.enum(agentStatuses, { error: "Invalid status" }).optional(),
    category: z.enum(TicketCategory, { error: "Invalid category" }).optional(),
    assignedToId: z
      .union([z.string().trim().min(1, assigneeMessage).max(100, assigneeMessage), z.null()], {
        error: assigneeMessage,
      })
      .optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), { error: "Nothing to update" });

const isResolved = (status: TicketStatus) => status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED;

// Changes a ticket's status, category or assignee and returns the updated ticket, as GET /api/tickets/:id does.
ticketsRouter.patch("/:id", async (req, res) => {
  const params = validate(ticketParamsSchema, req.params, res, 404);
  if (!params) return;
  const body = validate(updateTicketSchema, req.body, res);
  if (!body) return;
  const { id } = params;
  const { status, category, assignedToId } = body;

  const current = await prisma.ticket.findUnique({ where: { id }, select: { status: true } });
  if (!current) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  // Deleted users keep their row, so check they're still active.
  if (assignedToId && !(await prisma.user.findFirst({ where: { id: assignedToId, deletedAt: null }, select: { id: true } }))) {
    res.status(400).json({ error: "Assignee not found" });
    return;
  }

  // Prisma leaves undefined fields unchanged. resolvedAt is when the ticket was resolved or closed (a resolved ticket
  // that's closed keeps it) and is cleared when it's reopened.
  const resolvedAt =
    status === undefined || isResolved(status) === isResolved(current.status) ? undefined : isResolved(status) ? new Date() : null;
  const ticket = await prisma.ticket.update({
    where: { id },
    data: { status, category, assignedToId, resolvedAt },
    select: ticketDetailFields,
  });
  res.json({ ticket });
});

// Keep in sync with the reply form on client/src/components/TicketReplyForm.tsx.
const replyMessage = "Write a reply";
const maxReplyLength = 20_000;
const replySchema = z.object({
  body: z
    .string({ error: replyMessage })
    .trim()
    .min(1, replyMessage)
    .max(maxReplyLength, `Reply must be at most ${maxReplyLength.toLocaleString("en-US")} characters`),
});

// What POST /:id/replies/polish passes to polishReply (lib/ai.ts): the validated draft and the ticket's context.
export type PolishInput = { draft: string; subject: string; customerName: string | null; agentName: string };

// Adds the signed-in user's reply to the thread as an outbound message and returns the updated ticket, as
// GET /api/tickets/:id does. Not emailed yet: sending waits for the email provider (implementation plan 7.1).
ticketsRouter.post("/:id/replies", async (req, res) => {
  const params = validate(ticketParamsSchema, req.params, res, 404);
  if (!params) return;
  const body = validate(replySchema, req.body, res);
  if (!body) return;
  const user: Session["user"] = res.locals.user;

  if (!(await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } }))) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Creating the message through the ticket also bumps the ticket's updatedAt.
  const ticket = await prisma.ticket.update({
    where: { id: params.id },
    data: {
      messages: {
        create: {
          senderType: SenderType.AGENT,
          body: body.body,
          senderEmail: user.email,
          senderName: user.name,
        },
      },
    },
    select: ticketDetailFields,
  });
  res.status(201).json({ ticket });
});

// Rewrites the agent's draft reply with AI and returns it as `{ body }` without saving anything; the agent reviews it
// and sends it with POST /:id/replies. Takes the same body as that route.
ticketsRouter.post("/:id/replies/polish", async (req, res) => {
  const params = validate(ticketParamsSchema, req.params, res, 404);
  if (!params) return;
  const body = validate(replySchema, req.body, res);
  if (!body) return;
  const user: Session["user"] = res.locals.user;

  if (!isAiConfigured()) {
    res.status(503).json({ error: "Reply polishing isn't set up" });
    return;
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    select: { subject: true, senderName: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    const polished = await polishReply({
      draft: body.body,
      subject: ticket.subject,
      customerName: ticket.senderName,
      agentName: user.name,
    });
    res.json({ body: polished });
  } catch (err) {
    console.error("Polishing a reply failed:", err);
    res.status(502).json({ error: "The AI service didn't respond. Try again." });
  }
});

// What POST /:id/summary passes to summarizeTicket (lib/ai.ts): the ticket and its whole thread, oldest first.
export type SummaryInput = {
  subject: string;
  customerName: string | null;
  messages: { senderType: SenderType; senderName: string | null; senderEmail: string; body: string; createdAt: Date }[];
};

// Summarizes the ticket and its whole thread with AI and returns it as `{ summary }` without saving anything: the
// summary is only shown on the page until it's left or reloaded. Every request generates a new one.
ticketsRouter.post("/:id/summary", async (req, res) => {
  const params = validate(ticketParamsSchema, req.params, res, 404);
  if (!params) return;

  if (!isAiConfigured()) {
    res.status(503).json({ error: "Ticket summaries aren't set up" });
    return;
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    select: {
      subject: true,
      senderName: true,
      messages: {
        select: { senderType: true, senderName: true, senderEmail: true, body: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    const summary = await summarizeTicket({
      subject: ticket.subject,
      customerName: ticket.senderName,
      messages: ticket.messages,
    });
    res.json({ summary });
  } catch (err) {
    console.error("Summarizing a ticket failed:", err);
    res.status(502).json({ error: "The AI service didn't respond. Try again." });
  }
});
