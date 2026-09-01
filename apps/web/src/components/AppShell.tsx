import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * The application header and centered content wrapper used on every
 * dashboard page. Navigation is intentionally limited to the product mark
 * and a single "Links" destination, matching Section 7.1 of the design
 * specification — analytics only make sense in the context of one link,
 * so a separate top-level "Analytics" destination is not needed.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-1.5 text-base font-semibold text-text">
            <span aria-hidden="true">↗</span>
            Shortlink
          </Link>
          <Link to="/" className="text-sm font-medium text-text-muted hover:text-text">
            Links
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
