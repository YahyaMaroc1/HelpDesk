import { Router } from "express";
import { prisma } from "../lib/prisma.ts";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let database: "ok" | "unreachable" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Database health check failed:", err);
    database = "unreachable";
  }

  res.status(database === "ok" ? 200 : 503).json({
    status: database === "ok" ? "ok" : "degraded",
    database,
    runtime: `bun ${Bun.version}`,
    time: new Date().toISOString(),
  });
});
