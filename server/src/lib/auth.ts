import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Role } from "../generated/prisma/enums.ts";
import { prisma } from "./prisma.ts";

// Sessions are stored in the database (no secondaryStorage, no cookie cache).
// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // No public sign-up: users are created server-side (see prisma/seed.ts).
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      // Values come from the Role enum in schema.prisma. input: false so clients can never set it.
      role: { type: Object.values(Role), required: false, defaultValue: Role.AGENT, input: false },
    },
  },
  // The client dev server proxies /api but forwards the browser's Origin header.
  trustedOrigins: process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : [],
});

export type Session = typeof auth.$Infer.Session;
