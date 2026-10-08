// Settings shared by playwright.config.ts and the tests. The test server runs on its own port against its
// own database, so it never touches the dev server (:3000/:5173) or the dev database.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Playwright runs on Node, which doesn't load .env automatically. Already-set variables win (e.g. in CI).
if (existsSync(new URL(".env", import.meta.url))) process.loadEnvFile(new URL(".env", import.meta.url));

export const TEST_PORT = Number(process.env.TEST_PORT ?? 3100);
export const TEST_BASE_URL = `http://localhost:${TEST_PORT}`;

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
// Every run wipes this database, so refuse anything that isn't clearly a test database.
const dbName = TEST_DATABASE_URL ? new URL(TEST_DATABASE_URL).pathname.slice(1) : "";
if (!dbName.endsWith("_test")) {
  throw new Error(
    "TEST_DATABASE_URL must point to a database whose name ends in _test. Copy e2e/.env.example to e2e/.env and fill it in.",
  );
}

// Admin created by the seed in the test database.
export const testAdmin = {
  name: "Test Admin",
  email: "admin@test.local",
  password: "test-admin-password",
};

// AGENT users created by server/prisma/seed-e2e.ts. Passwords must be at least 8 characters.
// testAgent is only read by tests (its storageState is shared). testEscalationAgent is for the test that
// tries to change its own role, so a regression there can't affect other tests.
export const testAgent = {
  name: "Test Agent",
  email: "agent@test.local",
  password: "test-agent-password",
};
export const testEscalationAgent = {
  name: "Escalation Agent",
  email: "escalation-agent@test.local",
  password: "test-escalation-password",
};

// Saved by tests/auth.setup.ts; used as storageState by tests that need a signed-in user.
const authDir = fileURLToPath(new URL("./playwright/.auth/", import.meta.url));
export const adminAuthFile = `${authDir}admin.json`;
export const agentAuthFile = `${authDir}agent.json`;
