import { Navigate, Outlet } from "react-router";
import { authClient } from "../lib/auth-client.ts";

// Loads the session on startup (GET /api/auth/get-session) and sends signed-out users to /login.
export function RequireAuth() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <p className="mt-24 text-center text-muted-foreground">Loading…</p>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
