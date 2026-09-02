import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

export interface BreakdownRow {
  name: string;
  clickCount: number;
}

/**
 * A ranked list of named counts (referrers, devices, browsers). Section
 * 7.8 of the design specification prefers this over pie charts: it reads
 * faster, uses less space, and stays fully accessible. Each row's count
 * gets a light proportional bar behind it — a common modern-SaaS device
 * for at-a-glance comparison — layered so it never reduces text contrast.
 */
export function BreakdownCard({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: ComponentType<LucideProps>;
  rows: BreakdownRow[];
}) {
  const highestCount = rows.reduce((max, row) => Math.max(max, row.clickCount), 0);

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-text">
        <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No data in this period.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {rows.map((row) => {
            const barWidthPercent = highestCount === 0 ? 0 : (row.clickCount / highestCount) * 100;

            return (
              <li
                key={row.name}
                className="relative flex items-baseline justify-between gap-4 rounded-md px-2 py-1.5 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-md bg-accent-soft"
                  style={{ width: `${barWidthPercent}%` }}
                />
                <span className="relative truncate text-text" title={row.name}>
                  {row.name}
                </span>
                <span className="relative shrink-0 font-medium tabular-nums text-text">
                  {row.clickCount.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
