import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";

type Props = {
  ticket: Pick<TicketDetail, "id" | "assignedTo">;
};

// Assigns the ticket to an active user, or unassigns it, as soon as another option is picked
// (PATCH /api/tickets/:id, updateTicketSchema in server/src/routes/tickets.ts). "" is "Unassigned".
export function TicketAssigneeSelect({ ticket }: Props) {
  const queryClient = useQueryClient();

  const { data: assignees, error: assigneesError } = useQuery({
    queryKey: ["assignees"],
    queryFn: async ({ signal }) =>
      (await api.get<{ assignees: { id: string; name: string }[] }>("/assignees", { signal })).data.assignees,
  });

  const assign = useMutation({
    mutationFn: async (assignedToId: string | null) =>
      (await api.patch<{ ticket: TicketDetail }>(`/tickets/${ticket.id}`, { assignedToId })).data.ticket,
    onSuccess: async (updated) => {
      queryClient.setQueryData(["tickets", ticket.id], updated);
      // The list shows the assignee and can be filtered and sorted by it.
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  // Show the choice being saved; afterwards, the ticket's assignee.
  const value = assign.isPending ? (assign.variables ?? "") : (ticket.assignedTo?.id ?? "");
  // A deleted user can still be assigned, but isn't in the list of active users.
  const current = ticket.assignedTo;
  const options = current && assignees && !assignees.some((user) => user.id === current.id) ? [...assignees, current] : assignees;

  return (
    <div className="space-y-1">
      <NativeSelect
        aria-label="Assignee"
        size="sm"
        value={value}
        disabled={!assignees || assign.isPending}
        onChange={(e) => assign.mutate(e.target.value || null)}
      >
        <NativeSelectOption value="">Unassigned</NativeSelectOption>
        {/* Until the list loads, the current assignee keeps the select from showing "Unassigned". */}
        {(options ?? (current ? [current] : [])).map((user) => (
          <NativeSelectOption key={user.id} value={user.id}>
            {user.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {assign.error && (
        <p role="alert" className="text-xs font-normal text-destructive">
          Couldn't assign the ticket: {apiErrorMessage(assign.error)}
        </p>
      )}
      {assigneesError && (
        <p role="alert" className="text-xs font-normal text-destructive">
          Couldn't load the assignees: {apiErrorMessage(assigneesError)}
        </p>
      )}
    </div>
  );
}
