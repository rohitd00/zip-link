import type Redis from "ioredis";
import type { OwnerContext } from "@shared/contracts/ownerContext";
import { logger } from "../observability/logger";
import { buildAuthRateLimitKey } from "./cacheKeys";

export type RateLimitCheckResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * The same fixed-window (INCR + EXPIRE) approach as CreationRateLimiter,
 * kept as its own small class with its own Redis keyspace
 * (`buildAuthRateLimitKey`, not `buildCreationRateLimitKey`) rather than
 * generalizing the existing, already-tested link-creation rate limiter —
 * duplicating this little logic is cheaper than risking a shared-and-now-
 * more-complicated rate limiter class. Applied to login and signup, since
 * both are natural brute-force/spam targets for a publicly reachable
 * endpoint with no CAPTCHA. Fails open on a Redis outage, same reasoning
 * as CreationRateLimiter: abuse prevention is secondary to staying usable.
 */
export class AuthRateLimiter {
  constructor(
    private readonly redisClient: Redis,
    private readonly maxRequestsPerWindow: number,
    private readonly windowSeconds: number,
  ) {}

  async checkAndConsume(ownerContext: OwnerContext): Promise<RateLimitCheckResult> {
    const rateLimitKey = buildAuthRateLimitKey(ownerContext.ownerType, ownerContext.ownerId);

    try {
      const requestCountThisWindow = await this.redisClient.incr(rateLimitKey);
      const isFirstRequestInThisWindow = requestCountThisWindow === 1;

      if (isFirstRequestInThisWindow) {
        await this.redisClient.expire(rateLimitKey, this.windowSeconds);
      }

      const hasExceededLimit = requestCountThisWindow > this.maxRequestsPerWindow;

      if (!hasExceededLimit) {
        return { allowed: true };
      }

      const remainingWindowSeconds = await this.redisClient.ttl(rateLimitKey);

      return {
        allowed: false,
        retryAfterSeconds: remainingWindowSeconds > 0 ? remainingWindowSeconds : this.windowSeconds,
      };
    } catch (thrownError) {
      logger.error("Redis auth rate-limit check failed; allowing the request through.", {
        errorMessage: thrownError instanceof Error ? thrownError.message : "Unknown error",
      });
      return { allowed: true };
    }
  }
}
