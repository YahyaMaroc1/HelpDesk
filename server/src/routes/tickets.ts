import { Router } from "express";
import { prisma } from "../lib/prisma.ts";

// Agents and admins: app.ts mounts this router behind requireAuth.
export const ticketsRouter = Router();

// Select fields explicitly so the list stays small and nothing is added to the response by accident.
const ticketListFields = {
  id: true,
  subject: true,
  senderEmail: true,
  senderName: true,
  status: true,
  category: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

// Newest first.
ticketsRouter.get("/", async (_req, res) => {
  const tickets = await prisma.ticket.findMany({ select: ticketListFields, orderBy: { createdAt: "desc" } });
  res.json({ tickets });
});
