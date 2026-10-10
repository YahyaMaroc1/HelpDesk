import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Better Auth's client can't be created under happy-dom (it needs the page's URL), so the module is replaced with
// a stub before the page imports it: a signed-out session, and a sign-in that each test controls.
const useSession = mock(() => ({ data: null, isPending: false }));
const signInEmail = mock(async (_credentials: { email: string; password: string }) => ({ error: null as unknown }));
mock.module("@/lib/auth-client.ts", () => ({ authClient: { useSession, signIn: { email: signInEmail } } }));
const { LoginPage } = await import("./LoginPage.tsx");

function renderPage() {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

function submit(email: string, password: string) {
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  signInEmail.mockImplementation(async () => ({ error: null }));
});

afterEach(() => {
  signInEmail.mockClear();
});

describe("LoginPage", () => {
  test("shows required messages on an empty submit and doesn't sign in", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  test("rejects a malformed email without signing in", async () => {
    renderPage();

    submit("not-an-email", "whatever");

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(signInEmail).not.toHaveBeenCalled();
  });

  test("signs in with the email trimmed and the password as typed", async () => {
    renderPage();

    submit("  admin@example.com  ", " secret password ");

    await waitFor(() =>
      expect(signInEmail).toHaveBeenCalledWith({ email: "admin@example.com", password: " secret password " }),
    );
  });

  test("shows Better Auth's error when signing in fails", async () => {
    signInEmail.mockImplementation(async () => ({ error: { message: "Invalid email or password" } }));
    renderPage();

    submit("admin@example.com", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
