import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { MemoryRouter } from "react-router";
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

const assignees = [
  { id: "a1", name: "Alan Agent" },
  { id: "a2", name: "Beth Admin" },
];

// Stubs GET /api/tickets on the shared axios instance, and GET /api/assignees with `assignees`. Pass several results
// to answer successive ticket requests (the last one repeats).
function mockGetTickets(...results: (() => Promise<unknown>)[]) {
  let call = 0;
  return spyOn(api, "get").mockImplementation(((path: string) =>
    path === "/assignees" ? ok({ assignees }) : results[Math.min(call++, results.length - 1)]!()) as typeof api.get);
}

// The [path, config] of each GET /tickets request the page sent.
function ticketRequests(get: ReturnType<typeof mockGetTickets>) {
  return get.mock.calls.filter(([path]) => path === "/tickets");
}

// The subjects link to the ticket pages, so the page needs a router.
const renderPage = () =>
  renderWithQuery(
    <MemoryRouter>
      <TicketsPage />
    </MemoryRouter>,
  );

const pending = () => new Promise(() => {});

// The params of an unfiltered request for the first page, newest first.
const defaultParams = { sortBy: "createdAt", sortOrder: "desc", page: 1, pageSize: 25 };

// The params of the last GET /tickets request.
const lastTicketParams = (get: ReturnType<typeof mockGetTickets>) =>
  (ticketRequests(get).at(-1)?.[1] as { params: Record<string, unknown> } | undefined)?.params;

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
    const get = mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();

    await screen.findByRole("table");
    expect(ticketRequests(get)).toHaveLength(1);
    expect(ticketRequests(get)[0]?.[0]).toBe("/tickets");
    expect(ticketRequests(get)[0]?.[1]).toEqual({
      params: defaultParams,
      signal: expect.any(AbortSignal),
    });
  });

  test("links each subject to the ticket's page", async () => {
    mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "Refund for my course" })).toHaveAttribute("href", "/tickets/2");
    expect(within(table).getByRole("link", { name: "Can't log in" })).toHaveAttribute("href", "/tickets/1");
  });

  test("marks the Created column as sorted descending and the others as sortable", async () => {
    mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();

    const table = await screen.findByRole("table");
    for (const name of ["Subject", "From", "Status", "Category", "Assignee", "Created"]) {
      expect(within(table).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(table).getByRole("columnheader", { name: "Created" })).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getByRole("columnheader", { name: "Subject" })).not.toHaveAttribute("aria-sort");
  });

  test("sorts on the server when a column header is clicked, ascending then descending", async () => {
    const reversed = [...tickets].reverse();
    const get = mockGetTickets(() => ok({ tickets, total: 2 }), () => ok({ tickets: reversed, total: 2 }), pending);
    renderPage();

    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: "Subject" }));

    await waitFor(() => expect(rowSubjects(table)).toEqual(["Can't log in", "Refund for my course"]));
    expect(ticketRequests(get)[1]?.[1]).toEqual({
      params: { sortBy: "subject", sortOrder: "asc", page: 1, pageSize: 25 },
      signal: expect.any(AbortSignal),
    });
    expect(within(table).getByRole("columnheader", { name: "Subject" })).toHaveAttribute("aria-sort", "ascending");
    expect(within(table).getByRole("columnheader", { name: "Created" })).not.toHaveAttribute("aria-sort");

    fireEvent.click(within(table).getByRole("button", { name: "Subject" }));

    expect(ticketRequests(get)).toHaveLength(3);
    expect(ticketRequests(get)[2]?.[1]).toEqual({
      params: { sortBy: "subject", sortOrder: "desc", page: 1, pageSize: 25 },
      signal: expect.any(AbortSignal),
    });
    expect(within(table).getByRole("columnheader", { name: "Subject" })).toHaveAttribute("aria-sort", "descending");
    // While the new order loads, the current rows stay instead of the loading skeleton.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(rowSubjects(table)).toEqual(["Can't log in", "Refund for my course"]);
  });

  test("shows the heading and a loading status while the request is pending", () => {
    mockGetTickets(pending);
    renderPage();

    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading tickets…");
    // The skeleton table is aria-hidden, so assistive tech only gets the status text.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("lists the tickets in the order the API returns them (newest first)", async () => {
    mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();

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
    mockGetTickets(() => ok({ tickets: [], total: 0 }));
    renderPage();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("No tickets yet.")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(2); // header row + empty-state row
  });

  test("shows the API's error message when the request fails", async () => {
    mockGetTickets(() => httpError(401, { error: "Unauthorized" }));
    renderPage();

    expect(await screen.findByText("Couldn't load tickets: Unauthorized")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("TicketsPage filters", () => {
  test("offers the active users in the assignee filter", async () => {
    mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();

    const select = screen.getByRole("combobox", { name: "Assignee" });
    await within(select).findByRole("option", { name: "Beth Admin" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All assignees",
      "Unassigned",
      "Alan Agent",
      "Beth Admin",
    ]);
  });

  test("filters by status, category and assignee on the server, keeping the sort", async () => {
    const get = mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();
    await screen.findByRole("table");
    await within(screen.getByRole("combobox", { name: "Assignee" })).findByRole("option", { name: "Alan Agent" });

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: TicketStatus.RESOLVED } });
    await waitFor(() =>
      expect(lastTicketParams(get)).toEqual({ ...defaultParams, status: TicketStatus.RESOLVED }),
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "unclassified" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Assignee" }), { target: { value: "a1" } });
    await waitFor(() =>
      expect(lastTicketParams(get)).toEqual({
        ...defaultParams,
        status: TicketStatus.RESOLVED,
        category: "unclassified",
        assignee: "a1",
      }),
    );
  });

  test("searches once typing pauses, with the text trimmed", async () => {
    const get = mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();
    await screen.findByRole("table");

    const search = screen.getByRole("searchbox", { name: "Search tickets" });
    fireEvent.change(search, { target: { value: "ref" } });
    fireEvent.change(search, { target: { value: "  refund " } });
    // Not sent per keystroke.
    expect(ticketRequests(get)).toHaveLength(1);

    await waitFor(() => expect(lastTicketParams(get)).toEqual({ ...defaultParams, q: "refund" }));
    expect(ticketRequests(get)).toHaveLength(2);
  });

  test("shows a filtered empty state, and Clear filters brings back all tickets", async () => {
    const get = mockGetTickets(() => ok({ tickets, total: 2 }), () => ok({ tickets: [], total: 0 }), () => ok({ tickets, total: 2 }));
    renderPage();
    await screen.findByText("Refund for my course");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    const status = screen.getByRole("combobox", { name: "Status" });
    fireEvent.change(status, { target: { value: TicketStatus.CLOSED } });
    expect(await screen.findByText("No tickets match these filters.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Refund for my course")).toBeInTheDocument();
    expect(status).toHaveValue("");
    expect(lastTicketParams(get)).toEqual(defaultParams);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});

describe("TicketsPage pagination", () => {
  const pagination = () => screen.getByRole("navigation", { name: "Pagination" });

  test("shows the range and disables both page buttons when everything fits on one page", async () => {
    mockGetTickets(() => ok({ tickets, total: 2 }));
    renderPage();
    await screen.findByRole("table");

    expect(within(pagination()).getByText("1–2 of 2 tickets")).toBeInTheDocument();
    expect(within(pagination()).getByText("Page 1 of 1")).toBeInTheDocument();
    expect(within(pagination()).getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(within(pagination()).getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  test("hides the pagination when there are no tickets", async () => {
    mockGetTickets(() => ok({ tickets: [], total: 0 }));
    renderPage();
    await screen.findByText("No tickets yet.");

    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  test("requests the next and previous pages from the server", async () => {
    const get = mockGetTickets(() => ok({ tickets, total: 60 }));
    renderPage();
    await screen.findByRole("table");
    expect(within(pagination()).getByText("Page 1 of 3")).toBeInTheDocument();

    fireEvent.click(within(pagination()).getByRole("button", { name: "Next page" }));
    expect(lastTicketParams(get)).toEqual({ ...defaultParams, page: 2 });
    expect(await within(pagination()).findByText("26–50 of 60 tickets")).toBeInTheDocument();
    expect(within(pagination()).getByText("Page 2 of 3")).toBeInTheDocument();

    fireEvent.click(within(pagination()).getByRole("button", { name: "Next page" }));
    expect(lastTicketParams(get)).toEqual({ ...defaultParams, page: 3 });
    expect(await within(pagination()).findByText("51–60 of 60 tickets")).toBeInTheDocument();
    expect(within(pagination()).getByRole("button", { name: "Next page" })).toBeDisabled();

    fireEvent.click(within(pagination()).getByRole("button", { name: "Previous page" }));
    expect(lastTicketParams(get)).toEqual({ ...defaultParams, page: 2 });
  });

  test("changes the page size", async () => {
    const get = mockGetTickets(() => ok({ tickets, total: 60 }));
    renderPage();
    await screen.findByRole("table");

    fireEvent.change(within(pagination()).getByRole("combobox", { name: "Rows per page" }), { target: { value: "50" } });
    expect(lastTicketParams(get)).toEqual({ ...defaultParams, pageSize: 50 });
    expect(await within(pagination()).findByText("Page 1 of 2")).toBeInTheDocument();
  });

  test("goes back to the first page when the sort or a filter changes", async () => {
    const get = mockGetTickets(() => ok({ tickets, total: 60 }));
    renderPage();
    const table = await screen.findByRole("table");

    fireEvent.click(within(pagination()).getByRole("button", { name: "Next page" }));
    expect(lastTicketParams(get)).toEqual({ ...defaultParams, page: 2 });
    fireEvent.click(within(table).getByRole("button", { name: "Subject" }));
    expect(lastTicketParams(get)).toEqual({ ...defaultParams, sortBy: "subject", sortOrder: "asc" });

    fireEvent.click(within(pagination()).getByRole("button", { name: "Next page" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: TicketStatus.OPEN } });
    expect(lastTicketParams(get)).toEqual({
      ...defaultParams,
      sortBy: "subject",
      sortOrder: "asc",
      status: TicketStatus.OPEN,
    });
  });
});
