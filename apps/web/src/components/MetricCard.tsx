export function MetricCard({
  label,
  value,
  supportingText,
}: {
  label: string;
  value: number;
  supportingText: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-text">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-text-muted">{supportingText}</p>
    </div>
  );
}
