import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";
import { aiSenderName, autoResolveTicket, isAiConfigured } from "./ai.ts";
import { loadKnowledgeBase } from "./knowledge-base.ts";
import { prisma } from "./prisma.ts";

// Messages the AI writes need a sender address; this one can't receive mail (.invalid is a reserved domain).
export const aiSenderEmail = "ai-assistant@helpdesk.invalid";

// Tickets the AI may still work on. A retried job finds its ticket PROCESSING already.
const awaitingAi = { in: [TicketStatus.NEW, TicketStatus.PROCESSING] };

// Tries to resolve a NEW ticket from the knowledge base. Run by the pg-boss worker for each new ticket (lib/queue.ts).
// The ticket is PROCESSING while the AI works on it; both statuses keep it out of the ticket list. When the knowledge
// base answers the customer's first message, the AI's reply is added to the thread and the ticket becomes RESOLVED;
// otherwise, or when the AI call fails, it becomes OPEN for the agents. It throws when reading the knowledge base or a
// save fails, so pg-boss retries the job; once the retries run out, the dead-letter worker opens the ticket
// (handOverToAgents). An agent who opened the ticket
// by its link and set a status meanwhile wins: the job then leaves the ticket alone.
export async function autoResolveTicketJob(ticketId: string) {
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, status: awaitingAi },
    data: { status: TicketStatus.PROCESSING },
  });
  if (count === 0) return;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        subject: true,
        senderName: true,
        messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
      },
    });
    const firstMessage = ticket?.messages[0];
    const knowledgeBase = isAiConfigured() && firstMessage ? await loadKnowledgeBase() : null;
    // A failed AI call (Gemini down, over quota, an answer that doesn't match the schema) isn't retried: the ticket
    // goes to the agents right away rather than waiting for the AI.
    const reply =
      knowledgeBase &&
      (await autoResolveTicket({
        subject: ticket!.subject,
        body: firstMessage!.body,
        customerName: ticket!.senderName,
        knowledgeBase,
      }).catch((err) => {
        console.error(`The AI couldn't answer ticket ${ticketId}; opening it for the agents:`, err);
        return null;
      }));
    if (!reply) {
      await handOverToAgents(ticketId);
      return;
    }

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, status: TicketStatus.PROCESSING },
        data: { status: TicketStatus.RESOLVED },
      });
      if (count === 0) return;
      await tx.message.create({
        data: { ticketId, senderType: SenderType.AI, body: reply, senderEmail: aiSenderEmail, senderName: aiSenderName },
      });
    });
  } catch (err) {
    console.error(`Couldn't auto-resolve ticket ${ticketId}:`, err);
    throw err;
  }
}

// Gives a ticket the AI didn't resolve to the agents: it's OPEN and shows up in the ticket list from now on.
export async function handOverToAgents(ticketId: string) {
  await prisma.ticket.updateMany({ where: { id: ticketId, status: awaitingAi }, data: { status: TicketStatus.OPEN } });
}
