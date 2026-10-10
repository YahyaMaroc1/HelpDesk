import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import type { TicketCategory, TicketStatus } from "@/lib/ticket.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";

// The body of PATCH /api/tickets/:id (updateTicketSchema in server/src/routes/tickets.ts): only the fields to change.
export type TicketUpdate = { status?: TicketStatus; category?: TicketCategory; assignedToId?: string | null };

export type TicketFieldOption = { value: string; label: string; disabled?: boolean };

type Props = {
  ticketId: string;
  label: string;
  // The current value, as one of the options' values.
  value: string;
  options: TicketFieldOption[];
  // The update to send when another option is picked.
  toUpdate: (value: string) => TicketUpdate;
  // Starts the error message, e.g. "Couldn't change the status".
  errorPrefix: string;
  disabled?: boolean;
};

// A select that saves one field of a ticket as soon as another option is picked. While saving it shows the
// choice and is disabled; afterwards the ticket (and the cached ticket list) show the change.
export function TicketFieldSelect({ ticketId, label, value, options, toUpdate, errorPrefix, disabled }: Props) {
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: async (option: string) =>
      (await api.patch<{ ticket: TicketDetail }>(`/tickets/${ticketId}`, toUpdate(option))).data.ticket,
    onSuccess: async (updated) => {
      queryClient.setQueryData(["tickets", ticketId], updated);
      // The list shows these fields and can be filtered and sorted by them.
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return (
    <div className="space-y-1">
      <NativeSelect
        aria-label={label}
        className="w-full"
        value={update.isPending ? update.variables : value}
        disabled={disabled || update.isPending}
        onChange={(e) => update.mutate(e.target.value)}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {update.error && (
        <p role="alert" className="text-xs font-normal text-destructive">
          {errorPrefix}: {apiErrorMessage(update.error)}
        </p>
      )}
    </div>
  );
}
