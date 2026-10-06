import { expect, test } from "@playwright/test";
import { adminAuthFile, agentAuthFile, testAdmin, testAgent } from "../test-env.ts";

test.describe("admin", () => {
  test.use({ storageState: adminAuthFile });

  test("sees the Users link and can open /users", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("/api/me returns the ADMIN role", async ({ request }) => {
    const response = await request.get("/api/me");
    expect(response.status()).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).toContain(testAdmin.email);
    expect(body).toContain('"role":"ADMIN"');
  });
});

test.describe("agent", () => {
  test.use({ storageState: agentAuthFile });

  test("does not see the Users link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(testAgent.name)).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });

  test("is redirected from /users to /", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  });

  test("/api/me returns the AGENT role", async ({ request }) => {
    const response = await request.get("/api/me");
    expect(response.status()).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).toContain(testAgent.email);
    expect(body).toContain('"role":"AGENT"');
  });
});
