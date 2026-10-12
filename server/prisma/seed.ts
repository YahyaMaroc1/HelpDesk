// Creates the admin user from ADMIN_* env vars and the AI agent (seed-ai-agent.ts). Run with `bun run db:seed`.
import { Role } from "../src/generated/prisma/enums.ts";
import { auth } from "../src/lib/auth.ts";
import { prisma } from "../src/lib/prisma.ts";
import { seedAiAgent } from "./seed-ai-agent.ts";

const { ADMIN_NAME = "Admin", ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in server/.env.");
}

// Better Auth stores emails lowercased, so look the admin up the same way.
const email = ADMIN_EMAIL.toLowerCase();

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log(`Admin ${email} already exists; skipping.`);
} else {
  // Public sign-up is disabled, so create the user and credential account the way Better Auth's sign-up does.
  // Hashing directly skips Better Auth's length checks, so apply them here.
  const ctx = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (ADMIN_PASSWORD.length < minPasswordLength || ADMIN_PASSWORD.length > maxPasswordLength) {
    throw new Error(`ADMIN_PASSWORD must be ${minPasswordLength}-${maxPasswordLength} characters.`);
  }
  const user = await ctx.internalAdapter.createUser(
    { name: ADMIN_NAME, email, emailVerified: false, role: Role.ADMIN },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(ADMIN_PASSWORD),
  });
  console.log(`Created admin ${email}.`);
}

await seedAiAgent();

await prisma.$disconnect();
