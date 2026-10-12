import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, CircleAlertIcon } from "lucide-react";
import { Link, useParams } from "react-router";
import { ReplyThread } from "@/components/ReplyThread.tsx";
import { TicketDetails } from "@/components/TicketDetails.tsx";
import { TicketReplyForm } from "@/components/TicketReplyForm.tsx";
import { TicketSummary } from "@/components/TicketSummary.tsx";
import { UpdateTicket } from "@/components/UpdateTicket.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import type { SenderType } from "@/lib/ticket.ts";
import type { TicketListItem } from "./TicketsPage.tsx";

// Shape of GET /api/tickets/:id (server/src/routes/tickets.ts).
export type TicketMessage = {
  id: string;
  senderType: SenderType;
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

  // TicketDetails shows the first message, the customer's original email; the rest of the thread follows it.
  const replies = ticket?.messages.slice(1) ?? [];

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
        // On wide screens the properties sit to the right of everything else. On narrow screens they come between
        // the details and the replies, so the controls aren't below a long conversation.
        <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            <TicketDetails ticket={ticket} />
            {/* Below the customer's message, so the summary sits next to what it summarizes. */}
            <TicketSummary key={ticket.id} ticketId={ticket.id} />
          </div>

          <aside aria-label="Ticket properties" className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <UpdateTicket ticket={ticket} />
          </aside>

          <div className="space-y-6 lg:col-start-1">
            <ReplyThread replies={replies} />

            <TicketReplyForm ticketId={ticket.id} />
          </div>
        </div>
      )}
    </div>
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
