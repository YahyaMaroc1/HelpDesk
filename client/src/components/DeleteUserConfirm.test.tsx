import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog.tsx";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { DeleteUserConfirm } from "./DeleteUserConfirm.tsx";

const alan = { id: "user-2", name: "Alan Agent", email: "alan@example.com" };

// An axios error carrying an HTTP response, as axios rejects with for a non-2xx status.
function httpError(status: number, data: unknown) {
  const response = { data, status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, response as AxiosResponse),
  );
}

function mockDelete(result: () => Promise<unknown>) {
  return spyOn(api, "delete").mockImplementation((() => result()) as typeof api.delete);
}

// The confirmation inside an open alert dialog, as UsersPage shows it. Returns the dialog, onDeleted and
// onOpenChange spies.
async function renderConfirm() {
  const onDeleted = mock(() => {});
  const onOpenChange = mock((_open: boolean) => {});
  renderWithQuery(
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DeleteUserConfirm user={alan} onDeleted={onDeleted} />
      </AlertDialogContent>
    </AlertDialog>,
  );
  const dialog = await screen.findByRole("alertdialog", { name: "Delete user?" });
  return { dialog, onDeleted, onOpenChange };
}

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe("DeleteUserConfirm", () => {
  test("names the user and what deleting them does", async () => {
    const { dialog } = await renderConfirm();

    expect(dialog).toHaveAccessibleDescription("Alan Agent (alan@example.com) will be signed out and can no longer sign in.");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  test("deletes the user, refreshes the users list and reports success", async () => {
    const del = mockDelete(() => Promise.resolve({ status: 204, data: "" }));
    const invalidate = spyOn(queryClient, "invalidateQueries");
    const { dialog, onDeleted } = await renderConfirm();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0]).toEqual(["/users/user-2"]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  test("disables the delete button while the request is pending", async () => {
    mockDelete(() => new Promise(() => {}));
    const { dialog } = await renderConfirm();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("button", { name: "Deleting…" })).toBeDisabled();
  });

  test("shows the API's error and doesn't report success when deleting fails", async () => {
    mockDelete(() => httpError(403, { error: "Admins can't be deleted" }));
    const { dialog, onDeleted } = await renderConfirm();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByText("Admins can't be deleted")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  test("falls back to the HTTP status when the error response has no message", async () => {
    mockDelete(() => httpError(404, "Not Found"));
    const { dialog } = await renderConfirm();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByText("HTTP 404")).toBeInTheDocument();
  });

  test("Cancel asks to close without deleting", async () => {
    const del = mockDelete(() => Promise.resolve({ status: 204, data: "" }));
    const { dialog, onDeleted, onOpenChange } = await renderConfirm();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
    expect(del).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
