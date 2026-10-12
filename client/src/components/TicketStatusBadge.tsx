import { Badge } from "@/components/ui/badge.tsx";
import { TicketStatus, ticketStatusLabels } from "@/lib/ticket.ts";

const statusVariants = {
  [TicketStatus.NEW]: "outline",
  [TicketStatus.PROCESSING]: "outline",
  [TicketStatus.OPEN]: "default",
  [TicketStatus.RESOLVED]: "secondary",
  [TicketStatus.CLOSED]: "outline",
} as const satisfies Record<TicketStatus, string>;

// Open is the brand colour (work waiting), resolved is green, the rest are outlined.
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge
      variant={statusVariants[status]}
      className={status === TicketStatus.RESOLVED ? "bg-success-muted text-success" : undefined}
    >
      {ticketStatusLabels[status]}
    </Badge>
  );
}
