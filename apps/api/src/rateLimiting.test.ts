import type { Redis } from "ioredis";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app";
import { createTestDatabasePool, truncateAllTestData } from "./testSupport/testDatabasePool";
import { clearTestCacheKeys, createTestRedisClient } from "./testSupport/testRedisClient";
import { createTestClickEventQueue, type TestClickEventQueue } from "./testSupport/testQueue";

let pool: Pool;
let redisClient: Redis;
let testQueue: TestClickEventQueue;
let app: ReturnType<typeof buildApiApp>;

beforeAll(() => {
  pool = createTestDatabasePool();
  redisClient = createTestRedisClient();
  testQueue = createTestClickEventQueue();
  app = buildApiApp({
    databasePool: pool,
    redisClient,
    clickEventQueue: testQueue.queue,
    publicBaseUrl: "https://sho.rt",
    ownerCookieSecret: "test-owner-cookie-secret",
    redirectCacheTtlSeconds: 86400,
    createRateLimitMaxRequests: 2,
    createRateLimitWindowSeconds: 60,
    isProductionEnvironment: false,
  });
});

afterEach(async () => {
  await truncateAllTestData(pool);
  await clearTestCacheKeys(redisClient);
});

afterAll(async () => {
  await pool.end();
  await redisClient.quit();
  await testQueue.queue.close();
  await testQueue.connection.quit();
});

describe("POST /api/links rate limiting", () => {
  it("rejects creation once the same owner exceeds the configured limit", async () => {
    const firstResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/one" });
    const setCookieHeader = firstResponse.headers["set-cookie"] as unknown as string[];
    const ownerCookie = setCookieHeader[0];

    if (ownerCookie === undefined) {
      throw new Error("Expected the API to set an owner-context cookie on link creation.");
    }

    const secondResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/two" });

    const thirdResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/three" });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(thirdResponse.status).toBe(429);
    expect(thirdResponse.body.error.code).toBe("RATE_LIMITED");
    expect(thirdResponse.headers["retry-after"]).toBeDefined();
  });

  it("does not rate-limit the public redirect route", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/popular" });
    const shortCode = createResponse.body.data.shortCode as string;

    // Visit the same link many more times than the tiny creation limit
    // allows; every visit must still succeed, because redirects are never
    // constrained by the creation rate limit (Rule R-04).
    for (let visitNumber = 0; visitNumber < 5; visitNumber += 1) {
      const redirectResponse = await request(app).get(`/${shortCode}`);
      expect(redirectResponse.status).toBe(302);
    }
  });
});
