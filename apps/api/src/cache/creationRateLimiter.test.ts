import type { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { OwnerContext } from "@shared/contracts/ownerContext";
import { clearTestCacheKeys, createTestRedisClient } from "../testSupport/testRedisClient";
import { CreationRateLimiter } from "./creationRateLimiter";

let redisClient: Redis;

beforeAll(() => {
  redisClient = createTestRedisClient();
});

afterEach(async () => {
  await clearTestCacheKeys(redisClient);
});

afterAll(async () => {
  await redisClient.quit();
});

function buildOwner(ownerId: string): OwnerContext {
  return { ownerType: "anonymous_session", ownerId };
}

describe("CreationRateLimiter", () => {
  it("allows requests up to the configured maximum", async () => {
    const limiter = new CreationRateLimiter(redisClient, 3, 60);
    const owner = buildOwner("owner-allow-up-to-max");

    const results = await Promise.all([
      limiter.checkAndConsume(owner),
      limiter.checkAndConsume(owner),
      limiter.checkAndConsume(owner),
    ]);

    expect(results.every((result) => result.allowed)).toBe(true);
  });

  it("rejects a request once the maximum has already been reached", async () => {
    const limiter = new CreationRateLimiter(redisClient, 2, 60);
    const owner = buildOwner("owner-reject-over-max");

    await limiter.checkAndConsume(owner);
    await limiter.checkAndConsume(owner);
    const thirdResult = await limiter.checkAndConsume(owner);

    expect(thirdResult.allowed).toBe(false);
    if (!thirdResult.allowed) {
      expect(thirdResult.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("tracks each owner independently", async () => {
    const limiter = new CreationRateLimiter(redisClient, 1, 60);
    const firstOwner = buildOwner("owner-independent-a");
    const secondOwner = buildOwner("owner-independent-b");

    const firstOwnerResult = await limiter.checkAndConsume(firstOwner);
    const secondOwnerResult = await limiter.checkAndConsume(secondOwner);

    expect(firstOwnerResult.allowed).toBe(true);
    expect(secondOwnerResult.allowed).toBe(true);
  });

  it("resets the count after the window expires", async () => {
    const limiter = new CreationRateLimiter(redisClient, 1, 1);
    const owner = buildOwner("owner-window-reset");

    const firstResult = await limiter.checkAndConsume(owner);
    const secondResult = await limiter.checkAndConsume(owner);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const thirdResult = await limiter.checkAndConsume(owner);

    expect(firstResult.allowed).toBe(true);
    expect(secondResult.allowed).toBe(false);
    expect(thirdResult.allowed).toBe(true);
  });
});
