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

  test("does not see the New user button", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: "New user" })).toHaveCount(0);
  });
});

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@create.test.local`;
}

const validPassword = "new-user-password";

test.describe("POST /api/users", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("returns 401", async ({ request }) => {
      const response = await request.post("/api/users", {
        data: { name: "Nobody", email: uniqueEmail("signed-out"), password: validPassword },
      });
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });

  test.describe("agent", () => {
    test.use({ storageState: agentAuthFile });

    test("returns 403", async ({ request }) => {
      const response = await request.post("/api/users", {
        data: { name: "Nobody", email: uniqueEmail("agent-attempt"), password: validPassword },
      });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
    });
  });

  test.describe("admin", () => {
    test.use({ storageState: adminAuthFile });

    test("rejects a name shorter than 2 characters (after trimming)", async ({ request }) => {
      for (const name of ["", "a", "  a  ", "   "]) {
        const response = await request.post("/api/users", {
          data: { name, email: uniqueEmail("short-name"), password: validPassword },
        });
        expect(response.status(), `name ${JSON.stringify(name)}`).toBe(400);
        expect(await response.json()).toEqual({ error: "Name must be at least 2 characters" });
      }
    });

    test("rejects a missing or non-string name", async ({ request }) => {
      for (const data of [
        { email: uniqueEmail("no-name"), password: validPassword },
        { name: 42, email: uniqueEmail("num-name"), password: validPassword },
      ]) {
        const response = await request.post("/api/users", { data });
        expect(response.status()).toBe(400);
        expect(await response.json()).toEqual({ error: "Name must be at least 2 characters" });
      }
    });

    test("rejects an invalid email", async ({ request }) => {
      for (const email of ["", "not-an-email", "missing@tld", "two@@example.com", "spaces in@example.com", "@example.com"]) {
        const response = await request.post("/api/users", {
          data: { name: "Valid Name", email, password: validPassword },
        });
        expect(response.status(), `email ${JSON.stringify(email)}`).toBe(400);
        expect(await response.json()).toEqual({ error: "Enter a valid email address" });
      }
      const missing = await request.post("/api/users", { data: { name: "Valid Name", password: validPassword } });
      expect(missing.status()).toBe(400);
      expect(await missing.json()).toEqual({ error: "Enter a valid email address" });
    });

    test("rejects a password outside 8-128 characters", async ({ request }) => {
      for (const password of ["", "1234567", "x".repeat(129)]) {
        const response = await request.post("/api/users", {
          data: { name: "Valid Name", email: uniqueEmail("bad-password"), password },
        });
        expect(response.status(), `password length ${password.length}`).toBe(400);
        expect(await response.json()).toEqual({ error: "Password must be 8-128 characters" });
      }
      const missing = await request.post("/api/users", {
        data: { name: "Valid Name", email: uniqueEmail("no-password") },
      });
      expect(missing.status()).toBe(400);
      expect(await missing.json()).toEqual({ error: "Password must be 8-128 characters" });
    });

    test("does not create a user when validation fails", async ({ request }) => {
      const email = uniqueEmail("not-created");
      const response = await request.post("/api/users", { data: { name: "Valid Name", email, password: "1234567" } });
      expect(response.status()).toBe(400);

      const { users } = (await (await request.get("/api/users")).json()) as { users: ApiUser[] };
      expect(users.some((u) => u.email === email)).toBe(false);
    });

    test("accepts passwords of exactly 8 and 128 characters", async ({ request }) => {
      for (const password of ["12345678", "y".repeat(128)]) {
        const response = await request.post("/api/users", {
          data: { name: "Boundary User", email: uniqueEmail("boundary"), password },
        });
        expect(response.status(), `password length ${password.length}`).toBe(201);
      }
    });

    test("creates an AGENT with a trimmed name and a trimmed, lowercased email", async ({ request }) => {
      const email = uniqueEmail("MiXeD");
      const response = await request.post("/api/users", {
        data: { name: "  Created Person  ", email: `  ${email}  `, password: validPassword },
      });
      expect(response.status()).toBe(201);
      const { user } = (await response.json()) as { user: ApiUser };
      expect(Object.keys(user).sort()).toEqual(["createdAt", "email", "id", "name", "role"]);
      expect(user).toMatchObject({ name: "Created Person", email: email.toLowerCase(), role: "AGENT" });
      expect(user.id).toBeTruthy();
      expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);

      const { users } = (await (await request.get("/api/users")).json()) as { users: ApiUser[] };
      expect(users.find((u) => u.id === user.id)).toEqual(user);
    });

    test("ignores a role in the request body and always creates an AGENT", async ({ request }) => {
      const response = await request.post("/api/users", {
        data: { name: "Sneaky Admin", email: uniqueEmail("role"), password: validPassword, role: "ADMIN" },
      });
      expect(response.status()).toBe(201);
      expect(((await response.json()) as { user: ApiUser }).user.role).toBe("AGENT");
    });

    test("returns 409 for an email that already exists", async ({ request }) => {
      const email = uniqueEmail("duplicate");
      const first = await request.post("/api/users", { data: { name: "First User", email, password: validPassword } });
      expect(first.status()).toBe(201);

      const second = await request.post("/api/users", {
        data: { name: "Second User", email, password: validPassword },
      });
      expect(second.status()).toBe(409);
      expect(await second.json()).toEqual({ error: "A user with this email already exists" });
    });

    test("returns 409 for an existing email in different case and with whitespace", async ({ request }) => {
      const response = await request.post("/api/users", {
        data: { name: "Copycat", email: `  ${testAgent.email.toUpperCase()} `, password: validPassword },
      });
      expect(response.status()).toBe(409);
      expect(await response.json()).toEqual({ error: "A user with this email already exists" });
    });

    test("lets the created user sign in with the chosen password", async ({ request, playwright, baseURL }) => {
      const email = uniqueEmail("signin");
      const created = await request.post("/api/users", {
        data: { name: "Sign In User", email, password: validPassword },
      });
      expect(created.status()).toBe(201);

      const fresh = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
      try {
        const wrong = await fresh.post("/api/auth/sign-in/email", { data: { email, password: "wrong-password-1" } });
        expect(wrong.status()).toBe(401);

        const signIn = await fresh.post("/api/auth/sign-in/email", { data: { email, password: validPassword } });
        expect(signIn.status()).toBe(200);

        const me = await fresh.get("/api/me");
        expect(me.status()).toBe(200);
        expect(JSON.stringify(await me.json())).toContain(email);

        // The new user is an agent, so the admin API stays closed to them.
        expect((await fresh.get("/api/users")).status()).toBe(403);
      } finally {
        await fresh.dispose();
      }
    });
  });
});

test.describe("Create user dialog", () => {
  test.use({ storageState: adminAuthFile });

  test.beforeEach(async ({ page }) => {
    await page.goto("/users");
    await page.getByRole("button", { name: "New user" }).click();
    await expect(page.getByRole("dialog", { name: "New user" })).toBeVisible();
  });

  test("shows validation errors on an empty submit and sends no request", async ({ page }) => {
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/users") posts++;
    });

    const dialog = page.getByRole("dialog", { name: "New user" });
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByText("Name must be at least 2 characters")).toBeVisible();
    await expect(dialog.getByText("Email is required")).toBeVisible();
    await expect(dialog.getByText("Password must be at least 8 characters")).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(posts).toBe(0);
  });

  test("shows errors for too-short or malformed values without creating a row", async ({ page }) => {
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/users") posts++;
    });
    const email = uniqueEmail("invalid-ui");
    const dialog = page.getByRole("dialog", { name: "New user" });

    await dialog.getByLabel("Name").fill("a");
    await dialog.getByLabel("Email").fill("not-an-email");
    await dialog.getByLabel("Password").fill("1234567");
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByText("Name must be at least 2 characters")).toBeVisible();
    await expect(dialog.getByText("Enter a valid email address")).toBeVisible();
    await expect(dialog.getByText("Password must be at least 8 characters")).toBeVisible();
    expect(posts).toBe(0);

    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog.getByText("Enter a valid email address")).toHaveCount(0);
    await expect(dialog.getByText("Password must be at least 8 characters")).toBeVisible();
    expect(posts).toBe(0);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("cell", { name: email, exact: true })).toHaveCount(0);
  });

  test("creates a user, closes the dialog and shows the new row", async ({ page }) => {
    const email = uniqueEmail("created-ui");
    const name = `Created UI ${Date.now()}`;
    const dialog = page.getByRole("dialog", { name: "New user" });

    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Password").fill(validPassword);
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: email, exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(0)).toHaveText(name);
    await expect(row.getByRole("cell").nth(2)).toHaveText("Agent");
  });

  test("shows the server's duplicate-email error and keeps the dialog open", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "New user" });

    await dialog.getByLabel("Name").fill("Duplicate Person");
    await dialog.getByLabel("Email").fill(testAgent.email);
    await dialog.getByLabel("Password").fill(validPassword);
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByRole("alert")).toHaveText("A user with this email already exists");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Email")).toHaveValue(testAgent.email);
  });

  test("Cancel closes the dialog and reopening shows an empty form", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "New user" });
    await dialog.getByLabel("Name").fill("Half Typed");
    await dialog.getByLabel("Email").fill(uniqueEmail("cancelled"));
    await dialog.getByLabel("Password").fill(validPassword);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "New user" }).click();
    const reopened = page.getByRole("dialog", { name: "New user" });
    await expect(reopened).toBeVisible();
    await expect(reopened.getByLabel("Name")).toHaveValue("");
    await expect(reopened.getByLabel("Email")).toHaveValue("");
    await expect(reopened.getByLabel("Password")).toHaveValue("");
  });

  test("reopening after a failed attempt clears the error and the form", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "New user" });
    await dialog.getByLabel("Name").fill("Duplicate Person");
    await dialog.getByLabel("Email").fill(testAgent.email);
    await dialog.getByLabel("Password").fill(validPassword);
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "New user" }).click();
    const reopened = page.getByRole("dialog", { name: "New user" });
    await expect(reopened.getByRole("alert")).toHaveCount(0);
    await expect(reopened.getByLabel("Email")).toHaveValue("");
  });
});
