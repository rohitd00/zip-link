import Redis from "ioredis";

/**
 * BullMQ requires its own dedicated Redis connection, separate from the
 * one used for the redirect cache and rate limiter. It also requires
 * `maxRetriesPerRequest: null` on any connection it manages, because it
 * issues blocking commands that a request-style retry/timeout policy (the
 * one used by cache/rate-limit reads) would incorrectly cut off.
 */
export function createQueueRedisConnection(redisConnectionString: string): Redis {
  return new Redis(redisConnectionString, {
    maxRetriesPerRequest: null,
  });
}
