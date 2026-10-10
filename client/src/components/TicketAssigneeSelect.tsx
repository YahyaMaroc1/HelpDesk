import { useQuery } from "@tanstack/react-query";
import { TicketFieldSelect } from "@/components/TicketFieldSelect.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";

type Props = {
  ticket: Pick<TicketDetail, "id" | "assignedTo">;
};

// Assigns the ticket to an active user (GET /api/assignees), or unassigns it. "" is "Unassigned".
export function TicketAssigneeSelect({ ticket }: Props) {
  const { data: assignees, error } = useQuery({
    queryKey: ["assignees"],
    queryFn: async ({ signal }) =>
      (await api.get<{ assignees: { id: string; name: string }[] }>("/assignees", { signal })).data.assignees,
  });

  const current = ticket.assignedTo;
  // A deleted user can still be assigned, but isn't in the list of active users. Until the list loads, the current
  // assignee keeps the select from showing "Unassigned".
  const users = assignees
    ? current && !assignees.some((user) => user.id === current.id)
      ? [...assignees, current]
      : assignees
    : current
      ? [current]
      : [];

  return (
    <div className="space-y-1">
      <TicketFieldSelect
        ticketId={ticket.id}
        label="Assignee"
        value={current?.id ?? ""}
        options={[{ value: "", label: "Unassigned" }, ...users.map((user) => ({ value: user.id, label: user.name }))]}
        toUpdate={(value) => ({ assignedToId: value || null })}
        errorPrefix="Couldn't assign the ticket"
        disabled={!assignees}
      />
      {error && (
        <p role="alert" className="text-xs font-normal text-destructive">
          Couldn't load the assignees: {apiErrorMessage(error)}
        </p>
      )}
    </div>
  );
}
