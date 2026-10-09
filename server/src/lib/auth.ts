import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { Role } from "../generated/prisma/enums.ts";
import { prisma } from "./prisma.ts";

// Password length limits, shared with code that validates passwords itself (e.g. POST /api/users).
export const passwordLength = { min: 8, max: 128 } as const;

// Sessions are stored in the database (no secondaryStorage, no cookie cache).
// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // No public sign-up: users are created server-side (see prisma/seed.ts).
  // minPasswordLength applies when a password is set or changed, not at sign-in. Code that hashes
  // passwords itself (prisma/seed.ts, future user management) must check it too.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: passwordLength.min,
    maxPasswordLength: passwordLength.max,
  },
  user: {
    additionalFields: {
      // Values come from the Role enum in schema.prisma. input: false so clients can never set it.
      role: { type: Object.values(Role), required: false, defaultValue: Role.AGENT, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Soft-deleted users can't sign in. This runs after the password check, and answers exactly like a wrong
        // password (Better Auth's INVALID_EMAIL_OR_PASSWORD), so it doesn't reveal that the account exists.
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { deletedAt: true } });
          if (user?.deletedAt) {
            throw new APIError("UNAUTHORIZED", { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
          }
        },
      },
    },
  },
  // The client dev server proxies /api but forwards the browser's Origin header.
  trustedOrigins: process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : [],
  // Production only (NODE_ENV=production), so dev and the e2e tests (NODE_ENV=test) aren't throttled.
  // Stored in Postgres so limits survive restarts. Sign-in keeps the built-in 3 requests / 10 s per IP.
  // The client IP comes from X-Forwarded-For, which app.ts overwrites with Express's req.ip so clients
  // can't spoof it.
  rateLimit: { enabled: process.env.NODE_ENV === "production", storage: "database" },
});

export type Session = typeof auth.$Infer.Session;
