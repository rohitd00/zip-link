import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon?: ComponentType<LucideProps>;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface-subtle/50 p-10 text-center">
      {Icon !== undefined && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-muted shadow-[var(--shadow-card)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-1 text-sm text-text-muted">{description}</p>
    </div>
  );
}
