// Sends a sample email to the local inbound webhook, as a mail provider would.
//   bun run email:sample                       new email -> creates a ticket
//   bun run email:sample --reply-to <id>       reply to an email already on a ticket -> added to that ticket
// Reads INBOUND_EMAIL_SECRET and PORT from server/.env; set API_URL to target another server.
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "reply-to": { type: "string" },
    from: { type: "string", default: "jane.doe@example.com" },
    subject: { type: "string", default: "I can't log in to my course" },
    text: { type: "string", default: "Hi, I reset my password but still can't log in. Can you help?\n\nJane" },
  },
});

const secret = process.env.INBOUND_EMAIL_SECRET;
if (!secret) throw new Error("INBOUND_EMAIL_SECRET is not set in server/.env");
const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

const replyTo = values["reply-to"] && `<${values["reply-to"].replace(/^<|>$/g, "")}>`;
// Printed without angle brackets so it can be passed back via --reply-to (Windows shells choke on <>).
const messageId = `${crypto.randomUUID()}@example.com`;
const res = await fetch(`${apiUrl}/api/webhooks/inbound-email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
  body: JSON.stringify({
    from: values.from,
    fromName: "Jane Doe",
    subject: replyTo ? `Re: ${values.subject}` : values.subject,
    text: values.text,
    messageId: `<${messageId}>`,
    ...(replyTo && { inReplyTo: replyTo, references: replyTo }),
  }),
});
console.log(`Message-ID: ${messageId}`);
console.log(res.status, await res.json());
