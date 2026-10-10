import { MessageDirection, TicketCategory, TicketStatus } from "../../../server/src/generated/prisma/enums.ts";

// The Prisma ticket and message enums (server/prisma/schema.prisma), re-exported like `Role` in role.ts so client code compares
// against the same constants as the server instead of string literals.
export { MessageDirection, TicketCategory, TicketStatus };

export const ticketStatusLabels: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

export const ticketCategoryLabels: Record<TicketCategory, string> = {
  [TicketCategory.GENERAL_QUESTION]: "General Question",
  [TicketCategory.TECHNICAL_QUESTION]: "Technical Question",
  [TicketCategory.REFUND_REQUEST]: "Refund Request",
};
