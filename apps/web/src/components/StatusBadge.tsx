export type LinkLifecycleStatus = "active" | "expiring_soon" | "expired" | "deleted";

const STATUS_LABELS: Record<LinkLifecycleStatus, string> = {
  active: "Active",
  expiring_soon: "Expires soon",
  expired: "Expired",
  deleted: "Deleted",
};

const STATUS_CLASS_NAMES: Record<LinkLifecycleStatus, string> = {
  active: "bg-success-soft text-success",
  expiring_soon: "bg-warning-soft text-warning",
  expired: "bg-surface-subtle text-text-muted",
  deleted: "bg-surface-subtle text-text-muted",
};

/**
 * A small lifecycle-state label. Color is never the only signal — the
 * text itself always states the status — per Section 14.3 of the design
 * specification ("statuses pair written label with color").
 */
export function StatusBadge({ status }: { status: LinkLifecycleStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS_NAMES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
