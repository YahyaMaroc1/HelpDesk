import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboardIcon, TicketIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { cn } from "cn";
import { ThemeToggle } from "@/components/ThemeToggle.tsx";
import { Button } from "@/components/ui/button.tsx";
import { authClient } from "../lib/auth-client.ts";
import { Role } from "../lib/role.ts";

// The nav bar and the page share one width and gutter, so the logo and "Sign out" line up with the content.
const pageContainerClass = "mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8";

// On phones the links show only their icons; the names stay for screen readers and tests.
const navLabelClass = "sr-only sm:not-sr-only";

// The current page gets a brand-coloured underline that sits on the nav's bottom border.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "-mb-px flex h-14 items-center gap-2 border-b-2 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0",
    isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
  );

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
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-t-3 border-b border-t-primary bg-card">
        <div className={cn("flex h-14 items-center justify-between gap-4", pageContainerClass)}>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link to="/" className="text-lg font-semibold">
              HelpDesk
            </Link>
            <NavLink to="/" end className={navLinkClass}>
              <LayoutDashboardIcon aria-hidden="true" />
              <span className={navLabelClass}>Dashboard</span>
            </NavLink>
            <NavLink to="/tickets" className={navLinkClass}>
              <TicketIcon aria-hidden="true" />
              <span className={navLabelClass}>Tickets</span>
            </NavLink>
            {session?.user.role === Role.ADMIN && (
              <NavLink to="/users" className={navLinkClass}>
                <UsersIcon aria-hidden="true" />
                <span className={navLabelClass}>Users</span>
              </NavLink>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session?.user.name}</span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </nav>
      <main className={cn("py-8", pageContainerClass)}>
        <Outlet />
      </main>
    </div>
  );
}
