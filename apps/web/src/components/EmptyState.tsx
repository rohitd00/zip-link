export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-1 text-sm text-text-muted">{description}</p>
    </div>
  );
}
