import { ValidationError } from "./applicationErrors";

const DEFAULT_TIMEZONE = "UTC";

/**
 * Validates an IANA timezone name using the JavaScript runtime's own
 * timezone database (no separate dependency needed). Defaults to UTC when
 * none is supplied, matching Section 11.5 of the technical specification.
 */
export function validateTimezone(rawTimezone: string | undefined): string {
  if (rawTimezone === undefined || rawTimezone.trim().length === 0) {
    return DEFAULT_TIMEZONE;
  }

  try {
    // Constructing this formatter throws a RangeError for an unrecognized
    // timezone name; it is otherwise discarded immediately.
    new Intl.DateTimeFormat(undefined, { timeZone: rawTimezone });
    return rawTimezone;
  } catch {
    throw new ValidationError("The timezone could not be recognized.", [
      {
        field: "timezone",
        message: "Use a valid IANA timezone name, for example America/New_York.",
      },
    ]);
  }
}
