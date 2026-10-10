import { TicketAssigneeSelect } from "@/components/TicketAssigneeSelect.tsx";
import { TicketField } from "@/components/TicketDetails.tsx";
import { TicketFieldSelect, type TicketFieldOption } from "@/components/TicketFieldSelect.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { TicketCategory, TicketStatus, ticketCategoryLabels, ticketStatusLabels } from "@/lib/ticket.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";

const statusOptions: TicketFieldOption[] = Object.values(TicketStatus).map((status) => ({
  value: status,
  label: ticketStatusLabels[status],
}));
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
              options={statusOptions}
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
