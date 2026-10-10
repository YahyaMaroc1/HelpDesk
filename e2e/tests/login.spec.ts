import { expect, test } from "@playwright/test";
import { adminAuthFile, testAdmin } from "../test-env.ts";

test.describe("login form", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to HelpDesk")).toBeVisible();
  });

  test("treats the email as case-insensitive", async ({ page }) => {
    await page.getByLabel("Email").fill(testAdmin.email.toUpperCase());
    await page.getByLabel("Password").fill(testAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(testAdmin.name)).toBeVisible();
  });

  test("signs in and shows the user's name and Sign out", async ({ page }) => {
    await page.getByLabel("Email").fill(testAdmin.email);
    await page.getByLabel("Password").fill(testAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(testAdmin.name)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("shows the same error for a wrong password and an unknown email", async ({ page }) => {
    const alert = page.getByRole("alert");

    await page.getByLabel("Email").fill(testAdmin.email);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alert).toBeVisible();
    const wrongPasswordMessage = (await alert.innerText()).trim();
    await expect(page).toHaveURL(/\/login$/);

    await page.reload();
    await page.getByLabel("Email").fill("nobody-here@test.local");
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alert).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // Same message either way, so the form doesn't reveal which emails have accounts.
    expect(wrongPasswordMessage.length).toBeGreaterThan(0);
    await expect(alert).toHaveText(wrongPasswordMessage);
  });
});

test.describe("already signed in", () => {
  test.use({ storageState: adminAuthFile });

  test("redirects /login to /", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });
});
