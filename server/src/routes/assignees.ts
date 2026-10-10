import { Router } from "express";
import { prisma } from "../lib/prisma.ts";

// Agents and admins: app.ts mounts this router behind requireAuth. Unlike /api/users (admin only), this lists just
// what a ticket's assignee picker or filter needs: the active users, by name.
export const assigneesRouter = Router();

assigneesRouter.get("/", async (_req, res) => {
  const assignees = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.json({ assignees });
});
