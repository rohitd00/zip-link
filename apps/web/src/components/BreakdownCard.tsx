import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

export interface BreakdownRow {
  name: string;
  clickCount: number;
}

export interface BreakdownSection {
  label: string;
  rows: BreakdownRow[];
}

interface BreakdownCardProps {
  title: string;
  icon: ComponentType<LucideProps>;
  // Exactly one of these is provided: `rows` for a single ranked list
  // (referrers, geography), `sections` for a card with more than one
  // ranked list inside it (devices/browsers — Section 7.8.1).
  rows?: BreakdownRow[];
  sections?: BreakdownSection[];
}

/**
 * A ranked list of named counts (referrers, devices, browsers, geography).
 * Section 7.8 of the design specification prefers this over pie charts: it
 * reads faster, uses less space, and stays fully accessible. Each row's
 * count gets a light proportional bar behind it — a common modern-SaaS
 * device for at-a-glance comparison — layered so it never reduces text
 * contrast.
 *
 * The devices/browsers card (Section 7.8.1) needs two independent ranked
 * lists in one card rather than one flat list — merging "desktop" and
 * "Chrome" into a single ranking would make neither dimension readable.
 * Passing `sections` instead of `rows` renders that shape: each section
 * gets its own small label and its own ranked list, and each list scales
 * its proportional bars against its own highest count (not the other
 * list's), since the two dimensions' counts aren't otherwise comparable.
 */
export function BreakdownCard({ title, icon: Icon, rows, sections }: BreakdownCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-text">
        <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      {sections !== undefined ? (
        <div className="mt-3 flex flex-col gap-4">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="text-xs font-medium text-text-muted">{section.label}</p>
              <BreakdownRankedList rows={section.rows} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <BreakdownRankedList rows={rows ?? []} />
        </div>
      )}
    </div>
  );
}

function BreakdownRankedList({ rows }: { rows: BreakdownRow[] }) {
  const highestCount = rows.reduce((max, row) => Math.max(max, row.clickCount), 0);

  if (rows.length === 0) {
    return <p className="mt-1.5 text-sm text-text-muted">No data in this period.</p>;
  }

  return (
    <ul className="mt-1.5 flex flex-col gap-1">
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
  );
}
