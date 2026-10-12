import { TicketAssigneeSelect } from "@/components/TicketAssigneeSelect.tsx";
import { TicketField } from "@/components/TicketDetails.tsx";
import { TicketFieldSelect, type TicketFieldOption } from "@/components/TicketFieldSelect.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  agentTicketStatuses,
  TicketCategory,
  type TicketStatus,
  ticketCategoryLabels,
  ticketStatusLabels,
} from "@/lib/ticket.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";

const statusOptions: TicketFieldOption[] = agentTicketStatuses.map((status) => ({
  value: status,
  label: ticketStatusLabels[status],
}));
const isAgentStatus = (status: TicketStatus) => (agentTicketStatuses as readonly TicketStatus[]).includes(status);
const categoryOptions: TicketFieldOption[] = Object.values(TicketCategory).map((category) => ({
  value: category,
  label: ticketCategoryLabels[category],
}));
const unclassifiedOption: TicketFieldOption = { value: "", label: "Unclassified", disabled: true };

// The ticket's status, category and assignee, each saved as soon as another option is picked.
export function UpdateTicket({ ticket }: { ticket: TicketDetail }) {
  return (
    <Card size="sm">
      <CardContent>
        <dl className="grid gap-4 text-sm">
          <TicketField label="Status">
            <TicketFieldSelect
              ticketId={ticket.id}
              label="Status"
              value={ticket.status}
              // Agents can't set New or Processing (the AI is still on the ticket), so they're only there to show it.
              options={
                isAgentStatus(ticket.status)
                  ? statusOptions
                  : [{ value: ticket.status, label: ticketStatusLabels[ticket.status], disabled: true }, ...statusOptions]
              }
              toUpdate={(value) => ({ status: value as TicketStatus })}
              errorPrefix="Couldn't change the status"
            />
          </TicketField>
          <TicketField label="Category">
            <TicketFieldSelect
              ticketId={ticket.id}
              label="Category"
              value={ticket.category ?? ""}
              // A category can't be cleared, so "Unclassified" is only there to show an unclassified ticket.
              options={ticket.category ? categoryOptions : [unclassifiedOption, ...categoryOptions]}
              toUpdate={(value) => ({ category: value as TicketCategory })}
              errorPrefix="Couldn't change the category"
            />
          </TicketField>
          <TicketField label="Assignee">
            <TicketAssigneeSelect ticket={ticket} />
          </TicketField>
        </dl>
      </CardContent>
    </Card>
  );
}
