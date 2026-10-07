import axios from "axios";

// Shared axios instance for the app's API. Paths are relative to /api (e.g. api.get("/users")), which the
// dev server proxies and production serves from the same origin, so the session cookie is sent automatically.
export const api = axios.create({ baseURL: "/api" });

// A readable message for a failed request: the API's `{ error }` body, else the HTTP status, else the
// network error.
export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(err)) {
    const { response } = err;
    if (response) return typeof response.data?.error === "string" ? response.data.error : `HTTP ${response.status}`;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
