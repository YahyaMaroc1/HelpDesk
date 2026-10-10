import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select.tsx";
import { TicketCategory, TicketStatus, ticketCategoryLabels, ticketStatusLabels } from "@/lib/ticket.ts";

// The ticket list's filters, as GET /api/tickets takes them (listTicketsQuerySchema in server/src/routes/tickets.ts).
// "" means "any".
export type TicketFilterValues = {
  q: string;
  status: TicketStatus | "";
  category: TicketCategory | "unclassified" | "";
  // A user id, or "unassigned".
  assignee: string;
};

export const noTicketFilters: TicketFilterValues = { q: "", status: "", category: "", assignee: "" };

export const hasTicketFilters = (filters: TicketFilterValues) =>
  Object.values(filters).some((value) => value.trim() !== "");

type Props = {
  value: TicketFilterValues;
  onChange: (value: TicketFilterValues) => void;
  // Active users, for the assignee filter (GET /api/assignees).
  assignees: { id: string; name: string }[];
};

export function TicketFilters({ value, onChange, assignees }: Props) {
  const set = <K extends keyof TicketFilterValues>(key: K, next: TicketFilterValues[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search tickets"
          placeholder="Search subject or sender…"
          className="pl-8"
          maxLength={200}
          value={value.q}
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      <NativeSelect
        aria-label="Status"
        value={value.status}
        onChange={(e) => set("status", e.target.value as TicketFilterValues["status"])}
      >
        <NativeSelectOption value="">All statuses</NativeSelectOption>
        {Object.values(TicketStatus).map((status) => (
          <NativeSelectOption key={status} value={status}>
            {ticketStatusLabels[status]}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Category"
        value={value.category}
        onChange={(e) => set("category", e.target.value as TicketFilterValues["category"])}
      >
        <NativeSelectOption value="">All categories</NativeSelectOption>
        {Object.values(TicketCategory).map((category) => (
          <NativeSelectOption key={category} value={category}>
            {ticketCategoryLabels[category]}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value="unclassified">Unclassified</NativeSelectOption>
      </NativeSelect>

      <NativeSelect aria-label="Assignee" value={value.assignee} onChange={(e) => set("assignee", e.target.value)}>
        <NativeSelectOption value="">All assignees</NativeSelectOption>
        <NativeSelectOption value="unassigned">Unassigned</NativeSelectOption>
        {assignees.map((user) => (
          <NativeSelectOption key={user.id} value={user.id}>
            {user.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {hasTicketFilters(value) && (
        <Button variant="ghost" onClick={() => onChange(noTicketFilters)}>
          <XIcon />
          Clear filters
        </Button>
      )}
    </div>
  );
}
