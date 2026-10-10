import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";

// Mirrors replySchema in POST /api/tickets/:id/replies (server/src/routes/tickets.ts).
const replyMessage = "Write a reply";
const maxReplyLength = 20_000;
const replySchema = z.object({
  body: z
    .string({ error: replyMessage })
    .trim()
    .min(1, replyMessage)
    .max(maxReplyLength, `Reply must be at most ${maxReplyLength.toLocaleString("en-US")} characters`),
});

type ReplyValues = z.infer<typeof replySchema>;

// Adds a reply to the ticket's thread. On success the thread shows it and the box is cleared for the next one.
export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReplyValues>({ resolver: zodResolver(replySchema), defaultValues: { body: "" } });

  const sendReply = useMutation({
    mutationFn: async (values: ReplyValues) =>
      (await api.post<{ ticket: TicketDetail }>(`/tickets/${ticketId}/replies`, values)).data.ticket,
    onSuccess: async (updated) => {
      queryClient.setQueryData(["tickets", ticketId], updated);
      reset();
      // The list shows when tickets were updated.
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => sendReply.mutate(values))} noValidate className="space-y-3">
      {sendReply.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>Couldn't send the reply: {apiErrorMessage(sendReply.error)}</AlertDescription>
        </Alert>
      )}
      <Field data-invalid={errors.body ? true : undefined}>
        <FieldLabel htmlFor="ticket-reply">Reply</FieldLabel>
        <Textarea
          id="ticket-reply"
          rows={5}
          className="max-h-96"
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? "ticket-reply-error" : undefined}
          readOnly={sendReply.isPending}
          {...register("body")}
        />
        <FieldError id="ticket-reply-error" errors={[errors.body]} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={sendReply.isPending}>
          {sendReply.isPending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
