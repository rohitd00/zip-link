import type { RangePreset } from "../../components/RangeSelector";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface DateRange {
  from: string;
  to: string;
}

const PRESET_HOURS: Record<Exclude<RangePreset, "custom">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

/**
 * Converts a range preset into concrete ISO-8601 boundaries ending at the
 * current instant. "custom" has no fixed duration and is handled
 * separately by the caller's own date inputs.
 */
export function buildRangeForPreset(preset: Exclude<RangePreset, "custom">, now: Date): DateRange {
  const durationMilliseconds = PRESET_HOURS[preset] * MILLISECONDS_PER_HOUR;
  const from = new Date(now.getTime() - durationMilliseconds);

  return { from: from.toISOString(), to: now.toISOString() };
}
