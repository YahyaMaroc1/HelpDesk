import { Router } from "express";
import { z } from "zod";
import { Role } from "../generated/prisma/enums.ts";
import { auth, passwordLength, type Session } from "../lib/auth.ts";
import { prisma } from "../lib/prisma.ts";

// Admin only: app.ts mounts this router behind requireAuth and requireAdmin.
export const usersRouter = Router();

// Select fields explicitly so nothing sensitive is ever added to the response by accident.
const userFields = { id: true, name: true, email: true, role: true, createdAt: true } as const;

// Mirrors the form in client/src/components/UserForm.tsx. The `error` on each z.string() also covers
// a missing or non-string field. Better Auth stores emails lowercased.
const passwordMessage = `Password must be ${passwordLength.min}-${passwordLength.max} characters`;
const passwordSchema = z
  .string({ error: passwordMessage })
  .min(passwordLength.min, passwordMessage)
  .max(passwordLength.max, passwordMessage);
const createUserSchema = z.object({
  name: z.string({ error: "Name must be at least 3 characters" }).trim().min(3, "Name must be at least 3 characters"),
  email: z
    .string({ error: "Enter a valid email address" })
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  password: passwordSchema,
});

// Mirrors the edit mode of client/src/components/UserForm.tsx. Leave out `password` to keep the current one.
const updateUserSchema = createUserSchema.extend({ password: passwordSchema.optional() });
const userParamsSchema = z.object({ id: z.string().min(1, "User not found") });

// Why `email` can't be used, or null if it's free. Soft-deleted users keep their email, so it stays taken.
async function emailConflict(email: string, exceptUserId?: string) {
  const existing = await prisma.user.findFirst({
    where: { email, ...(exceptUserId && { NOT: { id: exceptUserId } }) },
    select: { deletedAt: true },
  });
  if (!existing) return null;
  return existing.deletedAt ? "This email belongs to a deleted user" : "A user with this email already exists";
}

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: userFields,
    orderBy: { createdAt: "asc" },
  });
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

  const conflict = await emailConflict(email);
  if (conflict) {
    res.status(409).json({ error: conflict });
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

// Edits a user's name and email, and sets a new password when one is given.
usersRouter.patch("/:id", async (req, res) => {
  const params = userParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: params.error.issues[0]?.message ?? "User not found" });
    return;
  }
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { id } = params.data;
  const { name, email, password } = parsed.data;

  if (!(await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } }))) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const conflict = await emailConflict(email, id);
  if (conflict) {
    res.status(409).json({ error: conflict });
    return;
  }

  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(id, { name, email });
  if (password) {
    // As Better Auth's admin plugin does: update the credential account, or add one if the user has none.
    // Hashing directly skips Better Auth's password-length check; the schema applies it.
    const hash = await ctx.password.hash(password);
    if (await ctx.internalAdapter.findCredentialAccount(id)) {
      await ctx.internalAdapter.updatePassword(id, hash);
    } else {
      await ctx.internalAdapter.linkAccount({ userId: id, providerId: "credential", accountId: id, password: hash });
    }
    // Sign the user out everywhere, so the old password stops working immediately. An admin changing their
    // own password keeps the session they're using.
    const current: Session["session"] = res.locals.session;
    await prisma.session.deleteMany({ where: { userId: id, NOT: { id: current.id } } });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: userFields });
  res.json({ user });
});

// Soft-deletes a user: they're hidden from the list, signed out everywhere, and can no longer sign in (see the
// session hook in lib/auth.ts). The row stays, so their email remains taken. Admins can't be deleted.
usersRouter.delete("/:id", async (req, res) => {
  const params = userParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: params.error.issues[0]?.message ?? "User not found" });
    return;
  }
  const { id } = params.data;

  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { role: true } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.role === Role.ADMIN) {
    res.status(403).json({ error: "Admins can't be deleted" });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  res.status(204).end();
});
