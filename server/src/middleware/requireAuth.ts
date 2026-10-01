import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.ts";

// Rejects requests without a valid session; otherwise exposes it as res.locals.user / res.locals.session.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!result) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.locals.user = result.user;
  res.locals.session = result.session;
  next();
};
