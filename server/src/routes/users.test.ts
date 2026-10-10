import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { Role } from "../generated/prisma/enums.ts";

// The router's database and Better Auth calls, stubbed so the tests need no database. Mocked before the router
// is imported, so lib/prisma.ts (which connects to DATABASE_URL) and lib/auth.ts are never loaded.
const prisma = {
  user: { findMany: mock(), findFirst: mock(), findUniqueOrThrow: mock(), update: mock() },
  session: { deleteMany: mock() },
  $transaction: mock(),
};
const ctx = {
  internalAdapter: {
    createUser: mock(),
    linkAccount: mock(),
    updateUser: mock(),
    findCredentialAccount: mock(),
    updatePassword: mock(),
  },
  password: { hash: mock() },
};
mock.module("../lib/prisma.ts", () => ({ prisma }));
mock.module("../lib/auth.ts", () => ({ auth: { $context: Promise.resolve(ctx) }, passwordLength: { min: 8, max: 128 } }));
const { usersRouter } = await import("./users.ts");

// The router on its own, behind express.json() as in app.ts. Sessions and the admin check are done by requireAuth
// and requireAdmin in app.ts, not by the router; res.locals.session is set to the signed-in admin's session, which
// PATCH keeps when it signs a user out.
const adminSession = { id: "session-admin" };
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.session = adminSession;
    next();
  });
  app.use("/api/users", usersRouter);
  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const userFields = { id: true, name: true, email: true, role: true, createdAt: true };
const alan = { id: "u2", name: "Alan Agent", email: "alan@example.com", role: Role.AGENT, createdAt: "2026-10-01T00:00:00.000Z" };
const validUser = { name: "Alan Agent", email: "alan@example.com", password: "a-good-password" };

beforeEach(() => {
  // By default: no email conflict, an active agent for :id, and a working Better Auth.
  prisma.user.findMany.mockReset().mockResolvedValue([alan]);
  prisma.user.findFirst.mockReset().mockImplementation(async ({ where }: { where: { id?: string } }) =>
    where.id ? { id: where.id, role: Role.AGENT } : null,
  );
  prisma.user.findUniqueOrThrow.mockReset().mockResolvedValue(alan);
  prisma.user.update.mockReset().mockResolvedValue({});
  prisma.session.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  prisma.$transaction.mockReset().mockResolvedValue([]);
  ctx.internalAdapter.createUser.mockReset().mockResolvedValue({ id: alan.id });
  ctx.internalAdapter.linkAccount.mockReset().mockResolvedValue({});
  ctx.internalAdapter.updateUser.mockReset().mockResolvedValue({});
  ctx.internalAdapter.findCredentialAccount.mockReset().mockResolvedValue({ id: "account" });
  ctx.internalAdapter.updatePassword.mockReset().mockResolvedValue(undefined);
  ctx.password.hash.mockReset().mockImplementation(async (password: string) => `hashed:${password}`);
});

// Makes the email lookup find `user` (deletedAt null = active), while :id lookups still find an active agent.
function emailTakenBy(user: { deletedAt: Date | null }) {
  prisma.user.findFirst.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
    where.email ? user : { id: where.id, role: Role.AGENT },
  );
}

type ResponseBody = { user?: unknown; users?: unknown; error?: string };

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api/users${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as ResponseBody | undefined };
}

// Whether the request wrote anything: users, accounts or sessions.
function expectNothingWritten() {
  expect(ctx.internalAdapter.createUser).not.toHaveBeenCalled();
  expect(ctx.internalAdapter.linkAccount).not.toHaveBeenCalled();
  expect(ctx.internalAdapter.updateUser).not.toHaveBeenCalled();
  expect(ctx.internalAdapter.updatePassword).not.toHaveBeenCalled();
  expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
}

describe("GET /api/users", () => {
  test("lists the active users oldest first, with only their public fields", async () => {
    const res = await call("GET", "/");

    expect(res).toEqual({ status: 200, body: { users: [alan] } });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: userFields,
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("POST /api/users", () => {
  test("creates an agent with a trimmed name and a trimmed, lowercased email, and a hashed password", async () => {
    const res = await call("POST", "/", { name: "  Alan Agent  ", email: "  Alan@Example.COM ", password: "a-good-password" });

    expect(res).toEqual({ status: 201, body: { user: alan } });
    expect(ctx.internalAdapter.createUser).toHaveBeenCalledWith(
      { name: "Alan Agent", email: "alan@example.com", emailVerified: false, role: Role.AGENT },
      { method: "email-password" },
    );
    expect(ctx.internalAdapter.linkAccount).toHaveBeenCalledWith({
      userId: alan.id,
      providerId: "credential",
      accountId: alan.id,
      password: "hashed:a-good-password",
    });
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: alan.id }, select: userFields });
  });

  test("ignores a role in the body and always creates an agent", async () => {
    await call("POST", "/", { ...validUser, role: Role.ADMIN });

    expect(ctx.internalAdapter.createUser.mock.calls[0]?.[0]).toMatchObject({ role: Role.AGENT });
  });

  test.each([
    ["an empty name", { ...validUser, name: "" }, "Name must be at least 3 characters"],
    ["a 2-character name", { ...validUser, name: "ab" }, "Name must be at least 3 characters"],
    ["a name that's 2 characters once trimmed", { ...validUser, name: "  ab  " }, "Name must be at least 3 characters"],
    ["a missing name", { email: validUser.email, password: validUser.password }, "Name must be at least 3 characters"],
    ["a non-string name", { ...validUser, name: 42 }, "Name must be at least 3 characters"],
    ["an empty email", { ...validUser, email: "" }, "Enter a valid email address"],
    ["an email without @", { ...validUser, email: "not-an-email" }, "Enter a valid email address"],
    ["an email without a TLD", { ...validUser, email: "missing@tld" }, "Enter a valid email address"],
    ["an email with two @", { ...validUser, email: "two@@example.com" }, "Enter a valid email address"],
    ["an email with a space", { ...validUser, email: "spaces in@example.com" }, "Enter a valid email address"],
    ["a missing email", { name: validUser.name, password: validUser.password }, "Enter a valid email address"],
    ["an empty password", { ...validUser, password: "" }, "Password must be 8-128 characters"],
    ["a 7-character password", { ...validUser, password: "1234567" }, "Password must be 8-128 characters"],
    ["a 129-character password", { ...validUser, password: "x".repeat(129) }, "Password must be 8-128 characters"],
    ["a missing password", { name: validUser.name, email: validUser.email }, "Password must be 8-128 characters"],
  ])("rejects %s without creating anything", async (_, body, error) => {
    const res = await call("POST", "/", body);

    expect(res).toEqual({ status: 400, body: { error } });
    expectNothingWritten();
  });

  test.each([8, 128])("accepts a %d-character password", async (length) => {
    const res = await call("POST", "/", { ...validUser, password: "p".repeat(length) });

    expect(res.status).toBe(201);
  });

  test("returns 409 for an active user's email, checked after trimming and lowercasing", async () => {
    emailTakenBy({ deletedAt: null });

    const res = await call("POST", "/", { ...validUser, email: "  ALAN@example.com " });

    expect(res).toEqual({ status: 409, body: { error: "A user with this email already exists" } });
    expect(prisma.user.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { email: "alan@example.com" } });
    expectNothingWritten();
  });

  test("returns 409 for a deleted user's email, which stays reserved", async () => {
    emailTakenBy({ deletedAt: new Date() });

    const res = await call("POST", "/", validUser);

    expect(res).toEqual({ status: 409, body: { error: "This email belongs to a deleted user" } });
    expectNothingWritten();
  });
});

describe("PATCH /api/users/:id", () => {
  test("updates the name and email and keeps the password when none is given", async () => {
    const res = await call("PATCH", "/u2", { name: " Alan Renamed ", email: " ALAN.NEW@example.com " });

    expect(res).toEqual({ status: 200, body: { user: alan } });
    expect(ctx.internalAdapter.updateUser).toHaveBeenCalledWith("u2", { name: "Alan Renamed", email: "alan.new@example.com" });
    expect(ctx.password.hash).not.toHaveBeenCalled();
    expect(ctx.internalAdapter.updatePassword).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  test("sets a new password and signs the user out everywhere except the admin's own session", async () => {
    const res = await call("PATCH", "/u2", { ...validUser, password: "a-new-password" });

    expect(res.status).toBe(200);
    expect(ctx.internalAdapter.updatePassword).toHaveBeenCalledWith("u2", "hashed:a-new-password");
    expect(ctx.internalAdapter.linkAccount).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2", NOT: { id: adminSession.id } } });
  });

  test("adds a credential account when the user has none", async () => {
    ctx.internalAdapter.findCredentialAccount.mockResolvedValue(null);

    await call("PATCH", "/u2", { ...validUser, password: "a-new-password" });

    expect(ctx.internalAdapter.linkAccount).toHaveBeenCalledWith({
      userId: "u2",
      providerId: "credential",
      accountId: "u2",
      password: "hashed:a-new-password",
    });
    expect(ctx.internalAdapter.updatePassword).not.toHaveBeenCalled();
  });

  test("rejects a short new password without changing anything", async () => {
    const res = await call("PATCH", "/u2", { ...validUser, password: "1234567" });

    expect(res).toEqual({ status: 400, body: { error: "Password must be 8-128 characters" } });
    expectNothingWritten();
  });

  test("answers 404 for a user that doesn't exist or was deleted", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await call("PATCH", "/gone", validUser);

    expect(res).toEqual({ status: 404, body: { error: "User not found" } });
    expect(prisma.user.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: "gone", deletedAt: null } });
    expectNothingWritten();
  });

  test("returns 409 for another user's email, deleted or not, ignoring the user's own", async () => {
    emailTakenBy({ deletedAt: new Date() });

    const res = await call("PATCH", "/u2", { ...validUser, email: "ghost@example.com" });

    expect(res).toEqual({ status: 409, body: { error: "This email belongs to a deleted user" } });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "ghost@example.com", NOT: { id: "u2" } },
      select: { deletedAt: true },
    });
    expectNothingWritten();
  });
});

describe("DELETE /api/users/:id", () => {
  test("soft-deletes an agent and deletes their sessions in one transaction", async () => {
    const res = await call("DELETE", "/u2");

    expect(res).toEqual({ status: 204, body: undefined });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
  });

  test("answers 404 for a user that doesn't exist or was already deleted", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await call("DELETE", "/gone");

    expect(res).toEqual({ status: 404, body: { error: "User not found" } });
    expect(prisma.user.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: "gone", deletedAt: null } });
    expectNothingWritten();
  });

  test("refuses to delete an admin", async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.ADMIN });

    const res = await call("DELETE", "/admin");

    expect(res).toEqual({ status: 403, body: { error: "Admins can't be deleted" } });
    expectNothingWritten();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
