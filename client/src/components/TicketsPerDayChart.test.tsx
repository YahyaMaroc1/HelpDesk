import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { axisTicks, longDate, TicketsPerDayChart, type DayCount } from "./TicketsPerDayChart.tsx";

// 30 days up to Oct 12, 2026: one ticket a day, with 7 on Oct 10 and none on Oct 11.
const days: DayCount[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(2026, 8, 13 + i);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { date: iso, count: iso === "2026-10-10" ? 7 : iso === "2026-10-11" ? 0 : 1 };
});

// The bars are hidden from assistive tech (the table has the numbers), so they're found with `hidden: true`.
const bar = (label: string) => screen.getByRole("img", { name: label, hidden: true });

describe("TicketsPerDayChart", () => {
  test("has a title and a description of the period", () => {
    render(<TicketsPerDayChart days={days} />);

    expect(screen.getByText("Tickets per day")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  test("lists every day and its count in a table for assistive tech", () => {
    render(<TicketsPerDayChart days={days} />);

    const rows = within(screen.getByRole("table", { name: "Tickets per day, last 30 days" })).getAllByRole("row");
    expect(rows).toHaveLength(31);
    expect(within(rows[1]!).getAllByRole("cell").map((c) => c.textContent)).toEqual([longDate("2026-09-13"), "1"]);
    expect(within(rows[28]!).getAllByRole("cell").map((c) => c.textContent)).toEqual([longDate("2026-10-10"), "7"]);
  });

  test("draws a bar per day, oldest first, hidden from assistive tech", () => {
    render(<TicketsPerDayChart days={days} />);

    const bars = screen.getAllByRole("img", { hidden: true });
    expect(bars).toHaveLength(30);
    expect(bars[0]).toHaveAccessibleName(`${longDate("2026-09-13")}: 1 ticket`);
    expect(bars[29]).toHaveAccessibleName(`${longDate("2026-10-12")}: 1 ticket`);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("shows the day and its count when a bar is hovered, and hides them on leaving the chart", () => {
    render(<TicketsPerDayChart days={days} />);

    fireEvent.mouseEnter(bar(`${longDate("2026-10-10")}: 7 tickets`));
    expect(screen.getByText("7 tickets")).toBeInTheDocument();

    fireEvent.mouseEnter(bar(`${longDate("2026-10-11")}: 0 tickets`));
    expect(screen.getByText("0 tickets")).toBeInTheDocument();
    expect(screen.queryByText("7 tickets")).not.toBeInTheDocument();

    fireEvent.mouseLeave(bar(`${longDate("2026-10-11")}: 0 tickets`).parentElement!);
    expect(screen.queryByText("0 tickets")).not.toBeInTheDocument();
  });
});

describe("axisTicks", () => {
  test.each([
    [0, [0, 1]],
    [1, [0, 1]],
    [3, [0, 1, 2, 3]],
    [4, [0, 1, 2, 3, 4]],
    [7, [0, 2, 4, 6, 8]],
    [9, [0, 5, 10]],
    [20, [0, 5, 10, 15, 20]],
    [37, [0, 10, 20, 30, 40]],
    [180, [0, 50, 100, 150, 200]],
  ])("covers a busiest day of %d with %p", (max, ticks) => {
    expect(axisTicks(max)).toEqual(ticks);
  });
});
