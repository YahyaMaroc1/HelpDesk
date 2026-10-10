import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, CircleAlertIcon } from "lucide-react";
import { Link, useParams } from "react-router";
import { TicketAssigneeSelect } from "@/components/TicketAssigneeSelect.tsx";
import { TicketStatusBadge } from "@/components/TicketStatusBadge.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import { MessageDirection, ticketCategoryLabels } from "@/lib/ticket.ts";
import { formatTicketDate, type TicketListItem } from "./TicketsPage.tsx";

// Shape of GET /api/tickets/:id (server/src/routes/tickets.ts).
export type TicketMessage = {
  id: string;
  direction: MessageDirection;
  body: string;
  senderEmail: string;
  senderName: string | null;
  createdAt: string;
};
export type TicketDetail = TicketListItem & {
  summary: string | null;
  updatedAt: string;
  messages: TicketMessage[];
};

export function TicketDetailPage() {
  const { id } = useParams() as { id: string };

  const { data: ticket, error } = useQuery({
    queryKey: ["tickets", id],
    queryFn: async ({ signal }) => (await api.get<{ ticket: TicketDetail }>(`/tickets/${id}`, { signal })).data.ticket,
  });

  return (
    <div className="space-y-6">
      <Link to="/tickets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        All tickets
      </Link>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>Couldn't load the ticket: {apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {!ticket && !error && <TicketDetailSkeleton />}

      {ticket && (
        <>
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold break-words">{ticket.subject}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <TicketStatusBadge status={ticket.status} />
              <Badge variant="outline">
                {ticket.category ? ticketCategoryLabels[ticket.category] : "Unclassified"}
              </Badge>
            </div>
          </div>

          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
            <TicketField label="Assignee">
              <TicketAssigneeSelect ticket={ticket} />
            </TicketField>
            <TicketField label="Created">{formatTicketDate(ticket.createdAt)}</TicketField>
            <TicketField label="Updated">{formatTicketDate(ticket.updatedAt)}</TicketField>
          </dl>

          {ticket.summary && (
            <section aria-labelledby="ticket-summary" className="space-y-2">
              <h2 id="ticket-summary" className="text-lg font-semibold">
                Summary
              </h2>
              <p className="text-sm whitespace-pre-wrap">{ticket.summary}</p>
            </section>
          )}

          <section aria-labelledby="ticket-messages" className="space-y-4">
            <h2 id="ticket-messages" className="text-lg font-semibold">
              Messages
            </h2>
            {ticket.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages.</p>
            ) : (
              <ol className="space-y-4">
                {ticket.messages.map((message) => (
                  <li key={message.id}>
                    <MessageCard message={message} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TicketField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

// One email in the thread. The body is plain text, so line breaks are kept as they arrived.
function MessageCard({ message }: { message: TicketMessage }) {
  const inbound = message.direction === MessageDirection.INBOUND;
  return (
    <Card className={inbound ? undefined : "bg-muted"}>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{message.senderName ?? message.senderEmail}</span>
          {message.senderName && <span className="text-muted-foreground"> &lt;{message.senderEmail}&gt;</span>}
          <span className="text-muted-foreground"> · {inbound ? "Customer" : "Reply"}</span>
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

// Placeholder shaped like the page. Hidden from assistive tech, which gets the status text instead.
function TicketDetailSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading ticket…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-96 max-w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
