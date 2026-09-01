import { useEffect, useRef, useState } from "react";
import type { AnalyticsResponseData } from "@shared/contracts/analytics";
import { apiClient } from "../../api/apiClient";
import type { DateRange } from "./dateRangeHelpers";

export type AnalyticsLoadingState = "loading" | "loaded" | "error";

export function useLinkAnalytics(shortCode: string, range: DateRange) {
  const [analytics, setAnalytics] = useState<AnalyticsResponseData | null>(null);
  const [loadingState, setLoadingState] = useState<AnalyticsLoadingState>("loading");
  const latestRequestId = useRef(0);

  useEffect(() => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;

    setLoadingState("loading");

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
      });
    // range is an object literal recreated by the caller on every render
    // that changes it; comparing its two string fields directly avoids
    // re-fetching on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortCode, range.from, range.to]);

  return { analytics, loadingState };
}
