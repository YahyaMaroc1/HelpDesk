import { expect, test, type APIRequestContext } from "@playwright/test";
import { agentAuthFile, inboundEmailSecret, testAgent } from "../test-env.ts";

// The ticket page's rendering, reply form and pickers are unit-tested (client/src/components/, pages/TicketDetailPage.test.tsx)
// and so are the routes (server/src/routes/tickets.test.ts, webhooks.test.ts). These check what needs the real stack:
// a reply is recorded with the signed-in agent as its sender, an emailed reply reaches the page through the webhook,
// and the tickets API is behind requireAuth.

const webhook = "/api/webhooks/inbound-email";
const newMessageId = () => `${crypto.randomUUID()}@mail.test.local`;

// Emails a new ticket in through the webhook, so each test has its own ticket.
async function createTicket(request: APIRequestContext) {
  const unique = crypto.randomUUID();
  const ticket = {
    messageId: newMessageId(),
    from: `customer-${unique}@example.com`,
    fromName: "Casey Customer",
    subject: `Printer on fire ${unique}`,
    text: `The printer is smoking.\nPlease help ${unique}.`,
  };
  const response = await request.post(webhook, {
    headers: { "X-Webhook-Secret": inboundEmailSecret },
    data: ticket,
  });
  expect(response.status()).toBe(201);
  const { ticketId } = (await response.json()) as { ticketId: string };
  return { ...ticket, id: ticketId, unique };
}

test.describe("ticket detail page", () => {
  test.use({ storageState: agentAuthFile });

  test("sends a reply labelled with the signed-in agent, and keeps it after a reload", async ({ page, request }) => {
    const ticket = await createTicket(request);
    const reply = `We are on it ${crypto.randomUUID()}`;
    await page.goto(`/tickets/${ticket.id}`);

    await page.getByLabel("Reply").fill(reply);
    await page.getByRole("button", { name: "Send reply" }).click();

    const replies = page.getByRole("region", { name: "Replies" });
    const item = replies.getByRole("listitem");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(reply);
    await expect(item).toContainText(`${testAgent.name} <${testAgent.email}>`);
    await expect(item).toContainText("· Agent");
    await expect(page.getByLabel("Reply")).toHaveValue("");

    await page.reload();
    await expect(replies.getByRole("listitem")).toHaveCount(1);
    await expect(replies.getByRole("listitem")).toContainText(reply);
    await expect(replies.getByRole("listitem")).toContainText("· Agent");
  });

  test("shows a customer's emailed reply after the agent's reply", async ({ page, request }) => {
    const ticket = await createTicket(request);
    const agentReply = `Agent says ${crypto.randomUUID()}`;
    const customerReply = `Customer says ${crypto.randomUUID()}`;
    await page.goto(`/tickets/${ticket.id}`);

    await page.getByLabel("Reply").fill(agentReply);
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByRole("region", { name: "Replies" }).getByRole("listitem")).toHaveCount(1);

    const followUp = await request.post(webhook, {
      headers: { "X-Webhook-Secret": inboundEmailSecret },
      data: {
        messageId: newMessageId(),
        from: ticket.from,
        fromName: ticket.fromName,
        subject: `Re: ${ticket.subject}`,
        text: customerReply,
        inReplyTo: `<${ticket.messageId}>`,
      },
    });
    expect(followUp.status()).toBe(200);
    expect((await followUp.json()).result).toBe("appended");

    await page.reload();
    const items = page.getByRole("region", { name: "Replies" }).getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText(agentReply);
    await expect(items.nth(0)).toContainText("· Agent");
    await expect(items.nth(1)).toContainText(customerReply);
    await expect(items.nth(1)).toContainText(`${ticket.fromName} <${ticket.from}>`);
    await expect(items.nth(1)).toContainText("· Customer");
  });
});

test.describe("ticket detail when signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects to /login and rejects the replies API", async ({ page, request }) => {
    const ticket = await createTicket(request);

    await page.goto(`/tickets/${ticket.id}`);
    await expect(page).toHaveURL(/\/login$/);

    const response = await request.post(`/api/tickets/${ticket.id}/replies`, { data: { body: "Sneaky reply" } });
    expect(response.status()).toBe(401);
  });
});
