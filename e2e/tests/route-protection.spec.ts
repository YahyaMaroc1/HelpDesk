import { expect, test } from "@playwright/test";
import { adminAuthFile, testAdmin } from "../test-env.ts";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/", "/users", "/does-not-exist"]) {
    test(`redirects ${path} to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText("Sign in to HelpDesk")).toBeVisible();
    });
  }
});

test.describe("session persistence", () => {
  test.use({ storageState: adminAuthFile });

  test("survives a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(testAdmin.name)).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(testAdmin.name)).toBeVisible();
  });

  test("is shared by a new page in the same context", async ({ context, page }) => {
    await page.goto("/");
    const second = await context.newPage();
    await second.goto("/users");
    await expect(second).toHaveURL("/users");
    await expect(second.getByRole("heading", { name: "Users" })).toBeVisible();
  });
});
