import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { SenderType } from "@/lib/ticket.ts";
import type { TicketMessage } from "@/pages/TicketDetailPage.tsx";
import { formatTicketDate } from "@/pages/TicketsPage.tsx";
import { ReplyThread } from "./ReplyThread.tsx";

const agentReply: TicketMessage = {
  id: "m2",
  senderType: SenderType.AGENT,
  body: "Of course.\nThe refund is on its way.",
  senderEmail: "alan@example.com",
  senderName: "Alan Agent",
  createdAt: "2026-10-10T11:00:00.000Z",
};
const customerFollowUp: TicketMessage = {
  id: "m3",
  senderType: SenderType.CUSTOMER,
  body: "Thanks, got it!",
  senderEmail: "jane@example.com",
  senderName: null,
  createdAt: "2026-10-10T12:00:00.000Z",
};

const thread = () => within(screen.getByRole("region", { name: "Replies" }));
const items = () => thread().getAllByRole("listitem");

describe("ReplyThread", () => {
  test("shows the replies under a Replies heading, in the order given", () => {
    render(<ReplyThread replies={[agentReply, customerFollowUp]} />);

    expect(screen.getByRole("heading", { level: 2, name: "Replies" })).toBeInTheDocument();
    expect(items()).toHaveLength(2);
    expect(items()[0]).toHaveTextContent("The refund is on its way.");
    expect(items()[1]).toHaveTextContent("Thanks, got it!");
  });

  test("labels an agent's reply with their name, email and Agent", () => {
    render(<ReplyThread replies={[agentReply]} />);

    expect(items()[0]).toHaveTextContent("Alan Agent <alan@example.com> · Agent");
  });

  test("labels a customer's follow-up with Customer, showing only the email when there's no name", () => {
    render(<ReplyThread replies={[customerFollowUp]} />);

    expect(items()[0]).toHaveTextContent(/^jane@example\.com · Customer/);
    expect(items()[0]).not.toHaveTextContent("<");
  });

  test("labels the AI's reply with its name and AI, without its placeholder address", () => {
    const aiReply: TicketMessage = {
      id: "m4",
      senderType: SenderType.AI,
      body: "Hi Jane,\n\nGo to the login page and click Forgot Password.",
      senderEmail: "ai-assistant@helpdesk.invalid",
      senderName: "AI Assistant",
      createdAt: "2026-10-10T13:00:00.000Z",
    };
    render(<ReplyThread replies={[aiReply]} />);

    expect(items()[0]).toHaveTextContent(/^AI Assistant · AI/);
    expect(items()[0]).not.toHaveTextContent("ai-assistant@helpdesk.invalid");
  });

  test("shows when each reply was sent", () => {
    render(<ReplyThread replies={[agentReply, customerFollowUp]} />);

    const [first, second] = items();
    expect(within(first!).getByText(formatTicketDate(agentReply.createdAt))).toHaveAttribute("dateTime", agentReply.createdAt);
    expect(within(second!).getByText(formatTicketDate(customerFollowUp.createdAt))).toHaveAttribute(
      "dateTime",
      customerFollowUp.createdAt,
    );
  });

  test("keeps a reply's line breaks", () => {
    render(<ReplyThread replies={[agentReply]} />);

    expect(within(items()[0]!).getByText(/The refund is on its way/).textContent).toBe(agentReply.body);
  });

  test("says when there are no replies yet", () => {
    render(<ReplyThread replies={[]} />);

    expect(thread().getByText("No replies yet.")).toBeInTheDocument();
    expect(thread().queryByRole("list")).not.toBeInTheDocument();
  });
});
