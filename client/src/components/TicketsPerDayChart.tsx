import { useState } from "react";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

// One day of GET /api/dashboard's ticketsPerDay: a local "YYYY-MM-DD" date and the tickets created that day.
export type DayCount = { date: string; count: number };

// "2026-10-12" as a local date (new Date("2026-10-12") is UTC midnight, which is the previous day west of UTC).
function parseDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

const shortDate = (date: string) => parseDay(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const longDate = (date: string) =>
  parseDay(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
export const ticketCount = (count: number) => `${count.toLocaleString()} ${count === 1 ? "ticket" : "tickets"}`;

// The y-axis values: 0 up to the busiest day, in steps of 1, 2 or 5 × 10^n with at most 4 steps.
export function axisTicks(max: number) {
  const highest = Math.max(max, 1);
  let step: number | undefined;
  for (let magnitude = 1; !step; magnitude *= 10) {
    step = [1, 2, 5].map((m) => m * magnitude).find((s) => highest / s <= 4);
  }
  const steps = Math.ceil(highest / step);
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

// A bar chart of the tickets created on each day, oldest first. The bars are for sighted users (with a tooltip on
// hover); screen readers get the same numbers from a visually hidden table.
export function TicketsPerDayChart({ days }: { days: DayCount[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const ticks = axisTicks(Math.max(0, ...days.map((d) => d.count)));
  const top = ticks.at(-1)!;
  const percent = (value: number) => `${(value / top) * 100}%`;
  // Positions across the plot: where the i-th bar starts, and its middle.
  const edge = (i: number) => `${(i / days.length) * 100}%`;
  const center = (i: number) => edge(i + 0.5);
  const hoveredDay = hovered === null ? null : days[hovered];
  // The tooltip is centered over its bar, but lines up with the bar's outer side near either end, to stay in the plot.
  const tooltip =
    hovered === null
      ? null
      : hovered < 3
        ? { left: edge(hovered), className: "" }
        : hovered > days.length - 4
          ? { left: edge(hovered + 1), className: "-translate-x-full" }
          : { left: center(hovered), className: "-translate-x-1/2" };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets per day</CardTitle>
        <CardDescription>Last {days.length} days</CardDescription>
      </CardHeader>
      <CardContent>
        <div aria-hidden="true" className="flex gap-2">
          <div className="relative h-48 w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {ticks.map((tick) => (
              <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: percent(tick) }}>
                {tick.toLocaleString()}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-48">
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-border" : "border-border/50 border-dashed")}
                  style={{ bottom: percent(tick) }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-0.5" onMouseLeave={() => setHovered(null)}>
                {days.map((day, i) => (
                  // The whole column is the hover target, so short and empty days are easy to point at.
                  <div
                    key={day.date}
                    role="img"
                    aria-label={`${longDate(day.date)}: ${ticketCount(day.count)}`}
                    className="flex h-full min-w-0 flex-1 items-end"
                    onMouseEnter={() => setHovered(i)}
                  >
                    <div
                      className={cn(
                        "w-full rounded-t-[4px] bg-chart-2 transition-opacity",
                        hovered !== null && hovered !== i && "opacity-50",
                      )}
                      style={{ height: percent(day.count), minHeight: day.count > 0 ? 2 : 0 }}
                    />
                  </div>
                ))}
              </div>
              {hoveredDay && tooltip && (
                <div
                  className={cn(
                    "pointer-events-none absolute z-10 mb-1 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md",
                    tooltip.className,
                  )}
                  style={{ left: tooltip.left, bottom: percent(hoveredDay.count) }}
                >
                  <div className="text-muted-foreground">{longDate(hoveredDay.date)}</div>
                  <div className="font-medium tabular-nums">{ticketCount(hoveredDay.count)}</div>
                </div>
              )}
            </div>
            {/* A date under every 7th bar, counting back from today. */}
            <div className="relative mt-1 h-4 text-xs text-muted-foreground">
              {days.map((day, i) =>
                (days.length - 1 - i) % 7 === 0 ? (
                  <span
                    key={day.date}
                    className={cn("absolute whitespace-nowrap", i === days.length - 1 ? "right-0" : "-translate-x-1/2")}
                    style={i === days.length - 1 ? undefined : { left: center(i) }}
                  >
                    {shortDate(day.date)}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
        <table className="sr-only">
          <caption>Tickets per day, last {days.length} days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{longDate(day.date)}</td>
                <td>{day.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
