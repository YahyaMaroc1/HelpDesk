import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { screen, within } from "@testing-library/react";
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

const mockGet = (result: () => Promise<unknown>) => spyOn(api, "get").mockImplementation(result as typeof api.get);

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
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/tickets/t1", { signal: expect.any(AbortSignal) });
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
    expect(screen.getByText("Alan Agent")).toBeInTheDocument();
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
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
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
