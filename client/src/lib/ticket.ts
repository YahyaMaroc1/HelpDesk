import { TicketCategory, TicketStatus } from "../../../server/src/generated/prisma/enums.ts";

// The Prisma ticket enums (server/prisma/schema.prisma), re-exported like `Role` in role.ts so client code compares
// against the same constants as the server instead of string literals.
export { TicketCategory, TicketStatus };

export const ticketStatusLabels: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

export const ticketCategoryLabels: Record<TicketCategory, string> = {
  [TicketCategory.GENERAL_QUESTION]: "General question",
  [TicketCategory.TECHNICAL_QUESTION]: "Technical question",
  [TicketCategory.REFUND_REQUEST]: "Refund request",
};
