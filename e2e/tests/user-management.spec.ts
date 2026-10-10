import { expect, request as requestFactory, test, type APIRequestContext, type Page } from "@playwright/test";
import { adminAuthFile, testAdmin } from "../test-env.ts";

// User management through the Users page, checked against real Better Auth sign-ins: a user created, edited and
// deleted in the UI can (or can no longer) sign in, and editing keeps or replaces the password as it should. The
// page's states and the API's validation are unit-tested (client/src/pages/UsersPage.test.tsx,
// components/UserForm.test.tsx, server/src/routes/users.test.ts).

type ApiUser = { id: string; name: string; email: string; role: "ADMIN" | "AGENT"; createdAt: string };

const originalPassword = "original-password-1";
const changedPassword = "changed-password-2";

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@manage.test.local`;
}

function uniqueName(label: string) {
  return `${label} ${Math.random().toString(36).slice(2, 8)}`;
}

async function createAgent(request: APIRequestContext, label: string) {
  const email = uniqueEmail(label);
  const name = uniqueName(`Managed ${label}`);
  const response = await request.post("/api/users", { data: { name, email, password: originalPassword } });
  expect(response.status()).toBe(201);
  const { user } = (await response.json()) as { user: ApiUser };
  return user;
}

async function listUsers(request: APIRequestContext) {
  const response = await request.get("/api/users");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { users: ApiUser[] }).users;
}

// A signed-out request context of its own, so the user under test never touches the shared storage state.
async function newSignedOutContext(playwright: { request: typeof requestFactory }, baseURL: string | undefined) {
  return playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}

async function signInStatus(playwright: { request: typeof requestFactory }, baseURL: string | undefined, email: string, password: string) {
  const context = await newSignedOutContext(playwright, baseURL);
  try {
    const response = await context.post("/api/auth/sign-in/email", { data: { email, password } });
    return response.status();
  } finally {
    await context.dispose();
  }
}

function rowFor(page: Page, email: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name: email, exact: true }) });
}

async function expectRow(page: Page, user: { name: string; email: string }, badge = "Agent") {
  const row = rowFor(page, user.email);
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("cell").nth(0)).toHaveText(user.name);
  await expect(row.getByRole("cell").nth(1)).toHaveText(user.email);
  await expect(row.getByRole("cell").nth(2)).toHaveText(badge);
}

async function createViaDialog(page: Page, user: { name: string; email: string; password: string }) {
  await page.getByRole("button", { name: "New user" }).click();
  const dialog = page.getByRole("dialog", { name: "New user" });
  await dialog.getByLabel("Name").fill(user.name);
  await dialog.getByLabel("Email").fill(user.email);
  await dialog.getByLabel("Password").fill(user.password);
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function editViaDialog(
  page: Page,
  current: { name: string; email: string },
  changes: { name: string; email: string; password?: string },
) {
  await rowFor(page, current.email).getByRole("button", { name: `Edit ${current.name}` }).click();
  const dialog = page.getByRole("dialog", { name: "Edit user" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill(changes.name);
  await dialog.getByLabel("Email").fill(changes.email);
  if (changes.password) await dialog.getByLabel("New password").fill(changes.password);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function deleteViaDialog(page: Page, user: { name: string; email: string }) {
  await rowFor(page, user.email).getByRole("button", { name: `Delete ${user.name}` }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete user?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

test.describe("User management", () => {
  test.use({ storageState: adminAuthFile });

  test.beforeEach(async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("edits name and email and keeps the original password", async ({ page, request, playwright, baseURL }) => {
    const agent = await createAgent(request, "edit-details");
    await page.reload();
    await expectRow(page, agent);

    const updated = { name: uniqueName("Renamed Agent"), email: uniqueEmail("edit-details-new") };
    await editViaDialog(page, agent, updated);

    await expectRow(page, updated);
    await expect(rowFor(page, agent.email)).toHaveCount(0);

    await page.reload();
    await expectRow(page, updated);
    await expect(rowFor(page, agent.email)).toHaveCount(0);

    const fromApi = (await listUsers(request)).find((u) => u.id === agent.id);
    expect(fromApi).toMatchObject({ name: updated.name, email: updated.email, role: "AGENT" });

    // The blank password field left the password alone, and the new email is what signs in now.
    expect(await signInStatus(playwright, baseURL, updated.email, originalPassword)).toBe(200);
    expect(await signInStatus(playwright, baseURL, agent.email, originalPassword)).toBe(401);
  });

  test("changes the password, signing the user out everywhere", async ({ page, request, playwright, baseURL }) => {
    const agent = await createAgent(request, "edit-password");
    const agentContext = await newSignedOutContext(playwright, baseURL);
    try {
      const signIn = await agentContext.post("/api/auth/sign-in/email", {
        data: { email: agent.email, password: originalPassword },
      });
      expect(signIn.status()).toBe(200);
      expect((await agentContext.get("/api/me")).status()).toBe(200);

      await page.reload();
      await editViaDialog(page, agent, { name: agent.name, email: agent.email, password: changedPassword });
      await expectRow(page, agent);

      // The session from before the change is gone.
      expect((await agentContext.get("/api/me")).status()).toBe(401);
    } finally {
      await agentContext.dispose();
    }

    expect(await signInStatus(playwright, baseURL, agent.email, changedPassword)).toBe(200);
    expect(await signInStatus(playwright, baseURL, agent.email, originalPassword)).toBe(401);
  });

  test("creates, edits and deletes the same user through the UI", async ({ page, request, playwright, baseURL }) => {
    const created = { name: uniqueName("Lifecycle Agent"), email: uniqueEmail("lifecycle") };
    await createViaDialog(page, { ...created, password: originalPassword });
    await expectRow(page, created);
    expect(await signInStatus(playwright, baseURL, created.email, originalPassword)).toBe(200);

    const updated = { name: uniqueName("Lifecycle Renamed"), email: uniqueEmail("lifecycle-new") };
    await editViaDialog(page, created, { ...updated, password: changedPassword });
    await expectRow(page, updated);
    await expect(rowFor(page, created.email)).toHaveCount(0);
    expect(await signInStatus(playwright, baseURL, updated.email, changedPassword)).toBe(200);

    await deleteViaDialog(page, updated);
    await expect(rowFor(page, updated.email)).toHaveCount(0);
    await expect(rowFor(page, created.email)).toHaveCount(0);

    await page.reload();
    await expectRow(page, testAdmin, "Admin");
    await expect(rowFor(page, updated.email)).toHaveCount(0);
    const users = await listUsers(request);
    expect(users.some((u) => u.email === updated.email || u.email === created.email)).toBe(false);
  });
});
