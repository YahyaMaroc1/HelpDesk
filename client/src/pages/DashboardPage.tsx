import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { TicketsPerDayChart, type DayCount } from "@/components/TicketsPerDayChart.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { api, apiErrorMessage } from "@/lib/api.ts";

// Shape of GET /api/dashboard (server/src/routes/dashboard.ts).
export type DashboardStats = {
  totalTickets: number;
  openTickets: number;
  aiResolvedTickets: number;
  // Null while no ticket is resolved or closed.
  averageResolutionSeconds: number | null;
  // The last 30 days in the viewer's time zone, oldest first.
  ticketsPerDay: DayCount[];
};

// Sent with the request so the server counts tickets by the viewer's days.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Stat = { label: string; value: string; hint: string };

export function DashboardPage() {
  const { data: stats, error, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async ({ signal }) => (await api.get<DashboardStats>("/dashboard", { signal, params: { tz: timeZone } })).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">How the support queue is doing across all tickets.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>Couldn't load the dashboard: {apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div role="status">
          <span className="sr-only">Loading dashboard…</span>
          <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton aria-hidden="true" className="mt-4 h-72 rounded-xl" />
        </div>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {dashboardStats(stats).map((stat) => (
            <Card key={stat.label} role="group" aria-label={stat.label}>
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{stat.hint}</CardContent>
            </Card>
          ))}
        </div>
      )}

      {stats && <TicketsPerDayChart days={stats.ticketsPerDay} />}
    </div>
  );
}

function dashboardStats(stats: DashboardStats): Stat[] {
  const { totalTickets, openTickets, aiResolvedTickets, averageResolutionSeconds } = stats;
  return [
    { label: "Total tickets", value: totalTickets.toLocaleString(), hint: "Every ticket received" },
    { label: "Open tickets", value: openTickets.toLocaleString(), hint: "Waiting for an agent" },
    {
      label: "Resolved by AI",
      value: aiResolvedTickets.toLocaleString(),
      hint: "Answered from the knowledge base, without an agent",
    },
    {
      label: "Resolved by AI (%)",
      value: totalTickets === 0 ? "—" : formatPercent(aiResolvedTickets / totalTickets),
      hint: "Share of all tickets",
    },
    {
      label: "Average resolution time",
      value: averageResolutionSeconds === null ? "—" : formatDuration(averageResolutionSeconds),
      hint: "From arrival to resolved or closed",
    },
  ];
}

export function formatPercent(ratio: number) {
  return ratio.toLocaleString(undefined, { style: "percent", maximumFractionDigits: 1 });
}

// The two largest units, e.g. "2d 5h", "3h 12m" or "45m"; under a minute is "< 1m".
export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "< 1m";
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}
