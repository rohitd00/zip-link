import { useEffect, useRef, useState } from "react";
import type { AnalyticsResponseData } from "@shared/contracts/analytics";
import { apiClient } from "../../api/apiClient";
import type { DateRange } from "./dateRangeHelpers";

export type AnalyticsLoadingState = "loading" | "loaded" | "error";

export function useLinkAnalytics(shortCode: string, range: DateRange) {
  const [analytics, setAnalytics] = useState<AnalyticsResponseData | null>(null);
  const [loadingState, setLoadingState] = useState<AnalyticsLoadingState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const latestRequestId = useRef(0);
  const isManualRefresh = useRef(false);

  useEffect(() => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;

    // A manual refresh (the Refresh button) keeps the existing data on
    // screen and shows a small spinner on the button instead of the full
    // loading skeleton, so the page does not flash empty. Any other
    // trigger (first load, shortCode change, range change) always shows
    // the full skeleton.
    if (isManualRefresh.current) {
      setIsRefreshing(true);
    } else {
      setLoadingState("loading");
    }
    isManualRefresh.current = false;

    apiClient
      .getLinkAnalytics(shortCode, range)
      .then((response) => {
        if (latestRequestId.current !== requestId) {
          return;
        }

        setAnalytics(response.data);
        setLoadingState("loaded");
      })
      .catch(() => {
        if (latestRequestId.current === requestId) {
          setLoadingState("error");
        }
      })
      .finally(() => {
        if (latestRequestId.current === requestId) {
          setIsRefreshing(false);
        }
      });
    // range is an object literal recreated by the caller on every render
    // that changes it; comparing its two string fields directly avoids
    // re-fetching on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortCode, range.from, range.to, refreshToken]);

  function refresh(): void {
    isManualRefresh.current = true;
    setRefreshToken((current) => current + 1);
  }

  return { analytics, loadingState, isRefreshing, refresh };
}
