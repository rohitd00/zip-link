import path from "node:path";
import dotenv from "dotenv";
import Redis from "ioredis";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

/**
 * Reads REDIS_TEST_URL: a different logical Redis database (index 1 by
 * default) on the same server as REDIS_URL, so running the automated test
 * suite can never collide with a locally running dev server's cache
 * entries, rate-limit counters, or queued jobs.
 */
export function createTestRedisConnectionString(): string {
  const redisTestUrl = process.env.REDIS_TEST_URL;

  if (redisTestUrl === undefined || redisTestUrl.trim().length === 0) {
    throw new Error(
      "REDIS_TEST_URL is not set. Add it to the repository .env file before running integration tests.",
    );
  }

  return redisTestUrl;
}

export function createTestRedisClient(): Redis {
  return new Redis(createTestRedisConnectionString());
}

/**
 * Clears every key in the test Redis database between tests. A blanket
 * FLUSHDB would be exactly the kind of unscoped, destructive operation
 * Rule R-01 and Rule G-03 forbid against a shared or production Redis —
 * but this client only ever connects to REDIS_TEST_URL's own isolated
 * logical database (index 1), which nothing else uses. Flushing that one
 * dedicated test database is scoped and safe, and — unlike maintaining a
 * list of known key prefixes by hand — it automatically stays correct as
 * new prefixes (rate limiting, and BullMQ's own queue keyspace) are added.
 */
export async function clearTestCacheKeys(redisClient: Redis): Promise<void> {
  await redisClient.flushdb();
}
