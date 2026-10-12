import { classifyTicket, isAiConfigured } from "./ai.ts";
import { prisma } from "./prisma.ts";

// Classifies a ticket with AI from its subject and first message, and saves the category. Run by the pg-boss
// worker for each new ticket (lib/queue.ts). It throws when the AI call or the save fails, so pg-boss retries the
// job; until then the ticket stays unclassified. Without an API key, or when the ticket is gone or already has a
// category, there's nothing to do. An agent may also set the category while the model is answering; that choice
// wins, so only a still-unclassified ticket is updated.
export async function classifyTicketJob(ticketId: string) {
  if (!isAiConfigured()) return;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subject: true, category: true, messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } } },
  });
  const firstMessage = ticket?.messages[0];
  if (!ticket || ticket.category || !firstMessage) return;

  try {
    const category = await classifyTicket({ subject: ticket.subject, body: firstMessage.body });
    await prisma.ticket.updateMany({ where: { id: ticketId, category: null }, data: { category } });
  } catch (err) {
    console.error(`Couldn't classify ticket ${ticketId}:`, err);
    throw err;
  }
}
