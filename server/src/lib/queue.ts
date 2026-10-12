import { fromPrisma, PgBoss, type PrismaTransactionLike } from "pg-boss";
import { autoResolveTicketJob, handOverToAgents } from "./auto-resolve-ticket.ts";
import { classifyTicketJob } from "./classify-ticket.ts";

// Background jobs with pg-boss, stored in the app's own Postgres database (in the `pgboss` schema, which pg-boss
// creates and migrates itself on start). The API process runs the workers too: index.ts calls startQueue() before
// it listens.
export const CLASSIFY_TICKET_QUEUE = "classify-ticket";
export const AUTO_RESOLVE_TICKET_QUEUE = "auto-resolve-ticket";
// Auto-resolve jobs that failed every retry, so their tickets can be opened for the agents instead of staying hidden.
export const AUTO_RESOLVE_FAILED_QUEUE = "auto-resolve-ticket-failed";
export type TicketJob = { ticketId: string };

export const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, useListenNotify: true });
boss.on("error", (err) => console.error("pg-boss error:", err));

// Retries a failed job twice, after about 10 s and 20 s. `notify` wakes the worker as soon as a job is sent instead
// of at its next poll.
const retryOptions = { retryLimit: 2, retryDelay: 10, retryBackoff: true, expireInSeconds: 120, notify: true };

export async function startQueue() {
  await boss.start();
  // A failed classification (Gemini down, over quota, an invalid answer) is retried twice, after about 10 s and
  // 20 s. After that the job fails and the ticket stays unclassified for an agent to categorize.
  await boss.createQueue(CLASSIFY_TICKET_QUEUE, retryOptions);
  await boss.work<TicketJob>(CLASSIFY_TICKET_QUEUE, async ([job]) => classifyTicketJob(job!.data.ticketId));

  // A failed auto-resolution is retried the same way. A job that still fails (or times out) is moved to the
  // dead-letter queue, whose worker opens the ticket for the agents.
  await boss.createQueue(AUTO_RESOLVE_FAILED_QUEUE, retryOptions);
  await boss.createQueue(AUTO_RESOLVE_TICKET_QUEUE, { ...retryOptions, deadLetter: AUTO_RESOLVE_FAILED_QUEUE });
  await boss.work<TicketJob>(AUTO_RESOLVE_TICKET_QUEUE, async ([job]) => autoResolveTicketJob(job!.data.ticketId));
  await boss.work<TicketJob>(AUTO_RESOLVE_FAILED_QUEUE, async ([job]) => handOverToAgents(job!.data.ticketId));
}

// Queues a new ticket for classification inside the transaction that creates it, so the job exists exactly when
// the ticket does: a rolled-back ticket leaves no job, and a saved one is never left without one.
export async function enqueueTicketClassification(ticketId: string, tx: PrismaTransactionLike) {
  await boss.send(CLASSIFY_TICKET_QUEUE, { ticketId } satisfies TicketJob, { db: fromPrisma(tx) });
}

// Queues a NEW ticket for the AI to resolve from the knowledge base, inside the transaction that creates it, as for
// classification: a saved ticket is never left NEW (and hidden from the list) without a job to move it on.
export async function enqueueTicketAutoResolution(ticketId: string, tx: PrismaTransactionLike) {
  await boss.send(AUTO_RESOLVE_TICKET_QUEUE, { ticketId } satisfies TicketJob, { db: fromPrisma(tx) });
}
