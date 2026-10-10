import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  FlexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type Column,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CircleAlertIcon } from "lucide-react";
import { useState } from "react";
import { hasTicketFilters, noTicketFilters, TicketFilters, type TicketFilterValues } from "@/components/TicketFilters.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts";
import { api, apiErrorMessage } from "@/lib/api.ts";
import { TicketCategory, TicketStatus, ticketCategoryLabels, ticketStatusLabels } from "@/lib/ticket.ts";

// Shape of GET /api/tickets (server/src/routes/tickets.ts).
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

// The column ids, which are also the API's `sortBy` values (listTicketsQuerySchema in server/src/routes/tickets.ts).
export type TicketSortColumn = "subject" | "senderEmail" | "status" | "category" | "assignee" | "createdAt";
export type TicketSortOrder = "asc" | "desc";

const statusVariants = {
  [TicketStatus.OPEN]: "default",
  [TicketStatus.RESOLVED]: "secondary",
  [TicketStatus.CLOSED]: "outline",
} as const satisfies Record<TicketStatus, string>;

// Date and time: several tickets usually arrive on the same day.
export const formatTicketDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// Module level so the table doesn't rebuild them on every render.
const features = tableFeatures({ rowSortingFeature });
const column = createColumnHelper<typeof features, TicketListItem>();
const columns = column.columns([
  column.accessor("subject", {
    header: "Subject",
    cell: ({ row }) => (
      <div className="max-w-80 truncate font-medium" title={row.original.subject}>
        {row.original.subject}
      </div>
    ),
  }),
  column.accessor("senderEmail", {
    header: "From",
    cell: ({ row: { original: ticket } }) =>
      ticket.senderName ? (
        <>
          <div>{ticket.senderName}</div>
          <div className="text-xs text-muted-foreground">{ticket.senderEmail}</div>
        </>
      ) : (
        ticket.senderEmail
      ),
  }),
  column.accessor("status", {
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={statusVariants[row.original.status]}>{ticketStatusLabels[row.original.status]}</Badge>
    ),
  }),
  column.accessor("category", {
    header: "Category",
    cell: ({ row }) =>
      row.original.category ? (
        ticketCategoryLabels[row.original.category]
      ) : (
        <span className="text-muted-foreground">Unclassified</span>
      ),
  }),
  column.accessor((ticket) => ticket.assignedTo?.name, {
    id: "assignee",
    header: "Assignee",
    cell: ({ row }) => row.original.assignedTo?.name ?? <span className="text-muted-foreground">Unassigned</span>,
  }),
  column.accessor("createdAt", {
    header: "Created",
    cell: ({ row }) => <span className="whitespace-nowrap">{formatTicketDate(row.original.createdAt)}</span>,
  }),
]);

const defaultSorting: SortingState = [{ id: "createdAt", desc: true }];
const searchDebounceMs = 300;
const noTickets: TicketListItem[] = [];

export function TicketsPage() {
  // One column at a time, always sorted (no unsorted state). The server does the sorting.
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const sort = sorting[0] ?? defaultSorting[0]!;
  const sortBy = sort.id as TicketSortColumn;
  const sortOrder: TicketSortOrder = sort.desc ? "desc" : "asc";

  // The filters are applied on the server too. The search waits until typing pauses.
  const [filters, setFilters] = useState<TicketFilterValues>(noTicketFilters);
  const q = useDebouncedValue(filters.q.trim(), searchDebounceMs);
  // Only the filters that are set, so the request and the query key leave out the others.
  const filterParams = Object.fromEntries(Object.entries({ ...filters, q }).filter(([, value]) => value !== ""));
  const params = { ...filterParams, sortBy, sortOrder };

  const {
    data: tickets,
    error,
    isPending,
    isPlaceholderData,
  } = useQuery({
    queryKey: ["tickets", params],
    queryFn: async ({ signal }) =>
      (await api.get<{ tickets: TicketListItem[] }>("/tickets", { params, signal })).data.tickets,
    // Keep showing the current rows while another sort or filter loads, instead of the skeleton.
    placeholderData: keepPreviousData,
  });

  // For the assignee filter. If it fails, the filter still offers "Unassigned".
  const { data: assignees } = useQuery({
    queryKey: ["assignees"],
    queryFn: async ({ signal }) =>
      (await api.get<{ assignees: { id: string; name: string }[] }>("/assignees", { signal })).data.assignees,
  });

  const table = useTable({
    features,
    columns,
    data: tickets ?? noTickets,
    getRowId: (ticket) => ticket.id,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-muted-foreground">Support requests received by email.</p>
      </div>

      <TicketFilters value={filters} onChange={setFilters} assignees={assignees ?? []} />

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>Couldn't load tickets: {apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TicketsTableSkeleton />}

      {tickets && (
        <Table aria-busy={isPlaceholderData} className={isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} aria-sort={ariaSort(header.column)}>
                    <SortableHeader column={header.column}>
                      <FlexRender header={header} />
                    </SortableHeader>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tickets.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  {hasTicketFilters(filters) ? "No tickets match these filters." : "No tickets yet."}
                </TableCell>
              </TableRow>
            )}
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

type TicketColumn = Column<typeof features, TicketListItem>;

function ariaSort(column: TicketColumn) {
  const direction = column.getIsSorted();
  return direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined;
}

// A header button that sorts by its column, with an arrow showing the current direction.
function SortableHeader({ column, children }: { column: TicketColumn; children: React.ReactNode }) {
  const direction = column.getIsSorted();
  const Icon = direction === "asc" ? ArrowUpIcon : direction === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
  return (
    <Button variant="ghost" size="sm" className="-ml-2.5" onClick={column.getToggleSortingHandler()}>
      {children}
      <Icon className={direction ? undefined : "text-muted-foreground"} aria-hidden="true" />
    </Button>
  );
}

// Column labels only, for the loading skeleton.
function TicketsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        {columns.map((col) => (
          <TableHead key={col.id ?? String(col.header)}>{String(col.header)}</TableHead>
        ))}
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
