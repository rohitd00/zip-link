const POSTGRES_UNIQUE_VIOLATION_ERROR_CODE = "23505";

/**
 * Checks whether a thrown value is a PostgreSQL "unique_violation" error
 * (SQLSTATE 23505) — for example, a duplicate short code or a duplicate
 * email address hitting a UNIQUE constraint. Shared by every service that
 * needs to turn that specific database error into its own domain-specific
 * "already taken" error, rather than letting a raw database error surface.
 */
export function isPostgresUniqueViolation(thrownError: unknown): boolean {
  if (typeof thrownError !== "object" || thrownError === null) {
    return false;
  }

  const maybeDatabaseError = thrownError as { code?: unknown };
  return maybeDatabaseError.code === POSTGRES_UNIQUE_VIOLATION_ERROR_CODE;
}
