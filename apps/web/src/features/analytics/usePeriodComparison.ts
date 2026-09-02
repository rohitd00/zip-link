import { useEffect, useState } from "react";
import type { AnalyticsResponseData } from "@shared/contracts/analytics";
import { apiClient } from "../../api/apiClient";
import type { DateRange } from "./dateRangeHelpers";

/**
 * Fetches analytics for the equal-length period immediately preceding
 * currentRange, only while enabled is true — so toggling "compare to
 * previous period" off costs nothing (no request, no stale data shown).
 * The comparison endpoint is the same GET .../analytics already used for
 * the current range; there is no dedicated backend comparison endpoint,
 * since the delta itself is cheap to compute client-side from two
 * ordinary responses.
 */
export function usePeriodComparison(
  shortCode: string,
  currentRange: DateRange,
  enabled: boolean,
): AnalyticsResponseData | null {
  const [previousPeriodAnalytics, setPreviousPeriodAnalytics] =
    useState<AnalyticsResponseData | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPreviousPeriodAnalytics(null);
      return;
    }

    let isCancelled = false;
    const previousRange = buildImmediatelyPrecedingRange(currentRange);

    apiClient
      .getLinkAnalytics(shortCode, previousRange)
      .then((response) => {
        if (!isCancelled) {
          setPreviousPeriodAnalytics(response.data);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setPreviousPeriodAnalytics(null);
        }
      });

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortCode, currentRange.from, currentRange.to, enabled]);

  return previousPeriodAnalytics;
}

function buildImmediatelyPrecedingRange(currentRange: DateRange): DateRange {
  const from = new Date(currentRange.from);
  const to = new Date(currentRange.to);
  const durationMilliseconds = to.getTime() - from.getTime();

  return {
    from: new Date(from.getTime() - durationMilliseconds).toISOString(),
    to: from.toISOString(),
  };
}

/** Percentage change from previousValue to currentValue, or null when
 * previousValue is 0 (a percentage change from zero is undefined). */
export function computePercentChange(currentValue: number, previousValue: number): number | null {
  if (previousValue === 0) {
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}
