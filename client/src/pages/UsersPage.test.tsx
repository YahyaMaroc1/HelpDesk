import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api } from "@/lib/api.ts";
import { queryClient } from "@/lib/query-client.ts";
import { renderWithQuery } from "@/test/render-with-query.tsx";
import { UsersPage } from "./UsersPage.tsx";

const users = [
  { id: "1", name: "Ada Admin", email: "ada@example.com", role: "ADMIN", createdAt: "2026-01-15T10:00:00.000Z" },
  { id: "2", name: "Alan Agent", email: "alan@example.com", role: "AGENT", createdAt: "2026-03-02T08:30:00.000Z" },
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
    expect(headers).toEqual(["Name", "Email", "Role", "Created"]);

    const [, adaRow, alanRow] = within(table).getAllByRole("row");
    const adaCells = within(adaRow!).getAllByRole("cell").map((td) => td.textContent);
    expect(adaCells).toEqual(["Ada Admin", "ada@example.com", "Admin", new Date(users[0]!.createdAt).toLocaleDateString()]);
    const alanCells = within(alanRow!).getAllByRole("cell").map((td) => td.textContent);
    expect(alanCells).toEqual(["Alan Agent", "alan@example.com", "Agent", new Date(users[1]!.createdAt).toLocaleDateString()]);
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
});
