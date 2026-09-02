// The response shape for GET /api/links/:code/analytics, matching Section
// 11.5 of the technical specification. This is defined now, in the shared
// package, even though the analytics endpoint is implemented in a later
// phase, so that no part of the system invents its own competing shape.
export interface AnalyticsResponseData {
  link: {
    shortCode: string;
    shortUrl: string;
    longUrl: string;
  };
  range: {
    from: string;
    to: string;
    timezone: string;
    bucket: "hour" | "day";
  };
  totalClicks: number;
  // Distinct visitors within the range, approximated by distinct hashed IP
  // addresses (the same ip_hash already stored for privacy — see
  // docs/10-system-design.md). This undercounts uniqueness behind shared/
  // mobile NAT and overcounts if one visitor's IP changes between visits;
  // it is an approximation, not an exact per-person count.
  uniqueVisitors: number;
  timeline: Array<{ bucketStart: string; clickCount: number }>;
  referrers: Array<{ name: string; clickCount: number }>;
  devices: Array<{ name: string; clickCount: number }>;
  browsers: Array<{ name: string; clickCount: number }>;
  operatingSystems: Array<{ name: string; clickCount: number }>;
  geography: Array<{ country: string; city: string | null; clickCount: number }>;
  freshness: {
    isEventuallyConsistent: boolean;
    lastRollupAt: string | null;
  };
}
