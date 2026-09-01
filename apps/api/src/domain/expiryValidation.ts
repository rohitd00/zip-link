import { ValidationError } from "./applicationErrors";

/**
 * Parses and validates an optional expiry timestamp submitted at link
 * creation. Returns null when no expiry was requested. Throws a
 * ValidationError when the value cannot be parsed or is not in the future.
 */
export function validateFutureExpiryTimestamp(
  rawExpiresAt: string | undefined,
  currentTime: Date,
): Date | null {
  if (rawExpiresAt === undefined) {
    return null;
  }

  const trimmedValue = rawExpiresAt.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const parsedExpiresAt = new Date(trimmedValue);
  const isUnparsableDate = Number.isNaN(parsedExpiresAt.getTime());

  if (isUnparsableDate) {
    throw new ValidationError("The expiry timestamp could not be parsed.", [
      { field: "expiresAt", message: "Use a valid ISO-8601 timestamp." },
    ]);
  }

  const isInThePast = parsedExpiresAt.getTime() <= currentTime.getTime();

  if (isInThePast) {
    throw new ValidationError("The expiry timestamp must be in the future.", [
      { field: "expiresAt", message: "Choose a time later than now." },
    ]);
  }

  return parsedExpiresAt;
}
