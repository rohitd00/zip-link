import type { LinkDatabaseRow } from "@shared/contracts/link";
import { describe, expect, it, vi } from "vitest";
import { ServiceUnavailableError } from "../domain/applicationErrors";
import type { RedirectCacheRepository } from "../cache/redirectCacheRepository";
import type { LinkRepository } from "../repositories/linkRepository";
import { RedirectService } from "./redirectService";

const DEFAULT_CACHE_TTL_SECONDS = 300;

const sampleLinkRow: LinkDatabaseRow = {
  id: "1",
  shortCode: "abc",
  longUrl: "https://example.com/page",
  normalizedLongUrl: "https://example.com/page",
  ownerType: "anonymous_session",
  ownerId: "owner-1",
  redirectStatusCode: 302,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: null,
  deletedAt: null,
  isCustomAlias: false,
};

function buildFakeLinkRepository(overrides: Partial<LinkRepository> = {}): LinkRepository {
  return {
    findPublicLinkByShortCode: vi.fn(),
    ...overrides,
  } as unknown as LinkRepository;
}

function buildFakeCacheRepository(
  overrides: Partial<RedirectCacheRepository> = {},
): RedirectCacheRepository {
  return {
    getCachedRedirectLink: vi.fn().mockResolvedValue({ outcome: "miss" }),
    setCachedRedirectLink: vi.fn().mockResolvedValue(undefined),
    deleteCachedRedirectLink: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RedirectCacheRepository;
}

describe("RedirectService", () => {
  it("falls back to the database and still redirects when the cache read errors", async () => {
    const linkRepository = buildFakeLinkRepository({
      findPublicLinkByShortCode: vi.fn().mockResolvedValue(sampleLinkRow),
    });
    const cacheRepository = buildFakeCacheRepository({
      getCachedRedirectLink: vi.fn().mockResolvedValue({ outcome: "error" }),
    });
    const service = new RedirectService(linkRepository, cacheRepository, DEFAULT_CACHE_TTL_SECONDS);

    const result = await service.resolveShortCode("abc", new Date("2026-01-02T00:00:00.000Z"));

    expect(result).toEqual({
      outcome: "redirect",
      linkId: "1",
      destinationUrl: "https://example.com/page",
      redirectStatusCode: 302,
      cacheResult: "error",
    });
  });

  it("throws a controlled ServiceUnavailableError, not an unsafe redirect, when the database fails on a cache miss", async () => {
    const linkRepository = buildFakeLinkRepository({
      findPublicLinkByShortCode: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    const cacheRepository = buildFakeCacheRepository();
    const service = new RedirectService(linkRepository, cacheRepository, DEFAULT_CACHE_TTL_SECONDS);

    await expect(
      service.resolveShortCode("abc", new Date("2026-01-02T00:00:00.000Z")),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("reports not_found without touching the database error path when the link simply does not exist", async () => {
    const linkRepository = buildFakeLinkRepository({
      findPublicLinkByShortCode: vi.fn().mockResolvedValue(null),
    });
    const cacheRepository = buildFakeCacheRepository();
    const service = new RedirectService(linkRepository, cacheRepository, DEFAULT_CACHE_TTL_SECONDS);

    const result = await service.resolveShortCode("missing", new Date("2026-01-02T00:00:00.000Z"));

    expect(result).toEqual({ outcome: "not_found", cacheResult: "miss" });
  });
});
