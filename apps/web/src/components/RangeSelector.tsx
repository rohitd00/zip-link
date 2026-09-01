export type RangePreset = "24h" | "7d" | "30d" | "custom";

const PRESET_LABELS: Record<RangePreset, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  custom: "Custom range",
};

const PRESET_ORDER: RangePreset[] = ["24h", "7d", "30d", "custom"];

/**
 * The compact segmented range control from Section 9.4 of the design
 * specification: the active preset gets a subtle accent-soft background,
 * not a large filled button.
 */
export function RangeSelector({
  selectedPreset,
  onSelectPreset,
}: {
  selectedPreset: RangePreset;
  onSelectPreset: (preset: RangePreset) => void;
}) {
  return (
    <div role="group" aria-label="Analytics date range" className="flex flex-wrap gap-1">
      {PRESET_ORDER.map((preset) => {
        const isSelected = preset === selectedPreset;

        return (
          <button
            key={preset}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectPreset(preset)}
            className={`rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
              ${isSelected ? "bg-accent-soft text-accent" : "text-text-muted hover:text-text"}`}
          >
            {PRESET_LABELS[preset]}
          </button>
        );
      })}
    </div>
  );
}
