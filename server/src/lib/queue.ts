import { fromPrisma, PgBoss, type PrismaTransactionLike } from "pg-boss";
import { classifyTicketJob } from "./classify-ticket.ts";

// Background jobs with pg-boss, stored in the app's own Postgres database (in the `pgboss` schema, which pg-boss
// creates and migrates itself on start). The API process runs the workers too: index.ts calls startQueue() before
// it listens.
export const CLASSIFY_TICKET_QUEUE = "classify-ticket";
export type ClassifyTicketJob = { ticketId: string };

export const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, useListenNotify: true });
boss.on("error", (err) => console.error("pg-boss error:", err));

export async function startQueue() {
  await boss.start();
  // A failed classification (Gemini down, over quota, an invalid answer) is retried twice, after about 10 s and
  // 20 s. After that the job fails and the ticket stays unclassified for an agent to categorize. `notify` wakes
  // the worker as soon as a job is sent instead of at its next poll.
  await boss.createQueue(CLASSIFY_TICKET_QUEUE, {
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 120,
    notify: true,
  });
  await boss.work<ClassifyTicketJob>(CLASSIFY_TICKET_QUEUE, async ([job]) => classifyTicketJob(job!.data.ticketId));
}

// Queues a new ticket for classification inside the transaction that creates it, so the job exists exactly when
// the ticket does: a rolled-back ticket leaves no job, and a saved one is never left without one.
export async function enqueueTicketClassification(ticketId: string, tx: PrismaTransactionLike) {
  await boss.send(CLASSIFY_TICKET_QUEUE, { ticketId } satisfies ClassifyTicketJob, { db: fromPrisma(tx) });
}
