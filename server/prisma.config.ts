// Bun loads .env automatically, so no dotenv import is needed.
// Run Prisma commands with `bun --bun prisma ...` (see the db:* scripts).
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Read optionally (not with env()) so `prisma generate` works without a database configured.
    url: process.env.DATABASE_URL ?? "",
  },
});
