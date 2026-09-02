import type { AnalyticsResponseData } from "@shared/contracts/analytics";

/**
 * Renders the same aggregate data GET /api/links/:code/analytics already
 * returns as a multi-section CSV file, for download. Deliberately exports
 * only aggregate breakdowns — never a per-click row — matching this
 * project's existing stance of not exposing click-level or IP-level data
 * even to a link's own owner (see docs/10-system-design.md Section 10.4).
 */
export function buildAnalyticsCsv(analytics: AnalyticsResponseData): string {
  const sections: string[] = [];

  sections.push(
    buildCsvSection(
      "Summary",
      ["Metric", "Value"],
      [
        ["Short URL", analytics.link.shortUrl],
        ["Destination URL", analytics.link.longUrl],
        ["From", analytics.range.from],
        ["To", analytics.range.to],
        ["Timezone", analytics.range.timezone],
        ["Total Clicks", String(analytics.totalClicks)],
        ["Unique Visitors", String(analytics.uniqueVisitors)],
      ],
    ),
  );

  sections.push(
    buildCsvSection(
      "Timeline",
      ["Bucket Start", "Click Count"],
      analytics.timeline.map((point) => [point.bucketStart, String(point.clickCount)]),
    ),
  );

  sections.push(buildNamedCountSection("Referrers", analytics.referrers));
  sections.push(buildNamedCountSection("Devices", analytics.devices));
  sections.push(buildNamedCountSection("Operating Systems", analytics.operatingSystems));
  sections.push(buildNamedCountSection("Browsers", analytics.browsers));

  sections.push(
    buildCsvSection(
      "Geography",
      ["Country", "City", "Click Count"],
      analytics.geography.map((row) => [row.country, row.city ?? "", String(row.clickCount)]),
    ),
  );

  return sections.join("\n");
}

function buildNamedCountSection(
  title: string,
  rows: Array<{ name: string; clickCount: number }>,
): string {
  return buildCsvSection(
    title,
    ["Name", "Click Count"],
    rows.map((row) => [row.name, String(row.clickCount)]),
  );
}

function buildCsvSection(title: string, header: string[], rows: string[][]): string {
  const lines = [title, header.map(escapeCsvField).join(",")];

  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }

  return lines.join("\n");
}

// RFC 4180: a field containing a comma, quote, or newline must be wrapped in
// quotes, with any internal quote doubled.
function escapeCsvField(rawValue: string): string {
  const needsQuoting = /[",\n]/.test(rawValue);

  if (!needsQuoting) {
    return rawValue;
  }

  return `"${rawValue.replace(/"/g, '""')}"`;
}
