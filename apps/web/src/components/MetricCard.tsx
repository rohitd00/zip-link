import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export function MetricCard({
  label,
  value,
  supportingText,
  icon: Icon,
  percentChangeVsPrevious,
}: {
  label: string;
  value: number;
  supportingText: string;
  icon: ComponentType<LucideProps>;
  /** Omit to hide the delta row entirely (the default, no comparison). */
  percentChangeVsPrevious?: number | null;
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
      {percentChangeVsPrevious !== undefined && (
        <PercentChangeIndicator percentChange={percentChangeVsPrevious} />
      )}
    </div>
  );
}

function PercentChangeIndicator({ percentChange }: { percentChange: number | null }) {
  if (percentChange === null) {
    return <p className="mt-1.5 text-xs text-text-muted">No data in the previous period</p>;
  }

  const isFlat = Math.abs(percentChange) < 0.5;
  const isIncrease = percentChange > 0;

  let Icon = Minus;
  let colorClassName = "text-text-muted";

  if (!isFlat) {
    Icon = isIncrease ? TrendingUp : TrendingDown;
    colorClassName = isIncrease ? "text-success" : "text-danger";
  }

  return (
    <p className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${colorClassName}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {isFlat ? "No change" : `${isIncrease ? "+" : ""}${percentChange.toFixed(1)}%`} vs previous
      period
    </p>
  );
}
