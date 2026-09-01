// A short code is either a generated base62 value or a custom alias, so its
// character set is the union of both: letters, digits, hyphens, and
// underscores. This check runs before any database lookup so an obviously
// invalid code (too long, wrong characters) never reaches PostgreSQL.
const SHORT_CODE_SHAPE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isPlausibleShortCodeShape(candidateCode: string): boolean {
  return SHORT_CODE_SHAPE_PATTERN.test(candidateCode);
}
