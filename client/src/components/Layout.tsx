import { useState } from "react";
import { Outlet } from "react-router";
import { authClient } from "../lib/auth-client.ts";

export function Layout() {
  const { data: session } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    // The session store refetches and RequireAuth redirects to /login.
    const { error } = await authClient.signOut();
    if (error) setSigningOut(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-lg font-semibold">HelpDesk</span>
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
