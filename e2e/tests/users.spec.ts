import { expect, test } from "@playwright/test";
import { agentAuthFile } from "../test-env.ts";

// The users API's own logic (validation, lookups, 404/409) is unit-tested in server/src/routes/users.test.ts and the
// Users page in client/src/pages/UsersPage.test.tsx. These check the server-side guards that only work with a real
// session: app.ts mounts requireAuth and requireAdmin on the whole /api/users router, so GET stands for every route.
test.describe("GET /api/users", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("returns 401", async ({ request }) => {
      const response = await request.get("/api/users");
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });

  test.describe("agent", () => {
    test.use({ storageState: agentAuthFile });

    test("returns 403", async ({ request }) => {
      const response = await request.get("/api/users");
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
    });
  });
});
