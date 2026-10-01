// Creates the admin user from ADMIN_* env vars. Run with `bun run db:seed`.
import { Role } from "../src/generated/prisma/enums.ts";
import { auth } from "../src/lib/auth.ts";
import { prisma } from "../src/lib/prisma.ts";

const { ADMIN_NAME = "Admin", ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in server/.env.");
}

const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
if (existing) {
  console.log(`Admin ${ADMIN_EMAIL} already exists; skipping.`);
} else {
  // Public sign-up is disabled, so create the user and credential account the way Better Auth's sign-up does.
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    { name: ADMIN_NAME, email: ADMIN_EMAIL.toLowerCase(), emailVerified: false, role: Role.ADMIN },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(ADMIN_PASSWORD),
  });
  console.log(`Created admin ${ADMIN_EMAIL}.`);
}

await prisma.$disconnect();
