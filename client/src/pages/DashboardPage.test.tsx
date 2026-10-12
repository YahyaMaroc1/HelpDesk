import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { DashboardPage, formatDuration, formatPercent, type DashboardStats } from "./DashboardPage.tsx";

const stats: DashboardStats = {
  totalTickets: 1250,
  openTickets: 37,
  aiResolvedTickets: 400,
  // 1 day, 3 hours and 20 minutes.
  averageResolutionSeconds: 98_400,
  ticketsPerDay: [
    { date: "2026-10-11", count: 0 },
    { date: "2026-10-12", count: 9 },
  ],
};

// Stubs GET /api/dashboard on the shared axios instance.
function mockGetDashboard(result: Promise<unknown>) {
  return spyOn(api, "get").mockImplementation((() => result) as typeof api.get);
}

function ok(data: unknown) {
  return Promise.resolve({ data, status: 200 });
}

// An axios error carrying an HTTP response, as axios rejects with for a non-2xx status.
function httpError(status: number, data: unknown) {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response as AxiosResponse),
  );
}

// Checks the card with this label shows this value.
async function expectStat(label: string, value: string) {
  expect(within(await screen.findByRole("group", { name: label })).getByText(value)).toBeInTheDocument();
}

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("DashboardPage", () => {
  test("requests the figures from GET /dashboard", async () => {
    const get = mockGetDashboard(ok(stats));
    renderWithQuery(<DashboardPage />);

    await screen.findByRole("group", { name: "Total tickets" });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe("/dashboard");
    // The viewer's time zone, so the server counts tickets per day by the viewer's days.
    expect(get.mock.calls[0]?.[1]).toEqual({
      signal: expect.any(AbortSignal),
      params: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
  });

  test("shows the heading and a loading status while the request is pending", () => {
    mockGetDashboard(new Promise(() => {}));
    renderWithQuery(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("shows each figure on its own card", async () => {
    mockGetDashboard(ok(stats));
    renderWithQuery(<DashboardPage />);

    await expectStat("Total tickets", (1250).toLocaleString());
    await expectStat("Open tickets", "37");
    await expectStat("Resolved by AI", "400");
    await expectStat("Resolved by AI (%)", formatPercent(0.32));
    await expectStat("Average resolution time", "1d 3h");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("shows the tickets per day below the figures", async () => {
    mockGetDashboard(ok(stats));
    renderWithQuery(<DashboardPage />);

    const table = await screen.findByRole("table", { name: "Tickets per day, last 2 days" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("group", { name: "Average resolution time" }).compareDocumentPosition(table)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("shows dashes for the share and the average when there are no tickets", async () => {
    mockGetDashboard(
      ok({ totalTickets: 0, openTickets: 0, aiResolvedTickets: 0, averageResolutionSeconds: null, ticketsPerDay: [] }),
    );
    renderWithQuery(<DashboardPage />);

    await expectStat("Total tickets", "0");
    await expectStat("Resolved by AI (%)", "—");
    await expectStat("Average resolution time", "—");
  });

  test("shows the API's error message when the request fails", async () => {
    mockGetDashboard(httpError(403, { error: "Forbidden" }));
    renderWithQuery(<DashboardPage />);

    expect(await screen.findByText("Couldn't load the dashboard: Forbidden")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("formatDuration", () => {
  test.each([
    [0, "< 1m"],
    [59, "< 1m"],
    [60, "1m"],
    [45 * 60 + 30, "45m"],
    [3 * 3600, "3h"],
    [3 * 3600 + 12 * 60, "3h 12m"],
    [2 * 86_400, "2d"],
    [2 * 86_400 + 5 * 3600 + 59 * 60, "2d 5h"],
  ])("formats %d seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
