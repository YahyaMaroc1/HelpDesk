import { Router } from "express";
import { z } from "zod";
import { Role } from "../generated/prisma/enums.ts";
import { auth, passwordLength } from "../lib/auth.ts";
import { prisma } from "../lib/prisma.ts";

// Admin only: app.ts mounts this router behind requireAuth and requireAdmin.
export const usersRouter = Router();

// Select fields explicitly so nothing sensitive is ever added to the response by accident.
const userFields = { id: true, name: true, email: true, role: true, createdAt: true } as const;

// Mirrors the form in client/src/components/CreateUserDialog.tsx. The `error` on each z.string() also covers
// a missing or non-string field. Better Auth stores emails lowercased.
const passwordMessage = `Password must be ${passwordLength.min}-${passwordLength.max} characters`;
const createUserSchema = z.object({
  name: z.string({ error: "Name must be at least 2 characters" }).trim().min(2, "Name must be at least 2 characters"),
  email: z
    .string({ error: "Enter a valid email address" })
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  password: z
    .string({ error: passwordMessage })
    .min(passwordLength.min, passwordMessage)
    .max(passwordLength.max, passwordMessage),
});

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ select: userFields, orderBy: { createdAt: "asc" } });
  res.json({ users });
});

// Creates an agent. Public sign-up is disabled, so create the user and credential account the way
// prisma/seed.ts does. Hashing directly skips Better Auth's password-length check; the schema applies it.
usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { name, email, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser(
    { name, email, emailVerified: false, role: Role.AGENT },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(password),
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, select: userFields });
  res.status(201).json({ user });
});
