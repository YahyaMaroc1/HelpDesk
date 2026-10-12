// Creates the AI agent (src/lib/ai-agent.ts) that new tickets are assigned to while the AI tries to resolve them.
// Run by `bun run db:seed` (prisma/seed.ts), or on its own with `bun run db:seed:ai-agent`.
import { Role } from "../src/generated/prisma/enums.ts";
import { aiAgentEmail, aiAgentName } from "../src/lib/ai-agent.ts";
import { auth } from "../src/lib/auth.ts";
import { prisma } from "../src/lib/prisma.ts";

export async function seedAiAgent() {
  const existing = await prisma.user.findUnique({ where: { email: aiAgentEmail }, select: { id: true, deletedAt: true } });
  if (existing?.deletedAt) {
    // Deleted users keep their row (soft delete), so bring the AI agent back rather than creating another.
    await prisma.user.update({ where: { id: existing.id }, data: { deletedAt: null } });
    console.log(`Restored the deleted AI agent ${aiAgentEmail}.`);
    return;
  }
  if (existing) {
    console.log(`AI agent ${aiAgentEmail} already exists; skipping.`);
    return;
  }
  // Created like the admin in seed.ts, but without a credential account: the AI agent has no password to sign in with.
  const ctx = await auth.$context;
  await ctx.internalAdapter.createUser(
    { name: aiAgentName, email: aiAgentEmail, emailVerified: false, role: Role.AGENT },
    { method: "email-password" },
  );
  console.log(`Created AI agent ${aiAgentEmail}.`);
}

if (import.meta.main) {
  await seedAiAgent();
  await prisma.$disconnect();
}
