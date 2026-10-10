import { createHash, timingSafeEqual } from "node:crypto";
import express, { Router, type RequestHandler } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.ts";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";
import { prisma } from "../lib/prisma.ts";
import { validate } from "../lib/validate.ts";

// Called by the mail pipeline, not by signed-in users: app.ts mounts this router without requireAuth, and every
// request must carry INBOUND_EMAIL_SECRET instead. It's mounted before the app-wide express.json() so it can
// check the secret before parsing the body and accept larger bodies than the rest of the API.
export const webhooksRouter = Router();

// Compares SHA-256 digests so the comparison takes the same time whatever the input's length.
const digest = (value: string) => createHash("sha256").update(value).digest();

const requireWebhookSecret: RequestHandler = (req, res, next) => {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    console.error("INBOUND_EMAIL_SECRET is not set; rejecting inbound email webhook");
    res.status(503).json({ error: "Inbound email is not configured" });
    return;
  }
  const given = req.get("x-webhook-secret");
  if (!given || !timingSafeEqual(digest(given), digest(secret))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

webhooksRouter.use(requireWebhookSecret, express.json({ limit: "1mb" }));

// Message-IDs are compared without their angle brackets, e.g. "<abc@mail.example.com>" -> "abc@mail.example.com".
const messageIdPattern = /<([^<>\s]+)>|([^<>\s]+)/g;
function parseMessageIds(header: string) {
  return [...header.matchAll(messageIdPattern)].map((m) => m[1] ?? m[2]!);
}

const messageIdMessage = "Enter a valid Message-ID";
const optionalHeader = z
  .string({ error: "Headers must be strings" })
  .max(10_000, "Header is too long")
  .optional();

// A provider-neutral email: whichever service receives the mail forwards it to this endpoint in this shape.
const inboundEmailSchema = z.object({
  from: z
    .string({ error: "Enter a valid sender email address" })
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid sender email address")),
  fromName: z
    .string({ error: "Sender name must be a string" })
    .trim()
    .max(200, "Sender name is too long")
    .optional()
    .transform((name) => name || undefined),
  subject: z
    .string({ error: "Subject must be a string" })
    .trim()
    .max(1000, "Subject is too long")
    .default("")
    .transform((subject) => subject || "(no subject)"),
  text: z.string({ error: "Email text is required" }).trim().min(1, "Email text is required"),
  // The email's own Message-ID header.
  messageId: z
    .string({ error: messageIdMessage })
    .max(1000, messageIdMessage)
    .transform(parseMessageIds)
    .pipe(z.array(z.string()).length(1, messageIdMessage))
    .transform(([id]) => id!),
  // Raw In-Reply-To and References headers, used to find the ticket a reply belongs to.
  inReplyTo: optionalHeader,
  references: optionalHeader,
});

// Turns an email into a ticket. A reply to an email already on a ticket (matched by In-Reply-To / References) is
// added to that ticket instead, reopening it if it was resolved. A redelivery of the same Message-ID is ignored.
webhooksRouter.post("/inbound-email", async (req, res) => {
  const email = validate(inboundEmailSchema, req.body, res);
  if (!email) return;
  const { from, fromName, subject, text, messageId, inReplyTo, references } = email;

  const duplicate = async () => {
    const existing = await prisma.message.findUnique({ where: { emailMessageId: messageId }, select: { ticketId: true } });
    return existing && { ticketId: existing.ticketId, result: "duplicate" as const };
  };

  const seen = await duplicate();
  if (seen) {
    res.json(seen);
    return;
  }

  const message = {
    senderType: SenderType.CUSTOMER,
    body: text,
    senderEmail: from,
    senderName: fromName,
    emailMessageId: messageId,
  };
  const threadIds = [...parseMessageIds(inReplyTo ?? ""), ...parseMessageIds(references ?? "")];
  const thread = threadIds.length
    ? await prisma.message.findFirst({
        where: { emailMessageId: { in: threadIds } },
        orderBy: { createdAt: "desc" },
        select: { ticket: { select: { id: true, status: true } } },
      })
    : null;

  try {
    if (thread) {
      const { ticket } = thread;
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          ...(ticket.status === TicketStatus.RESOLVED && { status: TicketStatus.OPEN }),
          messages: { create: message },
        },
      });
      res.json({ ticketId: ticket.id, result: "appended" });
      return;
    }

    const ticket = await prisma.ticket.create({
      data: { subject, senderEmail: from, senderName: fromName, messages: { create: message } },
      select: { id: true },
    });
    res.status(201).json({ ticketId: ticket.id, result: "created" });
  } catch (err) {
    // The same email delivered twice at once: the other request saved it first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await duplicate();
      if (raced) {
        res.json(raced);
        return;
      }
    }
    throw err;
  }
});
