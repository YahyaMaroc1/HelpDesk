import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { Prisma } from "../generated/prisma/client.ts";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";

// The router's database calls, stubbed so the tests need no database. Mocked before the router is imported, so
// lib/prisma.ts (which connects to DATABASE_URL) is never loaded.
const prisma = {
  message: { findUnique: mock(), findFirst: mock() },
  ticket: { create: mock(), update: mock() },
  $transaction: mock(),
};
mock.module("../lib/prisma.ts", () => ({ prisma }));
// The job queue, stubbed so the tests need no pg-boss (lib/classify-ticket.test.ts and
// lib/auto-resolve-ticket.test.ts cover the jobs themselves).
const enqueueTicketClassification = mock();
const enqueueTicketAutoResolution = mock();
mock.module("../lib/queue.ts", () => ({ enqueueTicketClassification, enqueueTicketAutoResolution }));
const { webhooksRouter } = await import("./webhooks.ts");

// Mounted as in app.ts: before any app-wide express.json(), since the router checks the secret and parses the
// body itself.
const secret = "test-webhook-secret";
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;
let savedSecret: string | undefined;

beforeAll(() => {
  savedSecret = process.env.INBOUND_EMAIL_SECRET;
  const app = express();
  app.use("/api/webhooks", webhooksRouter);
  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  if (savedSecret === undefined) delete process.env.INBOUND_EMAIL_SECRET;
  else process.env.INBOUND_EMAIL_SECRET = savedSecret;
});

beforeEach(() => {
  process.env.INBOUND_EMAIL_SECRET = secret;
  // A new email by default: no message with its Message-ID and no thread to reply to.
  prisma.message.findUnique.mockReset().mockResolvedValue(null);
  prisma.message.findFirst.mockReset().mockResolvedValue(null);
  prisma.ticket.create.mockReset().mockResolvedValue({ id: "t-new" });
  prisma.ticket.update.mockReset().mockResolvedValue({});
  // Runs the callback with the stubbed client as its transaction client.
  prisma.$transaction.mockReset().mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  enqueueTicketClassification.mockReset().mockResolvedValue(undefined);
  enqueueTicketAutoResolution.mockReset().mockResolvedValue(undefined);
});

// A valid email; override fields per test.
function email(overrides: Record<string, unknown> = {}) {
  return {
    from: "jane@example.com",
    fromName: "Jane Doe",
    subject: "Help needed",
    text: "Something is broken.",
    messageId: "<abc@mail.example.com>",
    ...overrides,
  };
}

async function post(body: unknown, headers: Record<string, string> = { "X-Webhook-Secret": secret }) {
  const res = await fetch(`${baseUrl}/api/webhooks/inbound-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function expectNothingWritten() {
  expect(prisma.ticket.create).not.toHaveBeenCalled();
  expect(prisma.ticket.update).not.toHaveBeenCalled();
}

describe("POST /api/webhooks/inbound-email secret", () => {
  test.each([
    ["without the secret", {}],
    ["with the wrong secret", { "X-Webhook-Secret": "not-the-secret" }],
  ])("rejects a request %s", async (_, headers) => {
    const res = await post(email(), headers);

    expect(res).toEqual({ status: 401, body: { error: "Unauthorized" } });
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  test("answers 503 when no secret is configured", async () => {
    delete process.env.INBOUND_EMAIL_SECRET;
    const consoleError = mock();
    const original = console.error;
    console.error = consoleError;
    try {
      const res = await post(email());

      expect(res).toEqual({ status: 503, body: { error: "Inbound email is not configured" } });
      expectNothingWritten();
    } finally {
      console.error = original;
    }
  });
});

describe("POST /api/webhooks/inbound-email validation", () => {
  test.each([
    ["an invalid sender address", email({ from: "not-an-email" }), "Enter a valid sender email address"],
    ["a missing sender", email({ from: undefined }), "Enter a valid sender email address"],
    ["missing text", email({ text: undefined }), "Email text is required"],
    ["text that's only whitespace", email({ text: "  \n " }), "Email text is required"],
    ["a missing Message-ID", email({ messageId: undefined }), "Enter a valid Message-ID"],
    ["an empty Message-ID", email({ messageId: "" }), "Enter a valid Message-ID"],
    ["two Message-IDs", email({ messageId: "<a@x> <b@x>" }), "Enter a valid Message-ID"],
  ])("rejects %s", async (_, body, error) => {
    const res = await post(body);

    expect(res).toEqual({ status: 400, body: { error } });
    expectNothingWritten();
  });
});

describe("POST /api/webhooks/inbound-email new emails", () => {
  test("creates a NEW ticket with the email as its first customer message", async () => {
    const res = await post(email());

    expect(res).toEqual({ status: 201, body: { ticketId: "t-new", result: "created" } });
    expect(prisma.ticket.create).toHaveBeenCalledWith({
      data: {
        subject: "Help needed",
        senderEmail: "jane@example.com",
        senderName: "Jane Doe",
        status: TicketStatus.NEW,
        messages: {
          create: {
            senderType: SenderType.CUSTOMER,
            body: "Something is broken.",
            senderEmail: "jane@example.com",
            senderName: "Jane Doe",
            emailMessageId: "abc@mail.example.com",
          },
        },
      },
      select: { id: true },
    });
  });

  test("queues the new ticket for classification in the transaction that creates it", async () => {
    const res = await post(email());

    expect(res.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(enqueueTicketClassification).toHaveBeenCalledWith("t-new", prisma);
    expect(prisma.ticket.create.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueTicketClassification.mock.invocationCallOrder[0]!,
    );
  });

  test("queues the new ticket for the AI to resolve, in the transaction that creates it", async () => {
    const res = await post(email());

    expect(res.status).toBe(201);
    expect(enqueueTicketAutoResolution).toHaveBeenCalledWith("t-new", prisma);
    expect(prisma.ticket.create.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueTicketAutoResolution.mock.invocationCallOrder[0]!,
    );
  });

  test("fails without answering 201 when the auto-resolve job can't be queued", async () => {
    enqueueTicketAutoResolution.mockRejectedValue(new Error("connection lost"));

    const res = await fetch(`${baseUrl}/api/webhooks/inbound-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
      body: JSON.stringify(email()),
    });

    expect(res.status).toBe(500);
  });

  test("fails without answering 201 when the job can't be queued, so the email is redelivered", async () => {
    enqueueTicketClassification.mockRejectedValue(new Error("connection lost"));

    const res = await fetch(`${baseUrl}/api/webhooks/inbound-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
      body: JSON.stringify(email()),
    });

    expect(res.status).toBe(500);
  });

  test("lowercases the sender, strips the Message-ID's brackets and fills in an empty subject and name", async () => {
    await post(email({ from: " Jane@Example.COM ", fromName: "  ", subject: "", messageId: "abc@mail.example.com" }));

    const { data } = prisma.ticket.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ subject: "(no subject)", senderEmail: "jane@example.com", senderName: undefined });
    expect(data.messages).toMatchObject({ create: { emailMessageId: "abc@mail.example.com" } });
  });

  test("creates a new ticket when the reply headers match no stored message", async () => {
    const res = await post(email({ inReplyTo: "<unknown@mail.example.com>" }));

    expect(res).toEqual({ status: 201, body: { ticketId: "t-new", result: "created" } });
    expect(prisma.message.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { emailMessageId: { in: ["unknown@mail.example.com"] } },
    });
  });

  test("doesn't look for a thread when there are no reply headers", async () => {
    await post(email());

    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/inbound-email replies", () => {
  function threadIs(status: TicketStatus) {
    prisma.message.findFirst.mockResolvedValue({ ticket: { id: "t1", status } });
  }

  test("appends a reply matched by In-Reply-To to its ticket", async () => {
    threadIs(TicketStatus.OPEN);

    const res = await post(email({ messageId: "<reply@mail.example.com>", inReplyTo: "<abc@mail.example.com>" }));

    expect(res).toEqual({ status: 200, body: { ticketId: "t1", result: "appended" } });
    expect(prisma.message.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { emailMessageId: { in: ["abc@mail.example.com"] } },
    });
    expect(prisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { messages: { create: expect.objectContaining({ emailMessageId: "reply@mail.example.com" }) } },
    });
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  test("looks up every Message-ID from In-Reply-To and References", async () => {
    threadIs(TicketStatus.OPEN);

    await post(email({ inReplyTo: "<a@x>", references: "<b@x> <c@x>" }));

    expect(prisma.message.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { emailMessageId: { in: ["a@x", "b@x", "c@x"] } },
    });
  });

  test("reopens a resolved ticket", async () => {
    threadIs(TicketStatus.RESOLVED);

    await post(email({ references: "<abc@mail.example.com>" }));

    expect(prisma.ticket.update.mock.calls[0]?.[0]).toMatchObject({ data: { status: TicketStatus.OPEN } });
  });

  test("doesn't classify or auto-resolve the ticket again", async () => {
    threadIs(TicketStatus.OPEN);

    await post(email({ references: "<abc@mail.example.com>" }));

    expect(enqueueTicketClassification).not.toHaveBeenCalled();
    expect(enqueueTicketAutoResolution).not.toHaveBeenCalled();
  });

  test.each([TicketStatus.OPEN, TicketStatus.CLOSED])("leaves a %s ticket's status alone", async (status) => {
    threadIs(status);

    await post(email({ references: "<abc@mail.example.com>" }));

    expect(prisma.ticket.update.mock.calls[0]?.[0]).not.toHaveProperty("data.status");
  });
});

describe("POST /api/webhooks/inbound-email duplicates", () => {
  test("ignores an email whose Message-ID is already stored, with or without brackets", async () => {
    prisma.message.findUnique.mockResolvedValue({ ticketId: "t1" });

    for (const messageId of ["<abc@mail.example.com>", "abc@mail.example.com"]) {
      const res = await post(email({ messageId, inReplyTo: "<earlier@mail.example.com>" }));
      expect(res).toEqual({ status: 200, body: { ticketId: "t1", result: "duplicate" } });
    }
    expect(prisma.message.findUnique.mock.calls.map(([args]) => args)).toEqual([
      { where: { emailMessageId: "abc@mail.example.com" }, select: { ticketId: true } },
      { where: { emailMessageId: "abc@mail.example.com" }, select: { ticketId: true } },
    ]);
    expectNothingWritten();
    expect(enqueueTicketClassification).not.toHaveBeenCalled();
  });

  test("reports a duplicate when a concurrent delivery saved the same email first", async () => {
    prisma.message.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ticketId: "t-raced" });
    prisma.ticket.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );

    const res = await post(email());

    expect(res).toEqual({ status: 200, body: { ticketId: "t-raced", result: "duplicate" } });
  });
});
