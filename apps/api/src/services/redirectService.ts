import { evaluateLinkLifecycleState } from "../domain/linkState";
import type { LinkRepository } from "../repositories/linkRepository";

export type RedirectResolution =
  | { outcome: "redirect"; destinationUrl: string; redirectStatusCode: number }
  | { outcome: "expired" }
  | { outcome: "not_found" };

/**
 * Resolves a public short code to a redirect decision using PostgreSQL
 * only. Redis caching is added in a later phase on top of this same
 * lookup; this service does not know about the cache at all, which keeps
 * the "database is always correct, cache is only an optimization" rule
 * easy to verify.
 */
export class RedirectService {
  constructor(private readonly linkRepository: LinkRepository) {}

  async resolveShortCode(shortCode: string, currentTime: Date): Promise<RedirectResolution> {
    const link = await this.linkRepository.findPublicLinkByShortCode(shortCode);

    if (link === null) {
      return { outcome: "not_found" };
    }

    const lifecycleState = evaluateLinkLifecycleState(link, currentTime);

    if (lifecycleState === "expired") {
      return { outcome: "expired" };
    }

    return {
      outcome: "redirect",
      destinationUrl: link.longUrl,
      redirectStatusCode: link.redirectStatusCode,
    };
  }
}
