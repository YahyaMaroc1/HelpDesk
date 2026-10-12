import { Badge } from "@/components/ui/badge.tsx";
import { TicketStatus, ticketStatusLabels } from "@/lib/ticket.ts";

const statusVariants = {
  [TicketStatus.NEW]: "outline",
  [TicketStatus.PROCESSING]: "outline",
  [TicketStatus.OPEN]: "default",
  [TicketStatus.RESOLVED]: "secondary",
  [TicketStatus.CLOSED]: "outline",
} as const satisfies Record<TicketStatus, string>;

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={statusVariants[status]}>{ticketStatusLabels[status]}</Badge>;
}
