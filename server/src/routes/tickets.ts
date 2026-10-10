import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { TicketCategory, TicketStatus } from "../generated/prisma/enums.ts";
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

// Keep in sync with client/src/pages/TicketsPage.tsx: the sortable columns are its table's column ids, and the
// filters are its filter controls. Empty filter values mean "any".
const listTicketsQuerySchema = z.object({
  status: z.enum(TicketStatus, { error: "Invalid status" }).optional(),
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
});
type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
type SortBy = ListTicketsQuery["sortBy"];

function ticketFilters({ status, category, assignee, q }: ListTicketsQuery): Prisma.TicketWhereInput {
  return {
    ...(status && { status }),
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
ticketsRouter.get("/", async (req, res) => {
  const query = validate(listTicketsQuerySchema, req.query, res);
  if (!query) return;

  const tickets = await prisma.ticket.findMany({
    select: ticketListFields,
    where: ticketFilters(query),
    orderBy: [sortColumn(query.sortBy, query.sortOrder), { id: query.sortOrder }],
  });

  // Prisma has no `nulls` option when ordering by a relation field, and Postgres puts NULLs first when sorting
  // descending, so move unassigned tickets to the end here. Pagination will need this done in SQL instead.
  if (query.sortBy === "assignee") {
    res.json({ tickets: [...tickets.filter((t) => t.assignedTo), ...tickets.filter((t) => !t.assignedTo)] });
    return;
  }
  res.json({ tickets });
});
