import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { SenderType } from "@/lib/ticket.ts";
import type { TicketMessage } from "@/pages/TicketDetailPage.tsx";
import { formatTicketDate } from "@/pages/TicketsPage.tsx";

// The messages after a ticket's original email, oldest first: agents' replies and the customer's follow-ups.
export function ReplyThread({ replies }: { replies: TicketMessage[] }) {
  return (
    <section aria-labelledby="ticket-replies" className="space-y-4">
      <h2 id="ticket-replies" className="text-lg font-semibold">
        Replies
      </h2>
      {replies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No replies yet.</p>
      ) : (
        <ol className="space-y-4">
          {replies.map((message) => (
            <li key={message.id}>
              <MessageCard message={message} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// One email in the thread. The body is plain text, so line breaks are kept as they arrived.
function MessageCard({ message }: { message: TicketMessage }) {
  const fromCustomer = message.senderType === SenderType.CUSTOMER;
  return (
    <Card className={fromCustomer ? undefined : "bg-muted"}>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{message.senderName ?? message.senderEmail}</span>
          {message.senderName && <span className="text-muted-foreground"> &lt;{message.senderEmail}&gt;</span>}
          <span className="text-muted-foreground"> · {fromCustomer ? "Customer" : "Agent"}</span>
        </div>
        <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
          {formatTicketDate(message.createdAt)}
        </time>
      </CardHeader>
      <CardContent>
        <p className="text-sm break-words whitespace-pre-wrap">{message.body}</p>
      </CardContent>
    </Card>
  );
}
