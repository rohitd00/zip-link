export type LinkLifecycleStatus = "active" | "expiring_soon" | "expired" | "deleted";

const STATUS_LABELS: Record<LinkLifecycleStatus, string> = {
  active: "Active",
  expiring_soon: "Expires soon",
  expired: "Expired",
  deleted: "Deleted",
};

const STATUS_DOT_COLORS: Record<LinkLifecycleStatus, string> = {
  active: "bg-success",
  expiring_soon: "bg-warning",
  expired: "bg-text-muted",
  deleted: "bg-text-muted",
};

const STATUS_TEXT_COLORS: Record<LinkLifecycleStatus, string> = {
  active: "text-success",
  expiring_soon: "text-warning",
  expired: "text-text-muted",
  deleted: "text-text-muted",
};

/**
 * A small lifecycle-state indicator: a colored dot plus the written label.
 * Color is never the only signal — the text itself always states the
 * status — per Section 14.3 of the design specification. The dot-plus-text
 * pattern (rather than a filled pill) is a common modern-SaaS convention
 * (Linear, Vercel) that reads as less "badge-heavy" in a dense list.
 */
export function StatusBadge({ status }: { status: LinkLifecycleStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium ${STATUS_TEXT_COLORS[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_COLORS[status]}`}
        aria-hidden="true"
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
