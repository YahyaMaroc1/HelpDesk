import { test as setup, expect } from "@playwright/test";
import { adminAuthFile, agentAuthFile, testAdmin, testAgent } from "../test-env.ts";

// Signs in through the API (the login form has its own tests) and saves the session cookie for reuse.
for (const [role, user, file] of [
  ["admin", testAdmin, adminAuthFile],
  ["agent", testAgent, agentAuthFile],
] as const) {
  setup(`authenticate as ${role}`, async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: user.email, password: user.password },
    });
    expect(response.ok()).toBeTruthy();
    await request.storageState({ path: file });
  });
}
