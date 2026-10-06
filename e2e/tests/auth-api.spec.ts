import { expect, test, type APIRequestContext } from "@playwright/test";
import { TEST_BASE_URL, testAdmin, testEscalationAgent } from "../test-env.ts";

test.use({ storageState: { cookies: [], origins: [] } });

// Better Auth only checks Origin on requests that carry cookies, so those tests send a Cookie header too.
const trustedOrigin = { Origin: TEST_BASE_URL };

async function signInAs(request: APIRequestContext, user: { email: string; password: string }) {
  const response = await request.post("/api/auth/sign-in/email", { data: user });
  expect(response.ok()).toBeTruthy();
}

test.describe("GET /api/me", () => {
  test("returns 401 without a session", async ({ request }) => {
    const response = await request.get("/api/me");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("returns 401 with a garbage session cookie", async ({ request }) => {
    const response = await request.get("/api/me", {
      headers: { Cookie: "better-auth.session_token=garbage.garbage" },
    });
    expect(response.status()).toBe(401);
  });

  test("returns 401 with a tampered session cookie", async ({ playwright, request }) => {
    // Sign in with a separate context so the clean `request` doesn't carry the valid cookie itself.
    const signedIn = await playwright.request.newContext({ baseURL: TEST_BASE_URL });
    await signInAs(signedIn, testAdmin);
    const cookie = (await signedIn.storageState()).cookies.find((c) => c.name.includes("session_token"));
    expect(cookie).toBeDefined();
    // Flip the last character of the signature.
    const value = decodeURIComponent(cookie!.value);
    const tampered = value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
    const response = await request.get("/api/me", {
      headers: { Cookie: `${cookie!.name}=${encodeURIComponent(tampered)}` },
    });
    expect(response.status()).toBe(401);
    await signedIn.dispose();
  });
});

test.describe("public sign-up", () => {
  test("is disabled and creates no user", async ({ request }) => {
    const credentials = { email: `newcomer-${Date.now()}@test.local`, password: "a-long-enough-password" };
    const signUp = await request.post("/api/auth/sign-up/email", { data: { name: "Newcomer", ...credentials } });
    expect(signUp.ok()).toBeFalsy();
    expect(signUp.status()).toBeLessThan(500);

    const signIn = await request.post("/api/auth/sign-in/email", { data: credentials });
    expect(signIn.ok()).toBeFalsy();
  });
});

test.describe("role field", () => {
  test("clients can't change their own role", async ({ request }) => {
    await signInAs(request, testEscalationAgent);

    // Whatever Better Auth answers (an error or a no-op), the role must stay AGENT.
    await request.post("/api/auth/update-user", { data: { role: "ADMIN" }, headers: trustedOrigin });

    const me = await request.get("/api/me");
    expect(me.status()).toBe(200);
    expect(JSON.stringify(await me.json())).toContain('"role":"AGENT"');
  });
});

test.describe("origin check", () => {
  const credentials = { email: testAdmin.email, password: testAdmin.password };

  test("rejects sign-in from a foreign origin", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: credentials,
      headers: { Origin: "http://evil.example", Cookie: "probe=1" },
    });
    expect(response.status()).toBe(403);
  });

  test("accepts sign-in from the trusted origin", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: credentials,
      headers: { ...trustedOrigin, Cookie: "probe=1" },
    });
    expect(response.ok()).toBeTruthy();
  });

  test("rejects a cross-origin sign-out and keeps the session", async ({ request }) => {
    await signInAs(request, testAdmin);
    const response = await request.post("/api/auth/sign-out", {
      data: {},
      headers: { Origin: "http://evil.example" },
    });
    expect(response.status()).toBe(403);
    expect((await request.get("/api/me")).status()).toBe(200);
  });
});

test.describe("session cookie", () => {
  test("is httpOnly and hidden from page scripts", async ({ context, page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(testAdmin.email);
    await page.getByLabel("Password").fill(testAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    const cookie = (await context.cookies()).find((c) => c.name.includes("session_token"));
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(await page.evaluate<string>("document.cookie")).not.toContain("session_token");
  });
});
