import {
  DEFAULT_ANALYTICS_QUERY_RANGE_DAYS,
  MAX_ANALYTICS_QUERY_RANGE_DAYS,
} from "@shared/constants/validationLimits";
import { ValidationError } from "./applicationErrors";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ValidatedAnalyticsRange {
  from: Date;
  to: Date;
}

/**
 * Validates the `from`/`to` query parameters for an analytics request.
 * When neither is supplied, the range defaults to the last 30 days ending
 * now. The range is always capped at MAX_ANALYTICS_QUERY_RANGE_DAYS so a
 * single request cannot trigger an unbounded table scan, per Rule DB-06.
 */
export function validateAnalyticsRange(
  rawFrom: string | undefined,
  rawTo: string | undefined,
  currentTime: Date,
): ValidatedAnalyticsRange {
  const to = rawTo === undefined ? currentTime : parseTimestampOrThrow(rawTo, "to");

  const defaultFrom = new Date(
    to.getTime() - DEFAULT_ANALYTICS_QUERY_RANGE_DAYS * MILLISECONDS_PER_DAY,
  );
  const from = rawFrom === undefined ? defaultFrom : parseTimestampOrThrow(rawFrom, "from");

  if (from.getTime() >= to.getTime()) {
    throw new ValidationError("The analytics range is invalid.", [
      { field: "from", message: "The start of the range must be before the end." },
    ]);
  }

  const rangeDays = (to.getTime() - from.getTime()) / MILLISECONDS_PER_DAY;

  if (rangeDays > MAX_ANALYTICS_QUERY_RANGE_DAYS) {
    throw new ValidationError("The analytics range is too long.", [
      {
        field: "from",
        message: `Use a range of at most ${MAX_ANALYTICS_QUERY_RANGE_DAYS} days.`,
      },
    ]);
  }

  return { from, to };
}

function parseTimestampOrThrow(rawValue: string, fieldName: "from" | "to"): Date {
  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ValidationError(`The "${fieldName}" timestamp could not be parsed.`, [
      { field: fieldName, message: "Use a valid ISO-8601 timestamp." },
    ]);
  }

  return parsedDate;
}
