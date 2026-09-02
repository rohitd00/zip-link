import { describe, expect, it } from "vitest";
import type { AnalyticsResponseData } from "@shared/contracts/analytics";
import { buildAnalyticsCsv } from "./analyticsCsvExport";

function buildAnalytics(overrides: Partial<AnalyticsResponseData> = {}): AnalyticsResponseData {
  return {
    link: {
      shortCode: "abc",
      shortUrl: "https://sho.rt/abc",
      longUrl: "https://example.com/page",
    },
    range: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
      bucket: "day",
    },
    totalClicks: 10,
    uniqueVisitors: 7,
    timeline: [{ bucketStart: "2026-08-15T00:00:00.000Z", clickCount: 10 }],
    referrers: [{ name: "Direct / unknown", clickCount: 10 }],
    devices: [{ name: "desktop", clickCount: 10 }],
    browsers: [{ name: "Chrome", clickCount: 10 }],
    operatingSystems: [{ name: "Windows", clickCount: 10 }],
    geography: [{ country: "United States", city: "New York", clickCount: 10 }],
    freshness: { isEventuallyConsistent: true, lastRollupAt: null },
    ...overrides,
  };
}

describe("buildAnalyticsCsv", () => {
  it("includes every section with the correct headers", () => {
    const csv = buildAnalyticsCsv(buildAnalytics());

    expect(csv).toContain("Summary\nMetric,Value");
    expect(csv).toContain("Total Clicks,10");
    expect(csv).toContain("Unique Visitors,7");
    expect(csv).toContain("Timeline\nBucket Start,Click Count");
    expect(csv).toContain("Referrers\nName,Click Count");
    expect(csv).toContain("Devices\nName,Click Count");
    expect(csv).toContain("Operating Systems\nName,Click Count");
    expect(csv).toContain("Browsers\nName,Click Count");
    expect(csv).toContain("Geography\nCountry,City,Click Count");
    expect(csv).toContain("United States,New York,10");
  });

  it("renders a null city as an empty field, not the string null", () => {
    const csv = buildAnalyticsCsv(
      buildAnalytics({ geography: [{ country: "Unknown", city: null, clickCount: 3 }] }),
    );

    expect(csv).toContain("Unknown,,3");
  });

  it("quotes and escapes a field containing a comma", () => {
    const csv = buildAnalyticsCsv(
      buildAnalytics({ referrers: [{ name: "example.com, inc.", clickCount: 2 }] }),
    );

    expect(csv).toContain('"example.com, inc.",2');
  });

  it("doubles an internal quote character", () => {
    const csv = buildAnalyticsCsv(
      buildAnalytics({ referrers: [{ name: 'the "best" site', clickCount: 1 }] }),
    );

    expect(csv).toContain('"the ""best"" site",1');
  });

  it("never includes a per-click row -- only aggregate breakdowns", () => {
    const csv = buildAnalyticsCsv(buildAnalytics());

    expect(csv).not.toMatch(/ip_hash|clientIp|visitorId/i);
  });
});
