import type Redis from "ioredis";
import type { OwnerContext } from "@shared/contracts/ownerContext";
import { logger } from "../observability/logger";
import { buildCreationRateLimitKey } from "./cacheKeys";

export type RateLimitCheckResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Limits how many link-creation requests one owner can make in a rolling
 * window. This uses a fixed-window counter (INCR + EXPIRE) rather than a
 * true sliding window: it is simpler to read and test, and the small
 * inaccuracy at window boundaries (a burst spanning two windows could
 * briefly exceed the limit) is an acceptable trade-off for an abuse
 * control that only needs to be roughly right, not exact.
 */
export class CreationRateLimiter {
  constructor(
    private readonly redisClient: Redis,
    private readonly maxRequestsPerWindow: number,
    private readonly windowSeconds: number,
  ) {}

  async checkAndConsume(ownerContext: OwnerContext): Promise<RateLimitCheckResult> {
    const rateLimitKey = buildCreationRateLimitKey(ownerContext.ownerType, ownerContext.ownerId);

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
      // Redis being unavailable should not block legitimate link creation.
      // Abuse prevention is a secondary concern to keeping the product
      // usable, so a rate-limit check failure fails open.
      logger.error("Redis rate-limit check failed; allowing the request through.", {
        errorMessage: thrownError instanceof Error ? thrownError.message : "Unknown error",
      });
      return { allowed: true };
    }
  }
}
