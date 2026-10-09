import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { UserForm, type EditableUser } from "./UserForm.tsx";

const alan: EditableUser = { id: "user-2", name: "Alan Agent", email: "alan@example.com" };

// An axios error carrying an HTTP response, as axios rejects with for a non-2xx status.
function httpError(status: number, data: unknown) {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response as AxiosResponse),
  );
}

// The form inside an open dialog, as UsersPage shows it. Returns the onSaved spy.
async function renderForm(user: EditableUser | null) {
  const onSaved = mock(() => {});
  renderWithQuery(
    <Dialog open>
      <DialogContent>
        <UserForm user={user} onSaved={onSaved} />
      </DialogContent>
    </Dialog>,
  );
  await screen.findByRole("dialog", { name: user ? "Edit user" : "New user" });
  return onSaved;
}

function fill(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

function fillForm({ name, email, password }: { name: string; email: string; password: string }) {
  fill("Name", name);
  fill("Email", email);
  fill("Password", password);
}

function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("UserForm (new user)", () => {
  function mockPost(result: () => Promise<unknown>) {
    return spyOn(api, "post").mockImplementation((() => result()) as typeof api.post);
  }

  test("shows empty name, email and password fields", async () => {
    await renderForm(null);

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Password")).not.toHaveAccessibleDescription();
  });

  test("shows required-field errors and doesn't submit an empty form", async () => {
    const post = mockPost(() => Promise.resolve({ data: {} }));
    await renderForm(null);

    click("Create user");

    expect(await screen.findByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("rejects a 2-character name, an invalid email and a 7-character password", async () => {
    const post = mockPost(() => Promise.resolve({ data: {} }));
    await renderForm(null);

    fillForm({ name: "Ab", email: "not-an-email", password: "1234567" });
    click("Create user");

    expect(await screen.findByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(post).not.toHaveBeenCalled();
  });

  test("rejects a name and email that are only whitespace", async () => {
    const post = mockPost(() => Promise.resolve({ data: {} }));
    await renderForm(null);

    fillForm({ name: "     ", email: "   ", password: "12345678" });
    click("Create user");

    expect(await screen.findByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("counts the name's length after trimming", async () => {
    const post = mockPost(() => Promise.resolve({ data: {} }));
    await renderForm(null);

    fillForm({ name: "  Ab  ", email: "grace@example.com", password: "12345678" });
    click("Create user");

    expect(await screen.findByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("flags only the invalid field and links its error to it", async () => {
    await renderForm(null);

    fillForm({ name: "Grace Hopper", email: "grace@example.com", password: "short" });
    click("Create user");

    await screen.findByText("Password must be at least 8 characters");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Password must be at least 8 characters");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Name must be at least 3 characters")).not.toBeInTheDocument();
    expect(screen.queryByText("Enter a valid email address")).not.toBeInTheDocument();
  });

  test("clears a field's error once it is corrected", async () => {
    await renderForm(null);

    fillForm({ name: "Ab", email: "grace@example.com", password: "12345678" });
    click("Create user");
    const error = await screen.findByText("Name must be at least 3 characters");

    // After a submit, React Hook Form revalidates on every change.
    fill("Name", "Abe");

    await waitForElementToBeRemoved(error);
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });

  test("accepts the shortest valid name and password", async () => {
    const post = mockPost(() => Promise.resolve({ data: { user: {} }, status: 201 }));
    const onSaved = await renderForm(null);

    fillForm({ name: "Abe", email: "abe@example.com", password: "12345678" });
    click("Create user");

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]).toEqual(["/users", { name: "Abe", email: "abe@example.com", password: "12345678" }]);
  });

  test("posts the trimmed values to /users, refreshes the users list and reports success", async () => {
    const post = mockPost(() => Promise.resolve({ data: { user: {} }, status: 201 }));
    const invalidate = spyOn(queryClient, "invalidateQueries");
    const onSaved = await renderForm(null);

    fillForm({ name: "  Grace Hopper ", email: " grace@example.com ", password: "12345678" });
    click("Create user");

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]).toEqual(["/users", { name: "Grace Hopper", email: "grace@example.com", password: "12345678" }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  test("disables the submit button while the request is pending", async () => {
    mockPost(() => new Promise(() => {}));
    await renderForm(null);

    fillForm({ name: "Grace Hopper", email: "grace@example.com", password: "12345678" });
    click("Create user");

    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
  });

  test("shows the API's error and keeps the values when creation fails", async () => {
    mockPost(() => httpError(409, { error: "A user with this email already exists" }));
    const onSaved = await renderForm(null);

    fillForm({ name: "Grace Hopper", email: "grace@example.com", password: "12345678" });
    click("Create user");

    expect(await screen.findByText("A user with this email already exists")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Grace Hopper");
    expect(onSaved).not.toHaveBeenCalled();
  });

  test("falls back to the HTTP status when the error response has no message", async () => {
    mockPost(() => httpError(400, "Bad Request"));
    await renderForm(null);

    fillForm({ name: "Grace Hopper", email: "grace@example.com", password: "12345678" });
    click("Create user");

    expect(await screen.findByText("HTTP 400")).toBeInTheDocument();
  });
});

describe("UserForm (edit user)", () => {
  function mockPatch(result: () => Promise<unknown>) {
    return spyOn(api, "patch").mockImplementation((() => result()) as typeof api.patch);
  }

  test("is filled in with the user's name and email and a blank password", async () => {
    await renderForm(alan);

    expect(screen.getByLabelText("Name")).toHaveValue("Alan Agent");
    expect(screen.getByLabelText("Email")).toHaveValue("alan@example.com");
    const password = screen.getByLabelText("New password");
    expect(password).toHaveValue("");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAccessibleDescription("Leave blank to keep the current password.");
  });

  test("sends no password when the password field is left blank", async () => {
    const patch = mockPatch(() => Promise.resolve({ data: { user: {} } }));
    const invalidate = spyOn(queryClient, "invalidateQueries");
    const onSaved = await renderForm(alan);

    fill("Name", "  Alan Turing ");
    fill("Email", " alan.turing@example.com ");
    click("Save changes");

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]).toEqual(["/users/user-2", { name: "Alan Turing", email: "alan.turing@example.com" }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  test("sends the new password when one is entered", async () => {
    const patch = mockPatch(() => Promise.resolve({ data: { user: {} } }));
    const onSaved = await renderForm(alan);

    fill("New password", "new-password");
    click("Save changes");

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]).toEqual([
      "/users/user-2",
      { name: "Alan Agent", email: "alan@example.com", password: "new-password" },
    ]);
  });

  test("rejects a short new password, a 2-character name and an invalid email", async () => {
    const patch = mockPatch(() => Promise.resolve({ data: {} }));
    await renderForm(alan);

    fill("Name", "Al");
    fill("Email", "not-an-email");
    fill("New password", "1234567");
    click("Save changes");

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    const password = screen.getByLabelText("New password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    // Both the hint and the error describe the field.
    expect(password).toHaveAccessibleDescription(
      "Leave blank to keep the current password. Password must be at least 8 characters",
    );
    expect(patch).not.toHaveBeenCalled();
  });

  test("disables the save button while the request is pending", async () => {
    mockPatch(() => new Promise(() => {}));
    await renderForm(alan);

    click("Save changes");

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  test("shows the API's error and keeps the edits when saving fails", async () => {
    mockPatch(() => httpError(409, { error: "A user with this email already exists" }));
    const onSaved = await renderForm(alan);

    fill("Email", "ada@example.com");
    click("Save changes");

    expect(await screen.findByText("A user with this email already exists")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
