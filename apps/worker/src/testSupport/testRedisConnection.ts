import path from "node:path";
import dotenv from "dotenv";
import Redis from "ioredis";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

/**
 * A BullMQ-compatible test connection (maxRetriesPerRequest: null) pointed
 * at REDIS_TEST_URL's isolated logical database, matching
 * apps/api/src/testSupport/testRedisClient.ts.
 */
export function createTestQueueRedisConnection(): Redis {
  const redisTestUrl = process.env.REDIS_TEST_URL;

  if (redisTestUrl === undefined || redisTestUrl.trim().length === 0) {
    throw new Error(
      "REDIS_TEST_URL is not set. Add it to the repository .env file before running integration tests.",
    );
  }

  return new Redis(redisTestUrl, { maxRetriesPerRequest: null });
}
