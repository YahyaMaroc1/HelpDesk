import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { TicketSummary } from "./TicketSummary.tsx";

const summary = "Jane bought the wrong course and wants a refund; nobody has replied yet.";
const pending = () => new Promise(() => {});

// An axios error carrying an HTTP response, as axios rejects with for a non-2xx status.
function httpError(status: number, data: unknown) {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response as AxiosResponse),
  );
}

// Answers POST /tickets/:id/summary with `result`, by default a summary.
function mockSummarize(result: () => Promise<unknown> = () => Promise.resolve({ data: { summary } })) {
  return spyOn(api, "post").mockImplementation((() => result()) as typeof api.post);
}

const summarizeButton = () => screen.getByRole("button", { name: "Summarize" });

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("TicketSummary", () => {
  test("shows only the Summarize button at first", () => {
    renderWithQuery(<TicketSummary ticketId="t1" />);

    expect(summarizeButton()).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Summary" })).not.toBeInTheDocument();
  });

  test("asks for a summary of the ticket and shows it", async () => {
    const post = mockSummarize();
    renderWithQuery(<TicketSummary ticketId="t1" />);

    fireEvent.click(summarizeButton());

    expect(await screen.findByRole("region", { name: "Summary" })).toHaveTextContent(summary);
    expect(post).toHaveBeenCalledWith("/tickets/t1/summary");
  });

  test("doesn't keep the summary when shown again, as after a reload", async () => {
    mockSummarize();
    const { unmount } = renderWithQuery(<TicketSummary ticketId="t1" />);
    fireEvent.click(summarizeButton());
    await screen.findByRole("region", { name: "Summary" });

    unmount();
    renderWithQuery(<TicketSummary ticketId="t1" />);

    expect(screen.queryByRole("region", { name: "Summary" })).not.toBeInTheDocument();
  });

  test("generates a new summary on every click", async () => {
    const post = spyOn(api, "post")
      .mockImplementationOnce((() => Promise.resolve({ data: { summary: "First summary" } })) as typeof api.post)
      .mockImplementationOnce((() => Promise.resolve({ data: { summary: "Second summary" } })) as typeof api.post);
    renderWithQuery(<TicketSummary ticketId="t1" />);

    fireEvent.click(summarizeButton());
    expect(await screen.findByText("First summary")).toBeInTheDocument();
    fireEvent.click(summarizeButton());

    expect(await screen.findByText("Second summary")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
  });

  test("disables the button while summarizing", async () => {
    mockSummarize(pending);
    renderWithQuery(<TicketSummary ticketId="t1" />);

    fireEvent.click(summarizeButton());

    expect(await screen.findByRole("button", { name: "Summarizing…" })).toBeDisabled();
  });

  test("shows the error when summarizing fails", async () => {
    mockSummarize(() => httpError(502, { error: "The AI service didn't respond. Try again." }));
    renderWithQuery(<TicketSummary ticketId="t1" />);

    fireEvent.click(summarizeButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't summarize the ticket: The AI service didn't respond. Try again.",
    );
    await waitFor(() => expect(summarizeButton()).toBeEnabled());
    expect(screen.queryByRole("region", { name: "Summary" })).not.toBeInTheDocument();
  });
});
