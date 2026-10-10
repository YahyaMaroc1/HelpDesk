import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminAuthFile } from "../test-env.ts";

// DELETE /api/users/:id's own logic (404s, admins can't be deleted, the soft delete) is unit-tested in
// server/src/routes/users.test.ts and the delete confirmation in the client's component tests. This checks what only
// works end to end: Better Auth really drops the deleted user's session and the session hook in lib/auth.ts blocks
// their sign-in.

type ApiUser = { id: string; name: string; email: string; role: "ADMIN" | "AGENT"; createdAt: string };

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@delete.test.local`;
}

const validPassword = "delete-user-password";

// Creates a fresh agent as the admin. Every test deletes its own agent, never a seeded user.
async function createAgent(request: APIRequestContext, label: string, name = `Doomed ${label}`) {
  const email = uniqueEmail(label);
  const response = await request.post("/api/users", { data: { name, email, password: validPassword } });
  expect(response.status()).toBe(201);
  const { user } = (await response.json()) as { user: ApiUser };
  return user;
}

test.describe("DELETE /api/users/:id", () => {
  test.use({ storageState: adminAuthFile });

  test("signs the deleted user out and blocks signing in again", async ({ request, playwright, baseURL }) => {
    const agent = await createAgent(request, "lockout");
    const signedIn = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const fresh = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const signIn = await signedIn.post("/api/auth/sign-in/email", {
        data: { email: agent.email, password: validPassword },
      });
      expect(signIn.status()).toBe(200);
      expect((await signedIn.get("/api/me")).status()).toBe(200);

      expect((await request.delete(`/api/users/${agent.id}`)).status()).toBe(204);

      // The existing session is gone.
      expect((await signedIn.get("/api/me")).status()).toBe(401);

      // The correct password is rejected exactly like a wrong one.
      const wrong = await fresh.post("/api/auth/sign-in/email", {
        data: { email: agent.email, password: "wrong-password-1" },
      });
      const correct = await fresh.post("/api/auth/sign-in/email", {
        data: { email: agent.email, password: validPassword },
      });
      expect(wrong.status()).toBe(401);
      expect(correct.status()).toBe(401);
      const correctBody = (await correct.json()) as { code?: string; message?: string };
      expect(correctBody).toEqual(await wrong.json());
      expect(correctBody.code).toBe("INVALID_EMAIL_OR_PASSWORD");
      expect((await fresh.get("/api/me")).status()).toBe(401);
    } finally {
      await signedIn.dispose();
      await fresh.dispose();
    }
  });
});
