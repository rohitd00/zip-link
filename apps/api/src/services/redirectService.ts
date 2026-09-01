import type { RedirectCachePayload } from "@shared/contracts/redirectCache";
import type { RedirectCacheRepository } from "../cache/redirectCacheRepository";
import { calculateRedirectCacheTtlSeconds } from "../domain/cacheTtl";
import { evaluateLinkLifecycleState, hasLinkReachedExpiry } from "../domain/linkState";
import type { LinkRepository } from "../repositories/linkRepository";

export type CacheReadOutcome = "hit" | "miss" | "error";

export type RedirectResolution =
  | {
      outcome: "redirect";
      linkId: string;
      destinationUrl: string;
      redirectStatusCode: number;
      cacheResult: CacheReadOutcome;
    }
  | { outcome: "expired"; cacheResult: CacheReadOutcome }
  | { outcome: "not_found"; cacheResult: CacheReadOutcome };

/**
 * Resolves a public short code to a redirect decision using a cache-aside
 * strategy: check Redis first, and only query PostgreSQL on a cache miss
 * or a Redis failure. PostgreSQL remains the authoritative source in every
 * case; the cache can only make a correct answer faster, never wrong. See
 * Rule A-03 in project-rules.md.
 */
export class RedirectService {
  constructor(
    private readonly linkRepository: LinkRepository,
    private readonly redirectCacheRepository: RedirectCacheRepository,
    private readonly defaultCacheTtlSeconds: number,
  ) {}

  async resolveShortCode(shortCode: string, currentTime: Date): Promise<RedirectResolution> {
    const cacheRead = await this.redirectCacheRepository.getCachedRedirectLink(shortCode);

    if (cacheRead.outcome === "hit") {
      return this.resolveFromCachedPayload(cacheRead.payload, currentTime);
    }

    return this.resolveFromDatabase(shortCode, currentTime, cacheRead.outcome);
  }

  private async resolveFromCachedPayload(
    payload: RedirectCachePayload,
    currentTime: Date,
  ): Promise<RedirectResolution> {
    const cachedExpiresAt = payload.expiresAt === null ? null : new Date(payload.expiresAt);

    if (hasLinkReachedExpiry(cachedExpiresAt, currentTime)) {
      // The cached record outlived the link's real expiry because its TTL
      // had not fired yet. Bypass it rather than trust it, and remove it
      // so the next visitor does not repeat this same stale check.
      await this.redirectCacheRepository.deleteCachedRedirectLink(payload.shortCode);
      return { outcome: "expired", cacheResult: "hit" };
    }

    return {
      outcome: "redirect",
      linkId: payload.linkId,
      destinationUrl: payload.longUrl,
      redirectStatusCode: payload.redirectStatusCode,
      cacheResult: "hit",
    };
  }

  private async resolveFromDatabase(
    shortCode: string,
    currentTime: Date,
    cacheResult: CacheReadOutcome,
  ): Promise<RedirectResolution> {
    const link = await this.linkRepository.findPublicLinkByShortCode(shortCode);

    if (link === null) {
      return { outcome: "not_found", cacheResult };
    }

    const lifecycleState = evaluateLinkLifecycleState(link, currentTime);

    if (lifecycleState === "expired") {
      return { outcome: "expired", cacheResult };
    }

    const ttlSeconds = calculateRedirectCacheTtlSeconds(
      link.expiresAt,
      currentTime,
      this.defaultCacheTtlSeconds,
    );

    await this.redirectCacheRepository.setCachedRedirectLink(
      {
        linkId: link.id,
        shortCode: link.shortCode,
        longUrl: link.longUrl,
        expiresAt: link.expiresAt === null ? null : link.expiresAt.toISOString(),
        redirectStatusCode: link.redirectStatusCode,
      },
      ttlSeconds,
    );

    return {
      outcome: "redirect",
      linkId: link.id,
      destinationUrl: link.longUrl,
      redirectStatusCode: link.redirectStatusCode,
      cacheResult,
    };
  }
}
