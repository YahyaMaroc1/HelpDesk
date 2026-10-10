import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { TicketCategory, TicketStatus } from "@/lib/ticket.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { formatTicketDate, TicketsPage, type TicketListItem } from "./TicketsPage.tsx";

// Newest first, as the API returns them.
const tickets: TicketListItem[] = [
  {
    id: "2",
    subject: "Refund for my course",
    senderEmail: "jane@example.com",
    senderName: "Jane Doe",
    status: TicketStatus.OPEN,
    category: TicketCategory.REFUND_REQUEST,
    createdAt: "2026-10-10T09:30:00.000Z",
    assignedTo: { id: "a1", name: "Alan Agent" },
  },
  {
    id: "1",
    subject: "Can't log in",
    senderEmail: "bob@example.com",
    senderName: null,
    status: TicketStatus.RESOLVED,
    category: null,
    createdAt: "2026-10-09T15:00:00.000Z",
    assignedTo: null,
  },
];

// Stubs GET /api/tickets on the shared axios instance. Pass several results to answer successive requests (the last
// one repeats).
function mockGetTickets(...results: Promise<unknown>[]) {
  let call = 0;
  return spyOn(api, "get").mockImplementation((() => results[Math.min(call++, results.length - 1)]) as typeof api.get);
}

// The subject in each body row, top to bottom.
function rowSubjects(table: HTMLElement) {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
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

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("TicketsPage", () => {
  test("requests the tickets from GET /tickets, newest first", async () => {
    const get = mockGetTickets(ok({ tickets }));
    renderWithQuery(<TicketsPage />);

    await screen.findByRole("table");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe("/tickets");
    expect(get.mock.calls[0]?.[1]).toEqual({
      params: { sortBy: "createdAt", sortOrder: "desc" },
      signal: expect.any(AbortSignal),
    });
  });

  test("marks the Created column as sorted descending and the others as sortable", async () => {
    mockGetTickets(ok({ tickets }));
    renderWithQuery(<TicketsPage />);

    const table = await screen.findByRole("table");
    for (const name of ["Subject", "From", "Status", "Category", "Assignee", "Created"]) {
      expect(within(table).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(table).getByRole("columnheader", { name: "Created" })).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getByRole("columnheader", { name: "Subject" })).not.toHaveAttribute("aria-sort");
  });

  test("sorts on the server when a column header is clicked, ascending then descending", async () => {
    const reversed = [...tickets].reverse();
    const get = mockGetTickets(ok({ tickets }), ok({ tickets: reversed }), new Promise(() => {}));
    renderWithQuery(<TicketsPage />);

    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: "Subject" }));

    await waitFor(() => expect(rowSubjects(table)).toEqual(["Can't log in", "Refund for my course"]));
    expect(get.mock.calls[1]?.[1]).toEqual({
      params: { sortBy: "subject", sortOrder: "asc" },
      signal: expect.any(AbortSignal),
    });
    expect(within(table).getByRole("columnheader", { name: "Subject" })).toHaveAttribute("aria-sort", "ascending");
    expect(within(table).getByRole("columnheader", { name: "Created" })).not.toHaveAttribute("aria-sort");

    fireEvent.click(within(table).getByRole("button", { name: "Subject" }));

    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[2]?.[1]).toEqual({
      params: { sortBy: "subject", sortOrder: "desc" },
      signal: expect.any(AbortSignal),
    });
    expect(within(table).getByRole("columnheader", { name: "Subject" })).toHaveAttribute("aria-sort", "descending");
    // While the new order loads, the current rows stay instead of the loading skeleton.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(rowSubjects(table)).toEqual(["Can't log in", "Refund for my course"]);
  });

  test("shows the heading and a loading status while the request is pending", () => {
    mockGetTickets(new Promise(() => {}));
    renderWithQuery(<TicketsPage />);

    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading tickets…");
    // The skeleton table is aria-hidden, so assistive tech only gets the status text.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("lists the tickets in the order the API returns them (newest first)", async () => {
    mockGetTickets(ok({ tickets }));
    renderWithQuery(<TicketsPage />);

    const table = await screen.findByRole("table");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Subject", "From", "Status", "Category", "Assignee", "Created"]);

    const [, newerRow, olderRow] = within(table).getAllByRole("row");
    const newerCells = within(newerRow!).getAllByRole("cell").map((td) => td.textContent);
    expect(newerCells).toEqual([
      "Refund for my course",
      "Jane Doejane@example.com",
      "Open",
      "Refund request",
      "Alan Agent",
      formatTicketDate(tickets[0]!.createdAt),
    ]);
    // A ticket without a sender name, category or assignee.
    const olderCells = within(olderRow!).getAllByRole("cell").map((td) => td.textContent);
    expect(olderCells).toEqual([
      "Can't log in",
      "bob@example.com",
      "Resolved",
      "Unclassified",
      "Unassigned",
      formatTicketDate(tickets[1]!.createdAt),
    ]);
  });

  test("shows an empty state when there are no tickets", async () => {
    mockGetTickets(ok({ tickets: [] }));
    renderWithQuery(<TicketsPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("No tickets yet.")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(2); // header row + empty-state row
  });

  test("shows the API's error message when the request fails", async () => {
    mockGetTickets(httpError(401, { error: "Unauthorized" }));
    renderWithQuery(<TicketsPage />);

    expect(await screen.findByText("Couldn't load tickets: Unauthorized")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
