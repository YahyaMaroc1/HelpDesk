import { expect, test, type BrowserContext } from "@playwright/test";
import { testAdmin } from "../test-env.ts";

// These tests sign in themselves so signing out never deletes the session saved in the shared storageState.
test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(context: BrowserContext) {
  const response = await context.request.post("/api/auth/sign-in/email", {
    data: { email: testAdmin.email, password: testAdmin.password },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("sign out", () => {
  test("lands on /login and ends the session", async ({ context, page }) => {
    await signIn(context);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    const me = await context.request.get("/api/me");
    expect(me.status()).toBe(401);
  });

  test("signs out other tabs of the same context", async ({ context, page }) => {
    await signIn(context);
    await page.goto("/");
    const other = await context.newPage();
    await other.goto("/");
    await expect(other.getByRole("button", { name: "Sign out" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await other.reload();
    await expect(other).toHaveURL(/\/login$/);
  });
});
