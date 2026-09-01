import path from "node:path";
import dotenv from "dotenv";
import Redis from "ioredis";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

export function createTestRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl === undefined || redisUrl.trim().length === 0) {
    throw new Error(
      "REDIS_URL is not set. Add it to the repository .env file before running integration tests.",
    );
  }

  return new Redis(redisUrl);
}

const PROJECT_KEY_PREFIXES = ["redirect:link:", "rate-limit:create:"];

/**
 * Removes only the keys this project's own prefixes own. This intentionally
 * never uses FLUSHALL/FLUSHDB, even in tests: a broad flush is exactly the
 * kind of destructive, unscoped operation Rule R-01 and Rule G-03 forbid,
 * and it would also be wrong once BullMQ starts sharing this same Redis
 * instance in a later phase.
 */
export async function clearTestCacheKeys(redisClient: Redis): Promise<void> {
  for (const prefix of PROJECT_KEY_PREFIXES) {
    let cursor = "0";

    do {
      const [nextCursor, matchedKeys] = await redisClient.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        "100",
      );
      cursor = nextCursor;

      if (matchedKeys.length > 0) {
        await redisClient.del(...matchedKeys);
      }
    } while (cursor !== "0");
  }
}
