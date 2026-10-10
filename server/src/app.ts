import { existsSync } from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { requireAdmin } from "./middleware/requireAdmin.ts";
import { requireAuth } from "./middleware/requireAuth.ts";
import { assigneesRouter } from "./routes/assignees.ts";
import { healthRouter } from "./routes/health.ts";
import { meRouter } from "./routes/me.ts";
import { ticketsRouter } from "./routes/tickets.ts";
import { usersRouter } from "./routes/users.ts";
import { webhooksRouter } from "./routes/webhooks.ts";

export const app = express();
app.disable("x-powered-by");

// Basic hardening headers for the API and the production-served client.
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  if (process.env.BETTER_AUTH_URL?.startsWith("https://")) {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Leave TRUST_PROXY unset when clients connect directly. Behind a reverse proxy, set it to the proxy's
// address/CIDR (or a hop count) so req.ip is the real client. See Express's "trust proxy" setting.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// Better Auth rate-limits by the IP in X-Forwarded-For. Replace whatever the client sent with req.ip,
// which only honors forwarded headers from trusted proxies, so the limit can't be dodged by spoofing it.
app.use("/api/auth", (req, _res, next) => {
  if (req.ip) req.headers["x-forwarded-for"] = req.ip;
  else delete req.headers["x-forwarded-for"];
  next();
});

// Better Auth reads the raw body, so it must be mounted before express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

// Authenticated by a shared secret rather than a session; parses its own (larger) JSON bodies.
app.use("/api/webhooks", webhooksRouter);

app.use(express.json({ limit: "100kb" }));

app.use("/api/health", healthRouter);
app.use("/api/me", meRouter);
app.use("/api/tickets", requireAuth, ticketsRouter);
app.use("/api/assignees", requireAuth, assigneesRouter);
app.use("/api/users", requireAuth, requireAdmin, usersRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// In production (and the e2e test server), serve the built client and fall back to index.html for
// client-side routes.
const clientDist = path.resolve(import.meta.dir, "../../client/dist");
const servesClient = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test";
if (servesClient && existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("/*splat", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Client errors (e.g. invalid JSON or an oversized body from express.json()) keep their 4xx status.
// Only messages marked safe to expose (err.expose) are returned; server errors stay generic.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status: number = err.status ?? err.statusCode ?? 500;
  if (status >= 500) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
  res.status(status).json({ error: err.expose ? err.message : "Bad request" });
};
app.use(errorHandler);
