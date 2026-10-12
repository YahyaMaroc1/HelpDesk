import { app } from "./app.ts";
import { boss, startQueue } from "./lib/queue.ts";

const port = Number(process.env.PORT ?? 3000);

// Background jobs (ticket classification) run in this process; start them before taking requests that queue jobs.
await startQueue();

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

// Lets running jobs finish (pg-boss waits up to 30 s) before exiting.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    server.close();
    await boss.stop();
    process.exit(0);
  });
}
