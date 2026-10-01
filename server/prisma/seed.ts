// Creates the admin user from ADMIN_* env vars. Run with `bun run db:seed`.
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
  // Goes through Better Auth so the password is hashed and the credential account row is created.
  await auth.api.signUpEmail({ body: { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  console.log(`Created admin ${ADMIN_EMAIL}.`);
}

await prisma.$disconnect();
