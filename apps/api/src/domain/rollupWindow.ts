const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * 24;

// How far back each rollup run recomputes, counted from the start of the
// current (possibly still in-progress) bucket. Recomputing this whole
// window on every run — rather than only the newest bucket — is what makes
// a late-arriving queued event (for example, one that hit BullMQ's retry
// backoff) get folded into the correct rollup row the next time this runs,
// per database-schema.md Section 15.1's "recomputing the complete affected
// bucket guarantees convergence even when events arrive late."
const HOURLY_ROLLUP_OVERLAP_HOURS = 3;
const DAILY_ROLLUP_OVERLAP_DAYS = 2;

export interface RollupWindow {
  windowStart: Date;
  windowEnd: Date;
}

/**
 * The window for the hourly time rollup: the current UTC hour (still
 * in-progress, recomputed every run until it settles) plus the previous
 * `HOURLY_ROLLUP_OVERLAP_HOURS` complete hours. `windowEnd` is an exclusive
 * upper bound — the start of the next hour — so every event that has
 * occurred so far this hour is included.
 */
export function calculateHourlyRollupWindow(currentTime: Date): RollupWindow {
  const currentHourStart = truncateToUtcHour(currentTime);
  const windowEnd = new Date(currentHourStart.getTime() + MILLISECONDS_PER_HOUR);
  const windowStart = new Date(
    currentHourStart.getTime() - HOURLY_ROLLUP_OVERLAP_HOURS * MILLISECONDS_PER_HOUR,
  );

  return { windowStart, windowEnd };
}

/**
 * The window for the daily time rollup: the current UTC day (still
 * in-progress) plus the previous `DAILY_ROLLUP_OVERLAP_DAYS` complete days.
 * Always UTC-truncated, matching database-schema.md Section 15.2's "daily
 * rows use date_trunc('day', occurred_at) in UTC for storage" — daily
 * rollups intentionally do not vary by requester timezone.
 */
export function calculateDailyRollupWindow(currentTime: Date): RollupWindow {
  const currentDayStart = truncateToUtcDay(currentTime);
  const windowEnd = new Date(currentDayStart.getTime() + MILLISECONDS_PER_DAY);
  const windowStart = new Date(
    currentDayStart.getTime() - DAILY_ROLLUP_OVERLAP_DAYS * MILLISECONDS_PER_DAY,
  );

  return { windowStart, windowEnd };
}

function truncateToUtcHour(currentTime: Date): Date {
  return new Date(
    Date.UTC(
      currentTime.getUTCFullYear(),
      currentTime.getUTCMonth(),
      currentTime.getUTCDate(),
      currentTime.getUTCHours(),
    ),
  );
}

function truncateToUtcDay(currentTime: Date): Date {
  return new Date(
    Date.UTC(currentTime.getUTCFullYear(), currentTime.getUTCMonth(), currentTime.getUTCDate()),
  );
}
