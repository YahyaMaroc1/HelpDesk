import { Card, CardContent } from "@/components/ui/card.tsx";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";
import { formatTicketDate } from "@/pages/TicketsPage.tsx";

// The basics of a ticket: its subject, sender, dates and the customer's original message (the first in the thread).
// The replies after it are shown by the page.
export function TicketDetails({ ticket }: { ticket: TicketDetail }) {
  const [original] = ticket.messages;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold break-words">{ticket.subject}</h1>

      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <TicketField label="From">
          {ticket.senderName ? (
            <>
              <div>{ticket.senderName}</div>
              <div className="text-muted-foreground">{ticket.senderEmail}</div>
            </>
          ) : (
            ticket.senderEmail
          )}
        </TicketField>
        <TicketField label="Created">{formatTicketDate(ticket.createdAt)}</TicketField>
        <TicketField label="Updated">{formatTicketDate(ticket.updatedAt)}</TicketField>
      </dl>

      <section aria-labelledby="ticket-message" className="space-y-4">
        <h2 id="ticket-message" className="text-lg font-semibold">
          Message
        </h2>
        {original ? (
          <Card>
            <CardContent>
              {/* Plain text, so line breaks are kept as they arrived. */}
              <p className="text-sm break-words whitespace-pre-wrap">{original.body}</p>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No message.</p>
        )}
      </section>
    </div>
  );
}

// A label and its value in a description list (<dl>).
export function TicketField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
