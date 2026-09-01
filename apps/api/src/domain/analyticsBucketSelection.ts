import { HOURLY_BUCKET_MAX_RANGE_HOURS } from "@shared/constants/validationLimits";

export type AnalyticsBucket = "hour" | "day";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

// An explicitly requested hourly bucket is still capped: beyond this many
// hours, hourly points would be too numerous to be a useful chart and too
// expensive to compute repeatedly. This is intentionally more generous
// than the default hour/day switchover point (HOURLY_BUCKET_MAX_RANGE_HOURS),
// since an explicit request deserves more room before being overridden.
const HOURLY_BUCKET_HARD_CAP_HOURS = HOURLY_BUCKET_MAX_RANGE_HOURS * 4;

/**
 * Chooses the bucket granularity for an analytics timeline. If the caller
 * did not request one, hour is used for a short range (48 hours or less)
 * and day for anything longer. An explicit request is honored unless it
 * would produce an impractical number of points, in which case the API
 * overrides it — matching Section 12.4 of app-flow.md ("The API makes the
 * final bucket decision if a requested bucket would create too many
 * points").
 */
export function chooseAnalyticsBucket(
  requestedBucket: AnalyticsBucket | null,
  from: Date,
  to: Date,
): AnalyticsBucket {
  const rangeHours = (to.getTime() - from.getTime()) / MILLISECONDS_PER_HOUR;

  if (requestedBucket === "hour" && rangeHours > HOURLY_BUCKET_HARD_CAP_HOURS) {
    return "day";
  }

  if (requestedBucket !== null) {
    return requestedBucket;
  }

  return rangeHours <= HOURLY_BUCKET_MAX_RANGE_HOURS ? "hour" : "day";
}
