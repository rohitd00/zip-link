// Every Redis key this project writes goes through one of these two
// functions. Keeping the prefixes in one place makes it obvious that the
// redirect cache and the rate limiter never share a keyspace, and that
// neither one collides with BullMQ's own key pattern once the queue is
// added in a later phase. See Rule R-01 in project-rules.md.

export function buildRedirectCacheKey(shortCode: string): string {
  return `redirect:link:${shortCode}`;
}

export function buildCreationRateLimitKey(ownerType: string, ownerId: string): string {
  return `rate-limit:create:${ownerType}:${ownerId}`;
}
