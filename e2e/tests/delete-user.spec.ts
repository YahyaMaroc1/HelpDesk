import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminAuthFile, agentAuthFile, testAdmin } from "../test-env.ts";

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

async function listUsers(request: APIRequestContext) {
  const response = await request.get("/api/users");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { users: ApiUser[] }).users;
}

test.describe("DELETE /api/users/:id", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("returns 401", async ({ request }) => {
      const response = await request.delete("/api/users/some-user-id");
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });

  test.describe("agent", () => {
    test.use({ storageState: agentAuthFile });

    test("returns 403", async ({ request }) => {
      const response = await request.delete("/api/users/some-user-id");
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
    });
  });

  test.describe("admin", () => {
    test.use({ storageState: adminAuthFile });

    test("deletes an agent with 204 and removes it from the list", async ({ request }) => {
      const agent = await createAgent(request, "delete-ok");

      const response = await request.delete(`/api/users/${agent.id}`);
      expect(response.status()).toBe(204);
      expect(await response.text()).toBe("");

      const users = await listUsers(request);
      expect(users.some((u) => u.id === agent.id)).toBe(false);
      expect(users.some((u) => u.email === agent.email)).toBe(false);
    });

    test("returns 404 when deleting the same user again", async ({ request }) => {
      const agent = await createAgent(request, "delete-twice");
      expect((await request.delete(`/api/users/${agent.id}`)).status()).toBe(204);

      const again = await request.delete(`/api/users/${agent.id}`);
      expect(again.status()).toBe(404);
      expect(await again.json()).toEqual({ error: "User not found" });
    });

    test("returns 404 for an unknown id", async ({ request }) => {
      const response = await request.delete("/api/users/does-not-exist-id");
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: "User not found" });
    });

    test("returns 404 when editing a deleted user", async ({ request }) => {
      const agent = await createAgent(request, "patch-deleted");
      expect((await request.delete(`/api/users/${agent.id}`)).status()).toBe(204);

      const response = await request.patch(`/api/users/${agent.id}`, {
        data: { name: "Renamed Ghost", email: agent.email },
      });
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: "User not found" });
    });

    test("refuses to delete an admin, including the signed-in admin themselves", async ({ request }) => {
      const me = await request.get("/api/me");
      expect(me.status()).toBe(200);
      const users = await listUsers(request);
      const admin = users.find((u) => u.email === testAdmin.email);
      expect(admin).toBeDefined();

      const response = await request.delete(`/api/users/${admin!.id}`);
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: "Admins can't be deleted" });

      expect((await listUsers(request)).some((u) => u.id === admin!.id)).toBe(true);
      expect((await request.get("/api/me")).status()).toBe(200);
    });

    test("keeps a deleted user's email reserved for creating users", async ({ request }) => {
      const agent = await createAgent(request, "reserved-create");
      expect((await request.delete(`/api/users/${agent.id}`)).status()).toBe(204);

      const response = await request.post("/api/users", {
        data: { name: "Email Thief", email: agent.email, password: validPassword },
      });
      expect(response.status()).toBe(409);
      expect(await response.json()).toEqual({ error: "This email belongs to a deleted user" });
    });

    test("keeps a deleted user's email reserved for renaming another user", async ({ request }) => {
      const deleted = await createAgent(request, "reserved-patch-deleted");
      const other = await createAgent(request, "reserved-patch-other");
      expect((await request.delete(`/api/users/${deleted.id}`)).status()).toBe(204);

      const response = await request.patch(`/api/users/${other.id}`, {
        data: { name: other.name, email: deleted.email },
      });
      expect(response.status()).toBe(409);
      expect(await response.json()).toEqual({ error: "This email belongs to a deleted user" });

      const stillOther = (await listUsers(request)).find((u) => u.id === other.id);
      expect(stillOther?.email).toBe(other.email);
    });

    test("still reports an active user's email as already existing", async ({ request }) => {
      const agent = await createAgent(request, "active-conflict");
      const response = await request.post("/api/users", {
        data: { name: "Copycat", email: agent.email, password: validPassword },
      });
      expect(response.status()).toBe(409);
      expect(await response.json()).toEqual({ error: "A user with this email already exists" });
    });

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
});

test.describe("Delete user on the Users page", () => {
  test.use({ storageState: adminAuthFile });

  function rowFor(page: import("@playwright/test").Page, email: string) {
    return page.getByRole("row").filter({ has: page.getByRole("cell", { name: email, exact: true }) });
  }

  test("shows Edit but no Delete button on the admin's row, and both on an agent's row", async ({ page, request }) => {
    const agent = await createAgent(request, "ui-buttons");
    await page.goto("/users");

    const adminRow = rowFor(page, testAdmin.email);
    await expect(adminRow).toHaveCount(1);
    await expect(adminRow.getByRole("button", { name: `Edit ${testAdmin.name}` })).toBeVisible();
    await expect(adminRow.getByRole("button", { name: /^Delete/ })).toHaveCount(0);

    const agentRow = rowFor(page, agent.email);
    await expect(agentRow.getByRole("button", { name: `Edit ${agent.name}` })).toBeVisible();
    await expect(agentRow.getByRole("button", { name: `Delete ${agent.name}` })).toBeVisible();
  });

  test("opens a confirmation naming the user, and Cancel keeps the user without a request", async ({
    page,
    request,
  }) => {
    const agent = await createAgent(request, "ui-cancel");
    let deletes = 0;
    page.on("request", (req) => {
      if (req.method() === "DELETE" && new URL(req.url()).pathname.startsWith("/api/users/")) deletes++;
    });
    await page.goto("/users");

    await rowFor(page, agent.email).getByRole("button", { name: `Delete ${agent.name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete user?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${agent.name} (${agent.email}) will be signed out and can no longer sign in.`);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(rowFor(page, agent.email)).toHaveCount(1);
    expect(deletes).toBe(0);
    expect((await listUsers(request)).some((u) => u.id === agent.id)).toBe(true);
  });

  test("confirming closes the dialog, removes the row and stays gone after a reload", async ({ page, request }) => {
    const agent = await createAgent(request, "ui-confirm");
    await page.goto("/users");
    await expect(rowFor(page, agent.email)).toHaveCount(1);

    await rowFor(page, agent.email).getByRole("button", { name: `Delete ${agent.name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete user?" });
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(rowFor(page, agent.email)).toHaveCount(0);

    await page.reload();
    await expect(rowFor(page, testAdmin.email)).toHaveCount(1);
    await expect(rowFor(page, agent.email)).toHaveCount(0);
  });

  test("shows the server's error in the dialog and keeps it open when deleting fails", async ({ page, request }) => {
    const agent = await createAgent(request, "ui-fail");
    await page.route(`**/api/users/${agent.id}`, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      return route.fulfill({ status: 404, json: { error: "User not found" } });
    });
    await page.goto("/users");

    await rowFor(page, agent.email).getByRole("button", { name: `Delete ${agent.name}` }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete user?" });
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(dialog.getByText("User not found")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(rowFor(page, agent.email)).toHaveCount(1);
    expect((await listUsers(request)).some((u) => u.id === agent.id)).toBe(true);
  });
});
