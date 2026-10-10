import { expect, test } from "@playwright/test";
import { inboundEmailSecret } from "../test-env.ts";

const endpoint = "/api/webhooks/inbound-email";
const headers = { "X-Webhook-Secret": inboundEmailSecret };

const newMessageId = () => `${crypto.randomUUID()}@mail.test.local`;

// A valid email body; override fields per test.
function email(overrides: Record<string, unknown> = {}) {
  return {
    from: `customer-${crypto.randomUUID()}@example.com`,
    fromName: "Customer",
    subject: "Help needed",
    text: "Something is broken.",
    messageId: `<${newMessageId()}>`,
    ...overrides,
  };
}

test.describe("inbound email webhook", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe("authentication", () => {
    test("rejects a request without the secret", async ({ request }) => {
      const response = await request.post(endpoint, { data: email() });
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });

    test("rejects a request with the wrong secret", async ({ request }) => {
      const response = await request.post(endpoint, {
        data: email(),
        headers: { "X-Webhook-Secret": "not-the-secret" },
      });
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });

  test.describe("validation", () => {
    test("rejects an invalid sender address", async ({ request }) => {
      const response = await request.post(endpoint, { headers, data: email({ from: "not-an-email" }) });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: "Enter a valid sender email address" });
    });

    test("rejects an email without text", async ({ request }) => {
      const { text: _text, ...body } = email();
      const response = await request.post(endpoint, { headers, data: body });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: "Email text is required" });
    });

    test("rejects an email without a Message-ID", async ({ request }) => {
      const { messageId: _id, ...body } = email();
      const response = await request.post(endpoint, { headers, data: body });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: "Enter a valid Message-ID" });
    });
  });

  test.describe("creating tickets", () => {
    test("creates a ticket from a new email", async ({ request }) => {
      const response = await request.post(endpoint, { headers, data: email() });
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.result).toBe("created");
      expect(body.ticketId).toBeTruthy();
    });

    test("accepts a Message-ID without angle brackets and an empty subject", async ({ request }) => {
      const response = await request.post(endpoint, {
        headers,
        data: email({ messageId: newMessageId(), subject: "", from: `UPPER-${crypto.randomUUID()}@Example.com` }),
      });
      expect(response.status()).toBe(201);
      expect((await response.json()).result).toBe("created");
    });

    test("treats the same Message-ID, with or without brackets, as a duplicate", async ({ request }) => {
      const id = newMessageId();
      const first = await request.post(endpoint, { headers, data: email({ messageId: `<${id}>` }) });
      expect(first.status()).toBe(201);
      const { ticketId } = await first.json();

      const second = await request.post(endpoint, { headers, data: email({ messageId: id }) });
      expect(second.status()).toBe(200);
      expect(await second.json()).toEqual({ ticketId, result: "duplicate" });
    });

    test("creates a new ticket when the reply references an unknown message", async ({ request }) => {
      const first = await request.post(endpoint, { headers, data: email() });
      const { ticketId } = await first.json();

      const response = await request.post(endpoint, {
        headers,
        data: email({ inReplyTo: `<${newMessageId()}>` }),
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.result).toBe("created");
      expect(body.ticketId).not.toBe(ticketId);
    });
  });

  test.describe("replies", () => {
    test("appends a reply matched by In-Reply-To to the original ticket", async ({ request }) => {
      const id = newMessageId();
      const first = await request.post(endpoint, { headers, data: email({ messageId: `<${id}>` }) });
      const { ticketId } = await first.json();

      const reply = await request.post(endpoint, {
        headers,
        data: email({ inReplyTo: `<${id}>`, subject: "Re: Help needed" }),
      });
      expect(reply.status()).toBe(200);
      expect(await reply.json()).toEqual({ ticketId, result: "appended" });
    });

    test("appends a reply matched only through References", async ({ request }) => {
      const id = newMessageId();
      const first = await request.post(endpoint, { headers, data: email({ messageId: `<${id}>` }) });
      const { ticketId } = await first.json();

      const reply = await request.post(endpoint, {
        headers,
        data: email({ references: `<${newMessageId()}> <${id}>` }),
      });
      expect(reply.status()).toBe(200);
      expect(await reply.json()).toEqual({ ticketId, result: "appended" });
    });

    test("treats a redelivered reply as a duplicate of the same ticket", async ({ request }) => {
      const id = newMessageId();
      const first = await request.post(endpoint, { headers, data: email({ messageId: `<${id}>` }) });
      const { ticketId } = await first.json();

      const replyBody = email({ inReplyTo: `<${id}>` });
      expect((await request.post(endpoint, { headers, data: replyBody })).status()).toBe(200);
      const again = await request.post(endpoint, { headers, data: replyBody });
      expect(again.status()).toBe(200);
      expect(await again.json()).toEqual({ ticketId, result: "duplicate" });
    });
  });
});
