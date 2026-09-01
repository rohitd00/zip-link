import type { AnalyticsQueryInput } from "../services/analyticsService";

/**
 * Reads the raw analytics query string into the shape AnalyticsService
 * expects. This only extracts string-or-undefined values; the actual
 * range/bucket/timezone business rules live in the domain layer and run
 * afterward.
 */
export function parseAnalyticsQuery(rawQuery: Record<string, unknown>): AnalyticsQueryInput {
  return {
    from: readOptionalStringParam(rawQuery.from),
    to: readOptionalStringParam(rawQuery.to),
    bucket: readOptionalStringParam(rawQuery.bucket),
    timezone: readOptionalStringParam(rawQuery.timezone),
  };
}

function readOptionalStringParam(rawValue: unknown): string | undefined {
  return typeof rawValue === "string" && rawValue.length > 0 ? rawValue : undefined;
}
