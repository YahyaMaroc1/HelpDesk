import { defineConfig, devices } from "@playwright/test";
import { TEST_BASE_URL, TEST_DATABASE_URL, TEST_PORT, testAdmin } from "./test-env.ts";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: TEST_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Resets the test database (migrations + seed), builds the client and serves it from the API
  // (as in production), so the browser and API share one origin. Runs fresh every time, so the database is
  // always reset before a run. Values set here override server/.env (BETTER_AUTH_SECRET still comes from it).
  webServer: {
    command:
      "bun --bun prisma migrate reset --force && bun --bun prisma db seed && bun run --cwd ../client build && bun src/index.ts",
    cwd: "../server",
    url: `${TEST_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      // Not "production": that would turn on Better Auth's rate limiter. app.ts still serves client/dist.
      NODE_ENV: "test",
      PORT: String(TEST_PORT),
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_URL: TEST_BASE_URL,
      CLIENT_ORIGIN: "",
      ADMIN_NAME: testAdmin.name,
      ADMIN_EMAIL: testAdmin.email,
      ADMIN_PASSWORD: testAdmin.password,
    },
  },
});
