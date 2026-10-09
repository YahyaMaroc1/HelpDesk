import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { CreateUserDialog } from "./CreateUserDialog.tsx";

function mockPostUser(result: () => Promise<unknown>) {
  return spyOn(api, "post").mockImplementation((() => result()) as typeof api.post);
}

// An axios error carrying an HTTP response, as axios rejects with for a non-2xx status.
function httpError(status: number, data: unknown) {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response as AxiosResponse),
  );
}

async function openDialog() {
  renderWithQuery(<CreateUserDialog />);
  fireEvent.click(screen.getByRole("button", { name: "New user" }));
  return screen.findByRole("dialog", { name: "New user" });
}

function fillForm({ name, email, password }: { name: string; email: string; password: string }) {
  fireEvent.input(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Create user" }));
}

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("CreateUserDialog", () => {
  test("opens a form with name, email and password fields", async () => {
    await openDialog();

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  test("shows required-field errors and doesn't submit an empty form", async () => {
    const post = mockPostUser(() => Promise.resolve({ data: {} }));
    await openDialog();

    submit();

    expect(await screen.findByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("rejects a 2-character name, an invalid email and a 7-character password", async () => {
    const post = mockPostUser(() => Promise.resolve({ data: {} }));
    await openDialog();

    fillForm({ name: "Ab", email: "not-an-email", password: "1234567" });
    submit();

    expect(await screen.findByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(post).not.toHaveBeenCalled();
  });

  test("posts the trimmed values to /users and closes on success", async () => {
    const post = mockPostUser(() => Promise.resolve({ data: { user: {} }, status: 201 }));
    const invalidate = spyOn(queryClient, "invalidateQueries");
    const dialog = await openDialog();

    fillForm({ name: "  Grace Hopper ", email: " grace@example.com ", password: "12345678" });
    submit();

    await waitForElementToBeRemoved(dialog);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]).toEqual(["/users", { name: "Grace Hopper", email: "grace@example.com", password: "12345678" }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  test("disables the submit button while the request is pending", async () => {
    mockPostUser(() => new Promise(() => {}));
    await openDialog();

    fillForm({ name: "Grace Hopper", email: "grace@example.com", password: "12345678" });
    submit();

    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
  });

  test("shows the API's error and stays open when creation fails", async () => {
    mockPostUser(() => httpError(409, { error: "A user with this email already exists" }));
    await openDialog();

    fillForm({ name: "Grace Hopper", email: "grace@example.com", password: "12345678" });
    submit();

    expect(await screen.findByText("A user with this email already exists")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New user" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Grace Hopper");
  });

  test("starts with an empty form when reopened", async () => {
    const dialog = await openDialog();
    fillForm({ name: "Grace Hopper", email: "grace@example.com", password: "12345678" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialog).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New user" }));

    await screen.findByRole("dialog", { name: "New user" });
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});
