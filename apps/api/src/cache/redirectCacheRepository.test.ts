import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { RedirectCacheRepository } from "./redirectCacheRepository";

const samplePayload = {
  linkId: "123",
  shortCode: "abc",
  longUrl: "https://example.com/page",
  expiresAt: null,
  redirectStatusCode: 302,
};

function buildFakeRedisClient(overrides: Partial<Redis> = {}): Redis {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ...overrides,
  } as unknown as Redis;
}

describe("RedirectCacheRepository", () => {
  it("returns a miss when the key does not exist", async () => {
    const fakeRedisClient = buildFakeRedisClient({ get: vi.fn().mockResolvedValue(null) });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    const result = await repository.getCachedRedirectLink("abc");
    expect(result).toEqual({ outcome: "miss" });
  });

  it("returns a hit with the parsed payload when the stored value matches the expected shape", async () => {
    const fakeRedisClient = buildFakeRedisClient({
      get: vi.fn().mockResolvedValue(JSON.stringify(samplePayload)),
    });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    const result = await repository.getCachedRedirectLink("abc");
    expect(result).toEqual({ outcome: "hit", payload: samplePayload });
  });

  it("treats invalid JSON as a miss instead of throwing", async () => {
    const fakeRedisClient = buildFakeRedisClient({
      get: vi.fn().mockResolvedValue("not valid json"),
    });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    const result = await repository.getCachedRedirectLink("abc");
    expect(result).toEqual({ outcome: "miss" });
  });

  it("treats a value with the wrong shape as a miss instead of throwing", async () => {
    const fakeRedisClient = buildFakeRedisClient({
      get: vi.fn().mockResolvedValue(JSON.stringify({ unexpected: "shape" })),
    });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    const result = await repository.getCachedRedirectLink("abc");
    expect(result).toEqual({ outcome: "miss" });
  });

  it("returns an error outcome instead of throwing when the Redis read fails", async () => {
    const fakeRedisClient = buildFakeRedisClient({
      get: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    const result = await repository.getCachedRedirectLink("abc");
    expect(result).toEqual({ outcome: "error" });
  });

  it("does not throw when a cache write fails", async () => {
    const fakeRedisClient = buildFakeRedisClient({
      set: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    await expect(repository.setCachedRedirectLink(samplePayload, 60)).resolves.toBeUndefined();
  });

  it("does not write to Redis when the computed TTL is not positive", async () => {
    const setSpy = vi.fn();
    const fakeRedisClient = buildFakeRedisClient({ set: setSpy });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    await repository.setCachedRedirectLink(samplePayload, 0);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("does not throw when a cache delete fails", async () => {
    const fakeRedisClient = buildFakeRedisClient({
      del: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    const repository = new RedirectCacheRepository(fakeRedisClient);

    await expect(repository.deleteCachedRedirectLink("abc")).resolves.toBeUndefined();
  });
});
