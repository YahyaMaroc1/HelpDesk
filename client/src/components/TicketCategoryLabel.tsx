import { cn } from "cn";
import { TicketCategory, ticketCategoryLabels } from "@/lib/ticket.ts";

const categorySwatches = {
  [TicketCategory.GENERAL_QUESTION]: "bg-category-general",
  [TicketCategory.TECHNICAL_QUESTION]: "bg-category-technical",
  [TicketCategory.REFUND_REQUEST]: "bg-category-refund",
} as const satisfies Record<TicketCategory, string>;

// The category's name after a small colour square, so categories are told apart at a glance in lists.
export function TicketCategoryLabel({ category }: { category: TicketCategory }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px]", categorySwatches[category])} />
      {ticketCategoryLabels[category]}
    </span>
  );
}
