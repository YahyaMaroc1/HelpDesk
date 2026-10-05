import { Navigate, Outlet } from "react-router";
import { authClient } from "../lib/auth-client.ts";

// Nested under RequireAuth, so the session is already loaded. Sends non-admins back to the home page.
export function RequireAdmin() {
  const { data: session } = authClient.useSession();

  if (session?.user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
