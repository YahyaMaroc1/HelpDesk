import type { RequestHandler } from "express";
import { Role } from "../generated/prisma/enums.ts";
import type { Session } from "../lib/auth.ts";

// Use after requireAuth. Answers 403 unless the signed-in user is an admin.
// The client's RequireAdmin only hides pages; this is what actually protects admin API routes.
export const requireAdmin: RequestHandler = (_req, res, next) => {
  const user: Session["user"] = res.locals.user;
  if (user.role !== Role.ADMIN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};
