import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api } from "@/lib/api.ts";
import { Role } from "@/lib/role.ts";
import { queryClient } from "@/lib/query-client.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { UsersPage } from "./UsersPage.tsx";

const users = [
  { id: "1", name: "Ada Admin", email: "ada@example.com", role: Role.ADMIN, createdAt: "2026-01-15T10:00:00.000Z" },
  { id: "2", name: "Alan Agent", email: "alan@example.com", role: Role.AGENT, createdAt: "2026-03-02T08:30:00.000Z" },
];

// Stubs GET /api/users on the shared axios instance.
function mockGetUsers(result: Promise<unknown>) {
  return spyOn(api, "get").mockImplementation((() => result) as typeof api.get);
}

function ok(data: unknown) {
  return Promise.resolve({ data, status: 200 });
}

// An axios error carrying an HTTP response, as axios rejects with for a non-2xx status.
function httpError(status: number, data: unknown) {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response as AxiosResponse),
  );
}

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("UsersPage", () => {
  test("requests the users from GET /users", async () => {
    const get = mockGetUsers(ok({ users }));
    renderWithQuery(<UsersPage />);

    await screen.findByRole("table");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe("/users");
    expect(get.mock.calls[0]?.[1]).toEqual({ signal: expect.any(AbortSignal) });
  });

  test("shows the heading and a loading status while the request is pending", () => {
    mockGetUsers(new Promise(() => {}));
    renderWithQuery(<UsersPage />);

    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New user" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading users…");
    // The skeleton table is aria-hidden, so assistive tech only gets the status text.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("lists each user with their email, role and creation date", async () => {
    mockGetUsers(ok({ users }));
    renderWithQuery(<UsersPage />);

    const table = await screen.findByRole("table");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Name", "Email", "Role", "Created", "Actions"]);

    const [, adaRow, alanRow] = within(table).getAllByRole("row");
    const adaCells = within(adaRow!).getAllByRole("cell").map((td) => td.textContent);
    expect(adaCells).toEqual(["Ada Admin", "ada@example.com", "Admin", new Date(users[0]!.createdAt).toLocaleDateString(), ""]);
    expect(within(adaRow!).getByRole("button", { name: "Edit Ada Admin" })).toBeInTheDocument();
    expect(within(adaRow!).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    const alanCells = within(alanRow!).getAllByRole("cell").map((td) => td.textContent);
    expect(alanCells).toEqual(["Alan Agent", "alan@example.com", "Agent", new Date(users[1]!.createdAt).toLocaleDateString(), ""]);
    expect(within(alanRow!).getByRole("button", { name: "Edit Alan Agent" })).toBeInTheDocument();
    expect(within(alanRow!).getByRole("button", { name: "Delete Alan Agent" })).toBeInTheDocument();
  });

  test("shows an empty state when there are no users", async () => {
    mockGetUsers(ok({ users: [] }));
    renderWithQuery(<UsersPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("No users yet.")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(2); // header row + empty-state row
  });

  test("shows the API's error message when the request fails", async () => {
    mockGetUsers(httpError(403, { error: "Forbidden" }));
    renderWithQuery(<UsersPage />);

    expect(await screen.findByText("Couldn't load users: Forbidden")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("falls back to the HTTP status when the error response has no message", async () => {
    mockGetUsers(httpError(404, "Not Found"));
    renderWithQuery(<UsersPage />);

    expect(await screen.findByText("Couldn't load users: HTTP 404")).toBeInTheDocument();
  });

  describe("New user dialog", () => {
    async function openDialog() {
      mockGetUsers(ok({ users }));
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "New user" }));
      return screen.findByRole("dialog", { name: "New user" });
    }

    // A full left-button press and release, which Base UI needs to treat a press as an outside click.
    function press(el: Element) {
      fireEvent.pointerDown(el, { button: 0, pointerType: "mouse" });
      fireEvent.mouseDown(el, { button: 0 });
      fireEvent.pointerUp(el, { button: 0, pointerType: "mouse" });
      fireEvent.mouseUp(el, { button: 0 });
      fireEvent.click(el, { button: 0 });
    }

    test("opens when the New user button is clicked", async () => {
      const dialog = await openDialog();

      expect(within(dialog).getByLabelText("Name")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Create user" })).toBeInTheDocument();
    });

    test("closes when Escape is pressed", async () => {
      const dialog = await openDialog();

      fireEvent.keyDown(within(dialog).getByLabelText("Name"), { key: "Escape" });

      // Base UI closes the dialog synchronously (animations are disabled in tests).
      expect(dialog).not.toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    test("closes when clicking outside it", async () => {
      const dialog = await openDialog();
      // The backdrop covering the page has no role, so it can only be found by its slot.
      const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
      expect(backdrop).not.toBeNull();

      press(backdrop!);

      // Base UI closes the dialog synchronously (animations are disabled in tests).
      expect(dialog).not.toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    test("stays open when clicking inside it", async () => {
      const dialog = await openDialog();

      press(within(dialog).getByRole("heading", { name: "New user" }));

      // A dismissal would be synchronous (see above), so the dialog would already be gone.
      expect(dialog).toBeInTheDocument();
    });

    test("closes and reloads the users after a user is created", async () => {
      const get = mockGetUsers(ok({ users }));
      spyOn(api, "post").mockImplementation((() => ok({ user: {} })) as typeof api.post);
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");
      fireEvent.click(screen.getByRole("button", { name: "New user" }));
      const dialog = await screen.findByRole("dialog", { name: "New user" });

      fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "Grace Hopper" } });
      fireEvent.input(within(dialog).getByLabelText("Email"), { target: { value: "grace@example.com" } });
      fireEvent.input(within(dialog).getByLabelText("Password"), { target: { value: "12345678" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

      await waitForElementToBeRemoved(dialog);
      expect(get).toHaveBeenCalledTimes(2);
    });

    test("starts with an empty form and no error when reopened", async () => {
      spyOn(api, "post").mockImplementation((() => httpError(409, { error: "A user with this email already exists" })) as typeof api.post);
      const dialog = await openDialog();
      fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "Grace Hopper" } });
      fireEvent.input(within(dialog).getByLabelText("Email"), { target: { value: "ada@example.com" } });
      fireEvent.input(within(dialog).getByLabelText("Password"), { target: { value: "12345678" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
      await within(dialog).findByText("A user with this email already exists");

      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(dialog).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "New user" }));

      const reopened = await screen.findByRole("dialog", { name: "New user" });
      expect(within(reopened).getByLabelText("Name")).toHaveValue("");
      expect(within(reopened).getByLabelText("Email")).toHaveValue("");
      expect(within(reopened).queryByText("A user with this email already exists")).not.toBeInTheDocument();
    });
  });

  describe("Edit user dialog", () => {
    async function openEdit(name: string) {
      fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
      return screen.findByRole("dialog", { name: "Edit user" });
    }

    test("shows the clicked row's user each time, and an empty form for a new user afterwards", async () => {
      mockGetUsers(ok({ users }));
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");

      let dialog = await openEdit("Alan Agent");
      expect(within(dialog).getByLabelText("Name")).toHaveValue("Alan Agent");
      fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "Unsaved edit" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      dialog = await openEdit("Ada Admin");
      expect(within(dialog).getByLabelText("Name")).toHaveValue("Ada Admin");
      expect(within(dialog).getByLabelText("Email")).toHaveValue("ada@example.com");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      dialog = await openEdit("Alan Agent");
      expect(within(dialog).getByLabelText("Name")).toHaveValue("Alan Agent");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      fireEvent.click(screen.getByRole("button", { name: "New user" }));
      dialog = await screen.findByRole("dialog", { name: "New user" });
      expect(within(dialog).getByLabelText("Name")).toHaveValue("");
      expect(within(dialog).getByLabelText("Password")).toBeInTheDocument();
    });

    test("closes and reloads the users after saving", async () => {
      const get = mockGetUsers(ok({ users }));
      const patch = spyOn(api, "patch").mockImplementation((() => ok({ user: {} })) as typeof api.patch);
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");
      const dialog = await openEdit("Alan Agent");

      fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "Alan Turing" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

      await waitForElementToBeRemoved(dialog);
      expect(patch.mock.calls[0]).toEqual(["/users/2", { name: "Alan Turing", email: "alan@example.com" }]);
      expect(get).toHaveBeenCalledTimes(2);
    });
  });

  describe("Delete user confirmation", () => {
    async function openDelete() {
      fireEvent.click(screen.getByRole("button", { name: "Delete Alan Agent" }));
      return screen.findByRole("alertdialog", { name: "Delete user?" });
    }

    test("asks about the clicked row's user", async () => {
      mockGetUsers(ok({ users }));
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");

      const dialog = await openDelete();

      expect(dialog).toHaveAccessibleDescription("Alan Agent (alan@example.com) will be signed out and can no longer sign in.");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("Cancel closes it without deleting anyone", async () => {
      mockGetUsers(ok({ users }));
      const del = spyOn(api, "delete");
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");
      const dialog = await openDelete();

      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(dialog).not.toBeInTheDocument();
      expect(del).not.toHaveBeenCalled();
      expect(screen.getByRole("cell", { name: "Alan Agent" })).toBeInTheDocument();
    });

    test("closes and reloads the users after deleting", async () => {
      const get = spyOn(api, "get")
        .mockImplementationOnce((() => ok({ users })) as typeof api.get)
        .mockImplementation((() => ok({ users: [users[0]] })) as typeof api.get);
      const del = spyOn(api, "delete").mockImplementation((() => ok("")) as typeof api.delete);
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");
      const dialog = await openDelete();

      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitForElementToBeRemoved(dialog);
      expect(del.mock.calls[0]).toEqual(["/users/2"]);
      expect(get).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("cell", { name: "Alan Agent" })).not.toBeInTheDocument();
    });

    test("the form dialog still opens for New user after a delete confirmation", async () => {
      mockGetUsers(ok({ users }));
      renderWithQuery(<UsersPage />);
      await screen.findByRole("table");
      const dialog = await openDelete();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      fireEvent.click(screen.getByRole("button", { name: "New user" }));

      const form = await screen.findByRole("dialog", { name: "New user" });
      expect(within(form).getByLabelText("Name")).toHaveValue("");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
