import { existsSync } from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { healthRouter } from "./routes/health.ts";
import { meRouter } from "./routes/me.ts";

export const app = express();

// Better Auth reads the raw body, so it must be mounted before express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/me", meRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// In production, serve the built client and fall back to index.html for client-side routes.
const clientDist = path.resolve(import.meta.dir, "../../client/dist");
if (process.env.NODE_ENV === "production" && existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("/*splat", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);
