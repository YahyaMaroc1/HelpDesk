import { SenderType, TicketCategory, TicketStatus } from "../../../server/src/generated/prisma/enums.ts";

// The Prisma ticket and message enums (server/prisma/schema.prisma), re-exported like `Role` in role.ts so client code compares
// against the same constants as the server instead of string literals.
export { SenderType, TicketCategory, TicketStatus };

export const ticketStatusLabels: Record<TicketStatus, string> = {
  [TicketStatus.NEW]: "New",
  [TicketStatus.PROCESSING]: "Processing",
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

// The statuses agents work with: the ticket list shows and filters only these, and agents can only set these. NEW and
// PROCESSING tickets are still with the AI. Keep in sync with agentStatuses in server/src/routes/tickets.ts.
export const agentTicketStatuses = [TicketStatus.OPEN, TicketStatus.RESOLVED, TicketStatus.CLOSED] as const;

export const ticketCategoryLabels: Record<TicketCategory, string> = {
  [TicketCategory.GENERAL_QUESTION]: "General Question",
  [TicketCategory.TECHNICAL_QUESTION]: "Technical Question",
  [TicketCategory.REFUND_REQUEST]: "Refund Request",
};
