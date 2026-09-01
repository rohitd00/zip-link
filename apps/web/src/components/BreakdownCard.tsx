export interface BreakdownRow {
  name: string;
  clickCount: number;
}

/**
 * A ranked list of named counts (referrers, devices, browsers). Section
 * 7.8 of the design specification prefers this over pie charts: it reads
 * faster, uses less space, and stays fully accessible.
 */
export function BreakdownCard({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No data in this period.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.name} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="truncate text-text" title={row.name}>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-text-muted">
                {row.clickCount.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
