import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon, SparklesIcon } from "lucide-react";
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
// "Polish" rewrites the draft with AI (POST /api/tickets/:id/replies/polish) and puts the result in the box for the
// agent to review before sending.
export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
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

  const polishReply = useMutation({
    mutationFn: async (values: ReplyValues) =>
      (await api.post<{ body: string }>(`/tickets/${ticketId}/replies/polish`, values)).data.body,
    onSuccess: (polished) => setValue("body", polished, { shouldDirty: true }),
  });

  const busy = sendReply.isPending || polishReply.isPending;
  // Sending and polishing are disabled until there's a reply, rather than showing "Write a reply" on an empty box.
  const empty = !watch("body").trim();
  const error = sendReply.error
    ? `Couldn't send the reply: ${apiErrorMessage(sendReply.error)}`
    : polishReply.error && `Couldn't polish the reply: ${apiErrorMessage(polishReply.error)}`;

  return (
    <form
      onSubmit={handleSubmit((values) => {
        polishReply.reset();
        sendReply.mutate(values);
      })}
      noValidate
      className="space-y-3"
    >
      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
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
          readOnly={busy}
          {...register("body")}
        />
        <FieldError id="ticket-reply-error" errors={[errors.body]} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || empty}
          onClick={handleSubmit((values) => {
            sendReply.reset();
            polishReply.mutate(values);
          })}
        >
          <SparklesIcon />
          {polishReply.isPending ? "Polishing…" : "Polish"}
        </Button>
        <Button type="submit" disabled={busy || empty}>
          {sendReply.isPending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
