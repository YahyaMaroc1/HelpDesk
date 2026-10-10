import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, CircleAlertIcon } from "lucide-react";
import { Link, useParams } from "react-router";
import { TicketAssigneeSelect } from "@/components/TicketAssigneeSelect.tsx";
import { TicketFieldSelect, type TicketFieldOption } from "@/components/TicketFieldSelect.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import {
  MessageDirection,
  TicketCategory,
  TicketStatus,
  ticketCategoryLabels,
  ticketStatusLabels,
} from "@/lib/ticket.ts";
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

const statusOptions: TicketFieldOption[] = Object.values(TicketStatus).map((status) => ({
  value: status,
  label: ticketStatusLabels[status],
}));
const categoryOptions: TicketFieldOption[] = Object.values(TicketCategory).map((category) => ({
  value: category,
  label: ticketCategoryLabels[category],
}));
const unclassifiedOption: TicketFieldOption = { value: "", label: "Unclassified", disabled: true };

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
          <h1 className="text-2xl font-semibold break-words">{ticket.subject}</h1>

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-6">
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
            </div>

            {/* Above the thread on narrow screens, so the controls aren't below a long conversation. */}
            <aside aria-label="Ticket properties" className="order-first lg:order-none">
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
            </aside>
          </div>
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
        <Skeleton className="h-8 w-96 max-w-full" />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="order-first h-48 lg:order-none" />
        </div>
      </div>
    </div>
  );
}
