import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { Session } from "../lib/auth.ts";

export const meRouter = Router();

meRouter.get("/", requireAuth, (_req, res) => {
  const user: Session["user"] = res.locals.user;
  res.json({ user });
});
