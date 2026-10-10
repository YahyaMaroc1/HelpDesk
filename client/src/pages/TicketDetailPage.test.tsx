import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { MemoryRouter, Route, Routes } from "react-router";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { MessageDirection, TicketCategory, TicketStatus } from "@/lib/ticket.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { TicketDetailPage, type TicketDetail } from "./TicketDetailPage.tsx";
import { formatTicketDate } from "./TicketsPage.tsx";

const ticket: TicketDetail = {
  id: "t1",
  subject: "Refund for my course",
  senderEmail: "jane@example.com",
  senderName: "Jane Doe",
  status: TicketStatus.OPEN,
  category: TicketCategory.REFUND_REQUEST,
  summary: "Jane wants a refund for a course she bought by mistake.",
  createdAt: "2026-10-09T09:30:00.000Z",
  updatedAt: "2026-10-10T11:00:00.000Z",
  assignedTo: { id: "a1", name: "Alan Agent" },
  messages: [
    {
      id: "m1",
      direction: MessageDirection.INBOUND,
      body: "Hi,\nI bought the wrong course.\nCan I get a refund?",
      senderEmail: "jane@example.com",
      senderName: "Jane Doe",
      createdAt: "2026-10-09T09:30:00.000Z",
    },
    {
      id: "m2",
      direction: MessageDirection.OUTBOUND,
      body: "Of course, the refund is on its way.",
      senderEmail: "support@example.com",
      senderName: null,
      createdAt: "2026-10-10T11:00:00.000Z",
    },
  ],
};

// Renders the page at /tickets/:id, as App.tsx routes it.
function renderPage(id = "t1") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[`/tickets/${id}`]}>
      <Routes>
        <Route path="tickets/:id" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const assignees = [
  { id: "a1", name: "Alan Agent" },
  { id: "a2", name: "Beth Admin" },
];

// Stubs GET /tickets/:id with `result`, and GET /assignees with `assignees`.
const mockGet = (result: () => Promise<unknown>) =>
  spyOn(api, "get").mockImplementation(((path: string) =>
    path === "/assignees" ? ok({ assignees }) : result()) as typeof api.get);

// The [path, config] of each ticket request the page sent.
const ticketRequests = (get: ReturnType<typeof mockGet>) => get.mock.calls.filter(([path]) => path !== "/assignees");

const pending = () => new Promise(() => {});

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

describe("TicketDetailPage", () => {
  test("requests the ticket from the id in the URL", async () => {
    const get = mockGet(() => ok({ ticket }));
    renderPage("t1");

    await screen.findByRole("heading", { name: ticket.subject });
    expect(ticketRequests(get)).toEqual([["/tickets/t1", { signal: expect.any(AbortSignal) }]]);
  });

  test("shows a loading state while the ticket loads", () => {
    mockGet(pending);
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading ticket…");
  });

  test("shows the ticket's details and summary", async () => {
    mockGet(() => ok({ ticket }));
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: ticket.subject })).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Refund request")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveValue("a1");
    expect(screen.getByText(formatTicketDate(ticket.updatedAt), { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(ticket.summary!)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("shows the messages oldest first, keeping their line breaks", async () => {
    mockGet(() => ok({ ticket }));
    renderPage();

    const thread = within(await screen.findByRole("list"));
    const items = thread.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Jane Doe <jane@example.com> · Customer");
    expect(within(items[0]!).getByText(/I bought the wrong course/).textContent).toBe(ticket.messages[0]!.body);
    expect(items[1]).toHaveTextContent("support@example.com · Reply");
    expect(items[1]).toHaveTextContent("Of course, the refund is on its way.");
  });

  test("shows an unclassified, unassigned ticket without a summary", async () => {
    mockGet(() => ok({ ticket: { ...ticket, category: null, assignedTo: null, summary: null } }));
    renderPage();

    await screen.findByRole("heading", { name: ticket.subject });
    expect(screen.getByText("Unclassified")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
  });

  test("links back to the ticket list", async () => {
    mockGet(() => ok({ ticket }));
    renderPage();

    expect(await screen.findByRole("link", { name: "All tickets" })).toHaveAttribute("href", "/tickets");
  });

  test("shows the API's error when the ticket can't be loaded", async () => {
    mockGet(() => httpError(404, { error: "Ticket not found" }));
    renderPage("missing");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the ticket: Ticket not found");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("TicketDetailPage assignee", () => {
  // Serves the ticket as it is on the "server", which a successful PATCH changes, so refetches see the new assignee.
  function mockTicketApi(patchResult?: () => Promise<unknown>) {
    let current = ticket;
    mockGet(() => ok({ ticket: current }));
    return spyOn(api, "patch").mockImplementation(((_path: string, body: { assignedToId: string | null }) => {
      if (patchResult) return patchResult();
      const assignedTo = assignees.find((user) => user.id === body.assignedToId) ?? null;
      current = { ...current, assignedTo };
      return ok({ ticket: current });
    }) as typeof api.patch);
  }

  const assigneeSelect = () => screen.findByRole("combobox", { name: "Assignee" });

  test("offers Unassigned and the active users", async () => {
    mockTicketApi();
    renderPage();

    const select = await assigneeSelect();
    await within(select).findByRole("option", { name: "Beth Admin" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Unassigned",
      "Alan Agent",
      "Beth Admin",
    ]);
  });

  test("assigns the ticket to the chosen user", async () => {
    const patch = mockTicketApi();
    const invalidate = spyOn(queryClient, "invalidateQueries");
    renderPage();
    const select = await assigneeSelect();
    await within(select).findByRole("option", { name: "Beth Admin" });

    fireEvent.change(select, { target: { value: "a2" } });
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/tickets/t1", { assignedToId: "a2" }));
    expect(await within(select).findByRole("option", { name: "Beth Admin", selected: true })).toBeInTheDocument();
    expect(select).toBeEnabled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tickets"] });
  });

  test("shows the chosen user and disables the select while saving", async () => {
    mockTicketApi(pending);
    renderPage();
    const select = await assigneeSelect();
    await within(select).findByRole("option", { name: "Beth Admin" });

    fireEvent.change(select, { target: { value: "a2" } });
    await waitFor(() => expect(select).toBeDisabled());
    expect(select).toHaveValue("a2");
  });

  test("unassigns the ticket", async () => {
    const patch = mockTicketApi();
    renderPage();
    const select = await assigneeSelect();
    await within(select).findByRole("option", { name: "Beth Admin" });

    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/tickets/t1", { assignedToId: null }));
    expect(await within(select).findByRole("option", { name: "Unassigned", selected: true })).toBeInTheDocument();
  });

  test("shows the API's error and keeps the assignee when assigning fails", async () => {
    mockTicketApi(() => httpError(400, { error: "Assignee not found" }));
    renderPage();
    const select = await assigneeSelect();
    await within(select).findByRole("option", { name: "Beth Admin" });

    fireEvent.change(select, { target: { value: "a2" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't assign the ticket: Assignee not found");
    expect(select).toHaveValue("a1");
    expect(select).toBeEnabled();
  });

  test("keeps showing a deleted user who is still assigned", async () => {
    mockGet(() => ok({ ticket: { ...ticket, assignedTo: { id: "gone", name: "Gina Gone" } } }));
    renderPage();

    const select = await assigneeSelect();
    await within(select).findByRole("option", { name: "Beth Admin" });
    expect(select).toHaveValue("gone");
    expect(within(select).getByRole("option", { name: "Gina Gone" })).toBeInTheDocument();
  });
});
