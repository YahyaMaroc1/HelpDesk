// Creates AGENT users for the e2e tests from the E2E_AGENTS env var (a JSON array of
// { name, email, password }). Run by e2e/playwright.config.ts after `prisma db seed`; not part of the dev seed.
import { Role } from "../src/generated/prisma/enums.ts";
import { auth } from "../src/lib/auth.ts";
import { prisma } from "../src/lib/prisma.ts";

type AgentInput = { name: string; email: string; password: string };

const agents: AgentInput[] = JSON.parse(process.env.E2E_AGENTS ?? "[]");
const ctx = await auth.$context;
const { minPasswordLength, maxPasswordLength } = ctx.password.config;

for (const agent of agents) {
  // Better Auth stores emails lowercased.
  const email = agent.email.toLowerCase();
  if (agent.password.length < minPasswordLength || agent.password.length > maxPasswordLength) {
    throw new Error(`Password for ${email} must be ${minPasswordLength}-${maxPasswordLength} characters.`);
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log(`Agent ${email} already exists; skipping.`);
    continue;
  }
  const user = await ctx.internalAdapter.createUser(
    { name: agent.name, email, emailVerified: false, role: Role.AGENT },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(agent.password),
  });
  console.log(`Created agent ${email}.`);
}

await prisma.$disconnect();
