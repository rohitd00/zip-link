import type { ReactNode } from "react";
import { Link2 } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Shared centered-card layout for the signup/login/password-reset pages.
 * Deliberately its own minimal header (just the wordmark, linking home)
 * rather than AppShell — those auth pages render before we know who (if
 * anyone) is signed in, so the dashboard chrome doesn't apply yet.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold text-text">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            ZipLink
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
            {subtitle !== undefined && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}
          </div>
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
