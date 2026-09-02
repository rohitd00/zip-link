import { Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { useTheme, type ThemePreference } from "../hooks/useTheme";

const THEME_OPTIONS: Array<{
  preference: ThemePreference;
  label: string;
  icon: ComponentType<LucideProps>;
}> = [
  { preference: "light", label: "Light theme", icon: Sun },
  { preference: "dark", label: "Dark theme", icon: Moon },
  { preference: "system", label: "Match system theme", icon: Monitor },
];

/**
 * The three-state Light / Dark / System control from Section 16.5 of the
 * design specification — a small segmented control matching
 * `RangeSelector`'s visual pattern (a track with a raised, shadowed pill
 * for the active option), so the product's two segmented controls read as
 * one consistent pattern rather than two different ones.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex gap-0.5 rounded-[var(--radius-control)] border border-border bg-surface-subtle p-1"
    >
      {THEME_OPTIONS.map(({ preference: optionPreference, label, icon: Icon }) => {
        const isSelected = optionPreference === preference;

        return (
          <button
            key={optionPreference}
            type="button"
            aria-pressed={isSelected}
            aria-label={label}
            title={label}
            onClick={() => setPreference(optionPreference)}
            className={`flex h-7 w-7 items-center justify-center rounded-[8px] transition-all duration-150
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
              ${
                isSelected
                  ? "bg-surface text-text shadow-[var(--shadow-card)]"
                  : "text-text-muted hover:text-text"
              }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
