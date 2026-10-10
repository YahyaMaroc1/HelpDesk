import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { SenderType, TicketStatus } from "@/lib/ticket.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { TicketReplyForm } from "./TicketReplyForm.tsx";

// The ticket as POST /tickets/:id/replies returns it, with the new reply at the end of its thread.
const repliedTicket: TicketDetail = {
  id: "t1",
  subject: "Refund for my course",
  senderEmail: "jane@example.com",
  senderName: "Jane Doe",
  status: TicketStatus.OPEN,
  category: null,
  summary: null,
  createdAt: "2026-10-09T09:30:00.000Z",
  updatedAt: "2026-10-10T12:00:00.000Z",
  assignedTo: null,
  messages: [
    {
      id: "m2",
      senderType: SenderType.AGENT,
      body: "Your refund is on its way.",
      senderEmail: "alan@example.com",
      senderName: "Alan Agent",
      createdAt: "2026-10-10T12:00:00.000Z",
    },
  ],
};

const pending = () => new Promise(() => {});

// An axios error carrying an HTTP response, as axios rejects with for a non-2xx status.
function httpError(status: number, data: unknown) {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response as AxiosResponse),
  );
}

// Answers POST /tickets/:id/replies with `result`, by default the replied ticket.
function mockPost(result: () => Promise<unknown> = () => Promise.resolve({ data: { ticket: repliedTicket } })) {
  return spyOn(api, "post").mockImplementation((() => result()) as typeof api.post);
}

const replyBox = () => screen.getByRole("textbox", { name: "Reply" });
const sendButton = () => screen.getByRole("button", { name: "Send reply" });

function send(text: string) {
  fireEvent.input(replyBox(), { target: { value: text } });
  fireEvent.click(sendButton());
}

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("TicketReplyForm", () => {
  test("shows an empty reply box and a send button", () => {
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    expect(replyBox()).toHaveValue("");
    expect(replyBox()).not.toHaveAccessibleDescription();
    expect(sendButton()).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("sends the trimmed reply to the ticket", async () => {
    const post = mockPost();
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    send("  Your refund is on its way.\nThanks!  \n");

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/tickets/t1/replies", { body: "Your refund is on its way.\nThanks!" }),
    );
  });

  test("stores the returned ticket, refreshes the ticket queries and clears the box", async () => {
    mockPost();
    const invalidate = spyOn(queryClient, "invalidateQueries");
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    send("Your refund is on its way.");

    await waitFor(() => expect(replyBox()).toHaveValue(""));
    expect(queryClient.getQueryData<TicketDetail>(["tickets", "t1"])).toEqual(repliedTicket);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tickets"] });
    expect(sendButton()).toBeEnabled();
  });

  test.each([
    ["an empty reply", ""],
    ["a reply of only whitespace", "   \n\t  "],
  ])("doesn't send %s", async (_, text) => {
    const post = mockPost();
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    send(text);

    expect(await screen.findByText("Write a reply")).toBeInTheDocument();
    expect(replyBox()).toHaveAttribute("aria-invalid", "true");
    expect(replyBox()).toHaveAccessibleDescription("Write a reply");
    expect(post).not.toHaveBeenCalled();
  });

  test("doesn't send a reply over 20,000 characters", async () => {
    const post = mockPost();
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    send("x".repeat(20_001));

    expect(await screen.findByText("Reply must be at most 20,000 characters")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("sends a reply of exactly 20,000 characters", async () => {
    const post = mockPost();
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    send("x".repeat(20_000));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  test("clears the validation error once a reply is written", async () => {
    mockPost();
    renderWithQuery(<TicketReplyForm ticketId="t1" />);
    send("");
    const error = await screen.findByText("Write a reply");

    fireEvent.input(replyBox(), { target: { value: "Hello" } });

    await waitForElementToBeRemoved(error);
    expect(replyBox()).not.toHaveAttribute("aria-invalid");
  });

  test("makes the box read-only and disables sending while the reply is sent", async () => {
    mockPost(pending);
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    send("Hello");

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(replyBox()).toHaveAttribute("readonly");
    expect(replyBox()).toHaveValue("Hello");
  });

  test("shows the API's error and keeps the reply when sending fails", async () => {
    mockPost(() => httpError(404, { error: "Ticket not found" }));
    const invalidate = spyOn(queryClient, "invalidateQueries");
    renderWithQuery(<TicketReplyForm ticketId="t1" />);

    send("Hello");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't send the reply: Ticket not found");
    expect(replyBox()).toHaveValue("Hello");
    expect(replyBox()).not.toHaveAttribute("readonly");
    expect(sendButton()).toBeEnabled();
    expect(queryClient.getQueryData<TicketDetail>(["tickets", "t1"])).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("clears the API's error when the reply is sent again successfully", async () => {
    const post = mockPost(() => httpError(400, { error: "Write a reply" }));
    renderWithQuery(<TicketReplyForm ticketId="t1" />);
    send("Hello");
    const alert = await screen.findByRole("alert");

    post.mockImplementation((() => Promise.resolve({ data: { ticket: repliedTicket } })) as typeof api.post);
    fireEvent.click(sendButton());

    await waitForElementToBeRemoved(alert);
    await waitFor(() => expect(replyBox()).toHaveValue(""));
    expect(post).toHaveBeenCalledTimes(2);
  });
});
