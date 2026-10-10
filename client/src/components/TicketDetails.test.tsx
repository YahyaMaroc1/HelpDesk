import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { SenderType, TicketCategory, TicketStatus } from "@/lib/ticket.ts";
import type { TicketDetail } from "@/pages/TicketDetailPage.tsx";
import { formatTicketDate } from "@/pages/TicketsPage.tsx";
import { TicketDetails } from "./TicketDetails.tsx";

const ticket: TicketDetail = {
  id: "t1",
  subject: "Refund for my course",
  senderEmail: "jane@example.com",
  senderName: "Jane Doe",
  status: TicketStatus.OPEN,
  category: TicketCategory.REFUND_REQUEST,
  summary: "Jane wants a refund.",
  createdAt: "2026-10-09T09:30:00.000Z",
  updatedAt: "2026-10-10T11:00:00.000Z",
  assignedTo: null,
  messages: [
    {
      id: "m1",
      senderType: SenderType.CUSTOMER,
      body: "Hi,\nI bought the wrong course.\nCan I get a refund?",
      senderEmail: "jane@example.com",
      senderName: "Jane Doe",
      createdAt: "2026-10-09T09:30:00.000Z",
    },
    {
      id: "m2",
      senderType: SenderType.AGENT,
      body: "Of course, the refund is on its way.",
      senderEmail: "alan@example.com",
      senderName: "Alan Agent",
      createdAt: "2026-10-10T11:00:00.000Z",
    },
  ],
};

// The <dd> for a <dt> label.
function field(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling;
}

describe("TicketDetails", () => {
  test("shows the subject as the page heading", () => {
    render(<TicketDetails ticket={ticket} />);

    expect(screen.getByRole("heading", { level: 1, name: "Refund for my course" })).toBeInTheDocument();
  });

  test("shows the sender's name and email", () => {
    render(<TicketDetails ticket={ticket} />);

    expect(field("From")).toHaveTextContent("Jane Doe");
    expect(field("From")).toHaveTextContent("jane@example.com");
  });

  test("shows only the email of a sender without a name", () => {
    render(<TicketDetails ticket={{ ...ticket, senderName: null }} />);

    expect(field("From")).toHaveTextContent(/^jane@example\.com$/);
  });

  test("shows when the ticket was created and last updated", () => {
    render(<TicketDetails ticket={ticket} />);

    expect(field("Created")).toHaveTextContent(formatTicketDate(ticket.createdAt));
    expect(field("Updated")).toHaveTextContent(formatTicketDate(ticket.updatedAt));
  });

  test("shows the original message, keeping its line breaks", () => {
    render(<TicketDetails ticket={ticket} />);

    const message = screen.getByRole("region", { name: "Message" });
    expect(within(message).getByText(/I bought the wrong course/).textContent).toBe(ticket.messages[0]!.body);
  });

  test("doesn't show the replies, the summary or the ticket's properties", () => {
    render(<TicketDetails ticket={ticket} />);

    expect(screen.queryByText("Of course, the refund is on its way.")).not.toBeInTheDocument();
    expect(screen.queryByText(ticket.summary!)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("says when the ticket has no message", () => {
    render(<TicketDetails ticket={{ ...ticket, messages: [] }} />);

    expect(screen.getByRole("region", { name: "Message" })).toHaveTextContent("No message.");
  });
});
