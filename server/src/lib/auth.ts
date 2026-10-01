import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.ts";

// Sessions are stored in the database (no secondaryStorage, no cookie cache).
// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  // The client dev server proxies /api but forwards the browser's Origin header.
  trustedOrigins: process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : [],
});

export type Session = typeof auth.$Infer.Session;
