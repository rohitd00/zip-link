import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

export function MetricCard({
  label,
  value,
  supportingText,
  icon: Icon,
}: {
  label: string;
  value: number;
  supportingText: string;
  icon: ComponentType<LucideProps>;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-[13px] font-medium">{label}</p>
      </div>
      <p className="mt-3 text-[32px] font-semibold tracking-tight text-text tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-text-muted">{supportingText}</p>
    </div>
  );
}
