import { Router } from "express";
import { prisma } from "../lib/prisma.ts";

// Admin only: app.ts mounts this router behind requireAuth and requireAdmin.
export const usersRouter = Router();

usersRouter.get("/", async (_req, res) => {
  // Select fields explicitly so nothing sensitive is ever added to the response by accident.
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ users });
});
