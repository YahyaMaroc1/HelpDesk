import { useMutation } from "@tanstack/react-query";
import { CircleAlertIcon, SparklesIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";

// A "Summarize" button that summarizes the ticket and its whole thread with AI (POST /api/tickets/:id/summary) and
// shows the result below it. Nothing is saved: the summary lives in the mutation's state, so it's gone when the page
// is left or reloaded. Every click generates a new one. The page keys this by ticket id, so another ticket starts
// without the previous ticket's summary.
export function TicketSummary({ ticketId }: { ticketId: string }) {
  const summarize = useMutation({
    mutationFn: async () => (await api.post<{ summary: string }>(`/tickets/${ticketId}/summary`)).data.summary,
  });

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" disabled={summarize.isPending} onClick={() => summarize.mutate()}>
        <SparklesIcon />
        {summarize.isPending ? "Summarizing…" : "Summarize"}
      </Button>

      {summarize.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>Couldn't summarize the ticket: {apiErrorMessage(summarize.error)}</AlertDescription>
        </Alert>
      )}

      {summarize.data && (
        <section aria-labelledby="ticket-summary" className="space-y-2">
          <h2 id="ticket-summary" className="text-lg font-semibold">
            Summary
          </h2>
          <Card>
            <CardContent>
              <p className="text-sm break-words whitespace-pre-wrap">{summarize.data}</p>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
