import type { ReactNode } from "react";
import { Link2, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { AuthenticatedUserDto } from "@shared/contracts/auth";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The application header and centered content wrapper used on every
 * dashboard page. Navigation is intentionally limited to the product mark
 * and a single "Links" destination, matching Section 7.1 of the design
 * specification — analytics only make sense in the context of one link,
 * so a separate top-level "Analytics" destination is not needed. The theme
 * toggle sits at the far right (Section 4.1/16.5) — a display preference,
 * not a new product surface.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-[15px] font-semibold text-text"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            ZipLink
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-subtle hover:text-text"
            >
              Links
            </Link>
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}

/** Shows sign-in/sign-up links when signed out, or the user's name and a
 * log-out button when signed in. Renders nothing while the initial
 * GET /api/auth/me is still in flight, to avoid a signed-out flash. */
function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    await signOut();
    navigate("/");
  }

  if (user === undefined) {
    return null;
  }

  if (user === null) {
    return (
      <div className="ml-1 flex items-center gap-2">
        <Link
          to="/login"
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-subtle hover:text-text"
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-colors hover:bg-accent-hover"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return <SignedInAccountMenu user={user} onSignOut={() => void handleSignOut()} />;
}

function SignedInAccountMenu({
  user,
  onSignOut,
}: {
  user: AuthenticatedUserDto;
  onSignOut: () => void;
}) {
  return (
    <div className="ml-1 flex items-center gap-2">
      <span className="hidden text-sm text-text-muted sm:inline">
        {user.displayName ?? user.email}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-subtle hover:text-text"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        Log out
      </button>
    </div>
  );
}
