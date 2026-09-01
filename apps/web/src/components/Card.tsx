import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
      {children}
    </div>
  );
}
