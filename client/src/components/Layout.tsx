import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Outlet } from "react-router";
import { authClient } from "../lib/auth-client.ts";

export function Layout() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    // The session store refetches and RequireAuth redirects to /login.
    const { error } = await authClient.signOut();
    if (error) {
      setSigningOut(false);
      return;
    }
    // Drop cached API data so the next user signing in on this tab never sees it.
    queryClient.clear();
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold">
              HelpDesk
            </Link>
            {session?.user.role === "ADMIN" && (
              <Link to="/users" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Users
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">{session?.user.name}</span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
