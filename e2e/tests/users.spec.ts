import { expect, test } from "@playwright/test";
import { adminAuthFile, agentAuthFile, testAdmin, testAgent, testEscalationAgent } from "../test-env.ts";

type ApiUser = { id: string; name: string; email: string; role: "ADMIN" | "AGENT"; createdAt: string };

const seeded = [
  { ...testAdmin, role: "ADMIN", badge: "Admin" },
  { ...testAgent, role: "AGENT", badge: "Agent" },
  { ...testEscalationAgent, role: "AGENT", badge: "Agent" },
] as const;

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

  test.describe("admin", () => {
    test.use({ storageState: adminAuthFile });

    test("lists the seeded users with the right name, email and role", async ({ request }) => {
      const response = await request.get("/api/users");
      expect(response.status()).toBe(200);
      const { users } = (await response.json()) as { users: ApiUser[] };

      for (const expected of seeded) {
        const user = users.find((u) => u.email === expected.email);
        expect(user, `${expected.email} is listed`).toBeDefined();
        expect(user).toMatchObject({ name: expected.name, email: expected.email, role: expected.role });
      }
    });

    test("exposes only id, name, email, role and createdAt", async ({ request }) => {
      const { users } = (await (await request.get("/api/users")).json()) as { users: ApiUser[] };
      expect(users.length).toBeGreaterThanOrEqual(seeded.length);
      for (const user of users) {
        expect(Object.keys(user).sort()).toEqual(["createdAt", "email", "id", "name", "role"]);
        expect(user.id).toBeTruthy();
        expect(Number.isNaN(Date.parse(user.createdAt))).toBe(false);
        expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
      }
    });

    test("is ordered by creation time, with the admin before the agents", async ({ request }) => {
      const { users } = (await (await request.get("/api/users")).json()) as { users: ApiUser[] };
      const times = users.map((u) => Date.parse(u.createdAt));
      expect(times).toEqual([...times].sort((a, b) => a - b));

      const emails = users.map((u) => u.email);
      const adminIndex = emails.indexOf(testAdmin.email);
      expect(adminIndex).toBeGreaterThanOrEqual(0);
      expect(adminIndex).toBeLessThan(emails.indexOf(testAgent.email));
      expect(adminIndex).toBeLessThan(emails.indexOf(testEscalationAgent.email));
    });
  });
});

test.describe("Users page", () => {
  test.use({ storageState: adminAuthFile });

  test("shows the Name, Email, Role and Created columns", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("table")).toBeVisible();
    for (const name of ["Name", "Email", "Role", "Created"]) {
      await expect(page.getByRole("columnheader", { name })).toBeVisible();
    }
  });

  test("shows a row with name, email and role badge for each seeded user", async ({ page }) => {
    await page.goto("/users");
    for (const user of seeded) {
      const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: user.email, exact: true }) });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("cell").nth(0)).toHaveText(user.name);
      await expect(row.getByRole("cell").nth(1)).toHaveText(user.email);
      await expect(row.getByRole("cell").nth(2)).toHaveText(user.badge);
    }
  });

  test("shows each user's creation date in the browser's local format", async ({ page }) => {
    const response = await page.request.get("/api/users");
    const { users } = (await response.json()) as { users: ApiUser[] };
    const admin = users.find((u) => u.email === testAdmin.email);
    expect(admin).toBeDefined();
    const expectedDate = await page.evaluate((iso) => new Date(iso).toLocaleDateString(), admin!.createdAt);

    await page.goto("/users");
    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: testAdmin.email, exact: true }) });
    await expect(row.getByRole("cell").nth(3)).toHaveText(expectedDate);
  });

  test("shows the server's error message when loading fails", async ({ page }) => {
    await page.route("**/api/users", (route) =>
      route.fulfill({ status: 500, json: { error: "Internal server error" } }),
    );
    await page.goto("/users");
    await expect(page.getByText("Couldn't load users: Internal server error")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("Loading users…")).toHaveCount(0);
  });

  test("falls back to the HTTP status when the error has no JSON body", async ({ page }) => {
    await page.route("**/api/users", (route) =>
      route.fulfill({ status: 502, contentType: "text/plain", body: "Bad Gateway" }),
    );
    await page.goto("/users");
    await expect(page.getByText("Couldn't load users: HTTP 502")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("shows an empty state when there are no users", async ({ page }) => {
    await page.route("**/api/users", (route) => route.fulfill({ json: { users: [] } }));
    await page.goto("/users");
    await expect(page.getByRole("cell", { name: "No users yet." })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  });

  test("shows a loading message until the users arrive", async ({ page }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/users", async (route) => {
      await released;
      await route.continue();
    });

    await page.goto("/users");
    await expect(page.getByText("Loading users…")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    release();
    await expect(page.getByRole("cell", { name: testAdmin.email, exact: true })).toBeVisible();
    await expect(page.getByText("Loading users…")).toHaveCount(0);
  });
});

test.describe("Users page as an agent", () => {
  test.use({ storageState: agentAuthFile });

  test("never receives user data from /api/users", async ({ page }) => {
    const statuses: number[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/api/users") statuses.push(response.status());
    });

    await page.goto("/users");
    await expect(page).toHaveURL("/");
    await expect(page.getByText(testAgent.name)).toBeVisible();

    expect(statuses.filter((status) => status === 200)).toEqual([]);
    await expect(page.getByText(testAdmin.email)).toHaveCount(0);
  });
});
