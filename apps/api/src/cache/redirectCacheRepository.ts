import type Redis from "ioredis";
import { z } from "zod";
import type { RedirectCachePayload } from "@shared/contracts/redirectCache";
import { logger } from "../observability/logger";
import { buildRedirectCacheKey } from "./cacheKeys";

// Redis contents are treated as untrusted, serialized data. A record that
// does not match this exact shape is discarded rather than trusted, per
// Rule R-02 in project-rules.md.
const redirectCachePayloadSchema = z.object({
  linkId: z.string(),
  shortCode: z.string(),
  longUrl: z.string(),
  expiresAt: z.string().nullable(),
  redirectStatusCode: z.number(),
});

export type RedirectCacheReadResult =
  { outcome: "hit"; payload: RedirectCachePayload } | { outcome: "miss" } | { outcome: "error" };

/**
 * Reads and writes redirect cache entries. Every method here catches its
 * own Redis errors and never throws: a cache failure must always be
 * treated as "fall back to the database," never as a request failure, per
 * Rule A-02 in project-rules.md.
 */
export class RedirectCacheRepository {
  constructor(private readonly redisClient: Redis) {}

  async getCachedRedirectLink(shortCode: string): Promise<RedirectCacheReadResult> {
    try {
      const rawValue = await this.redisClient.get(buildRedirectCacheKey(shortCode));

      if (rawValue === null) {
        return { outcome: "miss" };
      }

      return this.parseStoredPayload(shortCode, rawValue);
    } catch (thrownError) {
      logger.error("Redis read failed while resolving a redirect; falling back to the database.", {
        errorMessage: getErrorMessage(thrownError),
      });
      return { outcome: "error" };
    }
  }

  async setCachedRedirectLink(payload: RedirectCachePayload, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }

    try {
      await this.redisClient.set(
        buildRedirectCacheKey(payload.shortCode),
        JSON.stringify(payload),
        "EX",
        ttlSeconds,
      );
    } catch (thrownError) {
      logger.error(
        "Redis write failed while caching a redirect. The redirect itself is unaffected.",
        { errorMessage: getErrorMessage(thrownError) },
      );
    }
  }

  async deleteCachedRedirectLink(shortCode: string): Promise<void> {
    try {
      await this.redisClient.del(buildRedirectCacheKey(shortCode));
    } catch (thrownError) {
      logger.error("Redis delete failed while invalidating a redirect cache entry.", {
        errorMessage: getErrorMessage(thrownError),
      });
    }
  }

  private parseStoredPayload(shortCode: string, rawValue: string): RedirectCacheReadResult {
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(rawValue);
    } catch {
      logger.warn("Discarding a redirect cache entry that was not valid JSON.", { shortCode });
      return { outcome: "miss" };
    }

    const parseResult = redirectCachePayloadSchema.safeParse(parsedJson);

    if (!parseResult.success) {
      logger.warn("Discarding a redirect cache entry with an unexpected shape.", { shortCode });
      return { outcome: "miss" };
    }

    return { outcome: "hit", payload: parseResult.data };
  }
}

function getErrorMessage(thrownError: unknown): string {
  return thrownError instanceof Error ? thrownError.message : "Unknown error";
}
