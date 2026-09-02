export type RangePreset = "24h" | "7d" | "30d" | "custom";

const PRESET_LABELS: Record<RangePreset, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  custom: "Custom range",
};

const PRESET_ORDER: RangePreset[] = ["24h", "7d", "30d", "custom"];

/**
 * A segmented range control on a light track, one common modern-SaaS
 * pattern for a small fixed set of mutually exclusive choices. The active
 * preset sits on a white pill with a subtle shadow, matching Section 9.4
 * of the design specification's "active range gets a subtle background,
 * not a large filled button" — just with a track behind the whole group.
 */
export function RangeSelector({
  selectedPreset,
  onSelectPreset,
}: {
  selectedPreset: RangePreset;
  onSelectPreset: (preset: RangePreset) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Analytics date range"
      className="inline-flex flex-wrap gap-0.5 rounded-[var(--radius-control)] border border-border bg-surface-subtle p-1"
    >
      {PRESET_ORDER.map((preset) => {
        const isSelected = preset === selectedPreset;

        return (
          <button
            key={preset}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectPreset(preset)}
            className={`rounded-[8px] px-3 py-1.5 text-sm font-medium transition-all duration-150
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
              ${
                isSelected
                  ? "bg-surface text-text shadow-[var(--shadow-card)]"
                  : "text-text-muted hover:text-text"
              }`}
          >
            {PRESET_LABELS[preset]}
          </button>
        );
      })}
    </div>
  );
}
