import Redis from "ioredis";
import { logger } from "../observability/logger";

const COMMAND_TIMEOUT_MILLISECONDS = 1000;

/**
 * Creates the single Redis connection used for the redirect cache and the
 * creation rate limiter. Commands time out quickly (1 second) so that a
 * stuck or unreachable Redis can never hold up a redirect for long; every
 * caller of this client must already be prepared to treat a failed or slow
 * command as "Redis is unavailable right now" rather than crash.
 */
export function createRedisClient(redisConnectionString: string): Redis {
  const redisClient = new Redis(redisConnectionString, {
    maxRetriesPerRequest: 1,
    commandTimeout: COMMAND_TIMEOUT_MILLISECONDS,
  });

  redisClient.on("error", (redisError) => {
    logger.error("Unexpected Redis client error.", { message: redisError.message });
  });

  return redisClient;
}
