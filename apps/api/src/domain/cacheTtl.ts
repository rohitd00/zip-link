/**
 * Calculates how many seconds a redirect cache entry should live. A
 * non-expiring link uses the configured default TTL. An expiring link uses
 * whichever is smaller: the default TTL, or the time actually remaining
 * until expiry. This guarantees the cache entry can never outlive the
 * link's real expiry, per Rule A-03 in project-rules.md.
 *
 * A non-positive result means "do not cache this" — the caller must check
 * for that before writing to Redis, since a link that has already expired
 * (or expires this instant) must never be cached as active.
 */
export function calculateRedirectCacheTtlSeconds(
  expiresAt: Date | null,
  currentTime: Date,
  defaultTtlSeconds: number,
): number {
  if (expiresAt === null) {
    return defaultTtlSeconds;
  }

  const remainingMilliseconds = expiresAt.getTime() - currentTime.getTime();
  const remainingSeconds = Math.floor(remainingMilliseconds / 1000);

  return Math.min(defaultTtlSeconds, remainingSeconds);
}
