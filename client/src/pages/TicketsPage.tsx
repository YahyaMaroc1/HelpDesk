import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import { TicketCategory, TicketStatus, ticketCategoryLabels, ticketStatusLabels } from "@/lib/ticket.ts";

// Shape of GET /api/tickets (server/src/routes/tickets.ts), newest first.
export type TicketListItem = {
  id: string;
  subject: string;
  senderEmail: string;
  senderName: string | null;
  status: TicketStatus;
  category: TicketCategory | null;
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
};

const statusVariants = {
  [TicketStatus.OPEN]: "default",
  [TicketStatus.RESOLVED]: "secondary",
  [TicketStatus.CLOSED]: "outline",
} as const satisfies Record<TicketStatus, string>;

// Date and time: several tickets usually arrive on the same day.
export const formatTicketDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function TicketsPage() {
  const { data: tickets, error, isPending } = useQuery({
    queryKey: ["tickets"],
    queryFn: async ({ signal }) => (await api.get<{ tickets: TicketListItem[] }>("/tickets", { signal })).data.tickets,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-muted-foreground">Support requests received by email, newest first.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>Couldn't load tickets: {apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TicketsTableSkeleton />}

      {tickets && (
        <Table>
          <TicketsTableHeader />
          <TableBody>
            {tickets.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No tickets yet.
                </TableCell>
              </TableRow>
            )}
            {tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell className="max-w-80 truncate font-medium" title={ticket.subject}>
                  {ticket.subject}
                </TableCell>
                <TableCell>
                  {ticket.senderName ? (
                    <>
                      <div>{ticket.senderName}</div>
                      <div className="text-xs text-muted-foreground">{ticket.senderEmail}</div>
                    </>
                  ) : (
                    ticket.senderEmail
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariants[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge>
                </TableCell>
                <TableCell className={ticket.category ? undefined : "text-muted-foreground"}>
                  {ticket.category ? ticketCategoryLabels[ticket.category] : "Unclassified"}
                </TableCell>
                <TableCell className={ticket.assignedTo ? undefined : "text-muted-foreground"}>
                  {ticket.assignedTo?.name ?? "Unassigned"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatTicketDate(ticket.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TicketsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Subject</TableHead>
        <TableHead>From</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Assignee</TableHead>
        <TableHead>Created</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// Placeholder rows shaped like the real ones. Hidden from assistive tech, which gets the status text instead.
function TicketsTableSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading tickets…</span>
      <Table aria-hidden="true">
        <TicketsTableHeader />
        <TableBody>
          {Array.from({ length: 5 }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-56" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
