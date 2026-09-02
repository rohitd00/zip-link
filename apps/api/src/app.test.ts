import type { Redis } from "ioredis";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app";
import {
  createTestDatabasePool,
  insertTestClickEvent,
  truncateAllTestData,
} from "./testSupport/testDatabasePool";
import { clearTestCacheKeys, createTestRedisClient } from "./testSupport/testRedisClient";
import { createTestClickEventQueue, type TestClickEventQueue } from "./testSupport/testQueue";
import { RollupCheckpointRepository } from "./repositories/rollupCheckpointRepository";
import { RollupRepository } from "./repositories/rollupRepository";
import { RollupService } from "./services/rollupService";

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
    // A generous limit here: this file exercises general API correctness,
    // not rate limiting specifically (see creationRateLimiter.test.ts for
    // that), so it must not fail because it happens to send more than a
    // realistic number of creation requests for one owner.
    createRateLimitMaxRequests: 1000,
    createRateLimitWindowSeconds: 900,
    authRateLimitMaxRequests: 1000,
    authRateLimitWindowSeconds: 900,
    isProductionEnvironment: false,
    trustProxyHops: 0,
    dashboardBaseUrl: "https://dashboard.test",
    googleOAuthClientId: null,
    googleOAuthClientSecret: null,
    resendApiKey: null,
    emailFromAddress: "ZipLink <test@ziplink.test>",
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

/**
 * Creates a link and returns both the response body and the signed
 * owner-context cookie the server set, so later requests in the same test
 * can act as the same owner.
 */
async function createLinkAndCaptureOwnerCookie(longUrl: string) {
  const response = await request(app).post("/api/links").send({ longUrl });
  const setCookieHeader = response.headers["set-cookie"] as unknown as string[];
  const ownerCookie = setCookieHeader[0];

  if (ownerCookie === undefined) {
    throw new Error("Expected the API to set an owner-context cookie on link creation.");
  }

  return { response, ownerCookie };
}

describe("POST /api/links", () => {
  it("creates a generated-code link and returns 201", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/articles/launch" });

    expect(response.status).toBe(201);
    expect(response.body.data.shortCode).toMatch(/^[0-9a-zA-Z]+$/);
    expect(response.body.data.longUrl).toBe("https://example.com/articles/launch");
    expect(response.body.data.wasExistingDuplicate).toBe(false);
  });

  it("creates a custom alias link using the exact requested alias", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/signup", customAlias: "join-now" });

    expect(response.status).toBe(201);
    expect(response.body.data.shortCode).toBe("join-now");
  });

  it("rejects an unsupported protocol with a 400 field error", async () => {
    const response = await request(app).post("/api/links").send({ longUrl: "javascript:alert(1)" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details[0].field).toBe("longUrl");
  });

  it("rejects a reserved custom alias", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/page", customAlias: "admin" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when the requested custom alias is already taken", async () => {
    await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/first", customAlias: "taken-alias" });

    const secondResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/second", customAlias: "taken-alias" });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error.code).toBe("ALIAS_UNAVAILABLE");
  });

  it("returns the existing link with 200 when the same owner submits a known duplicate", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie("https://example.com/repeat");

    const secondResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/repeat" });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data.wasExistingDuplicate).toBe(true);
  });

  it("does not treat a different owner's identical URL as a duplicate", async () => {
    await request(app).post("/api/links").send({ longUrl: "https://example.com/not-shared" });

    const secondOwnerResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/not-shared" });

    expect(secondOwnerResponse.status).toBe(201);
  });

  it("rejects a past expiry timestamp", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/page", expiresAt: "2000-01-01T00:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe("expiresAt");
  });
});

describe("GET /:code (public redirect)", () => {
  it("redirects an active link to its stored destination", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/target" });

    const shortCode = createResponse.body.data.shortCode;
    const redirectResponse = await request(app).get(`/${shortCode}`);

    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.location).toBe("https://example.com/target");
  });

  it("returns 404 for an unknown code", async () => {
    const response = await request(app).get("/does-not-exist");
    expect(response.status).toBe(404);
  });

  it("returns 404 JSON when the client explicitly requests JSON", async () => {
    const response = await request(app).get("/does-not-exist").set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 410 for an expired link and does not redirect", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/soon-expired",
    );
    // Directly craft a link that already expired, since the API itself
    // refuses to create one with a past expiry. This simulates the passage
    // of time for a link that used to be valid.
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({
        longUrl: "https://example.com/will-expire",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      });

    const shortCode = createResponse.body.data.shortCode;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const redirectResponse = await request(app).get(`/${shortCode}`);
    expect(redirectResponse.status).toBe(410);
  });

  it("returns 404 after the owner deletes the link", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie("https://example.com/to-delete");
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/deletion-target" });

    const shortCode = createResponse.body.data.shortCode;

    await request(app).delete(`/api/links/${shortCode}`).set("Cookie", ownerCookie).expect(204);

    const redirectResponse = await request(app).get(`/${shortCode}`);
    expect(redirectResponse.status).toBe(404);
  });
});

describe("GET /api/links", () => {
  it("lists only the requesting owner's links", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie("https://example.com/mine-1");
    await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/mine-2" });
    await request(app).post("/api/links").send({ longUrl: "https://example.com/not-mine" });

    const response = await request(app).get("/api/links").set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });
});

describe("GET /api/links/:code and DELETE /api/links/:code ownership", () => {
  it("returns a generic 404 when reading another owner's link", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/private" });

    const response = await request(app).get(`/api/links/${createResponse.body.data.shortCode}`);

    expect(response.status).toBe(404);
  });

  it("returns a generic 404 when deleting another owner's link", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/private-delete" });

    const response = await request(app).delete(`/api/links/${createResponse.body.data.shortCode}`);

    expect(response.status).toBe(404);
  });
});

describe("GET /health/live and /health/ready", () => {
  it("reports ok for both endpoints", async () => {
    const liveResponse = await request(app).get("/health/live");
    const readyResponse = await request(app).get("/health/ready");

    expect(liveResponse.status).toBe(200);
    expect(readyResponse.status).toBe(200);
    expect(readyResponse.body.dependencies.database).toBe("ok");
    expect(readyResponse.body.dependencies.cache).toBe("ok");
  });
});

describe("GET /metrics", () => {
  it("reports uptime and click-analytics queue depth counts", async () => {
    const response = await request(app).get("/metrics");

    expect(response.status).toBe(200);
    expect(typeof response.body.uptimeSeconds).toBe("number");
    expect(response.body.clickEventQueue).toMatchObject({
      waitingJobs: expect.any(Number),
      activeJobs: expect.any(Number),
      delayedJobs: expect.any(Number),
      failedJobs: expect.any(Number),
      completedJobs: expect.any(Number),
    });
  });
});

describe("Redis cache-aside redirect behavior", () => {
  it("populates the cache on creation and serves a redirect from it even if the database row is gone", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/cache-write-through" });

    const shortCode = createResponse.body.data.shortCode as string;

    const cachedValueAfterCreate = await redisClient.get(`redirect:link:${shortCode}`);
    expect(cachedValueAfterCreate).not.toBeNull();

    // Remove the row directly from PostgreSQL, bypassing the API. If the
    // next redirect still succeeds, it can only have come from the cache.
    await pool.query("DELETE FROM links WHERE short_code = $1", [shortCode]);

    const redirectResponse = await request(app).get(`/${shortCode}`);
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.location).toBe("https://example.com/cache-write-through");
  });

  it("backfills the cache on a cache miss so the next request would be a hit", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/cache-miss-backfill" });

    const shortCode = createResponse.body.data.shortCode as string;

    // The link was just created, which already wrote it to the cache.
    // Delete that cache entry so this test starts from a genuine miss.
    await redisClient.del(`redirect:link:${shortCode}`);

    const firstRedirectResponse = await request(app).get(`/${shortCode}`);
    expect(firstRedirectResponse.status).toBe(302);

    const cachedValueAfterMiss = await redisClient.get(`redirect:link:${shortCode}`);
    expect(cachedValueAfterMiss).not.toBeNull();
  });

  it("never sets a cache TTL longer than the link's remaining lifetime", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({
        longUrl: "https://example.com/short-lived",
        expiresAt: new Date(Date.now() + 5000).toISOString(),
      });

    const shortCode = createResponse.body.data.shortCode as string;
    const cacheTtlSeconds = await redisClient.ttl(`redirect:link:${shortCode}`);

    // The configured default TTL in these tests is 86400 seconds, so a TTL
    // anywhere near that would mean the link's real expiry was ignored.
    expect(cacheTtlSeconds).toBeGreaterThan(0);
    expect(cacheTtlSeconds).toBeLessThanOrEqual(5);
  });

  it("treats a malformed cache entry as a miss and still redirects correctly", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/malformed-cache" });

    const shortCode = createResponse.body.data.shortCode as string;

    await redisClient.set(`redirect:link:${shortCode}`, "{ this is not valid JSON");

    const redirectResponse = await request(app).get(`/${shortCode}`);
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.location).toBe("https://example.com/malformed-cache");
  });

  it("removes the cache entry when the owner deletes the link", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/owner-for-delete",
    );
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/cache-invalidate-on-delete" });

    const shortCode = createResponse.body.data.shortCode as string;
    expect(await redisClient.get(`redirect:link:${shortCode}`)).not.toBeNull();

    await request(app).delete(`/api/links/${shortCode}`).set("Cookie", ownerCookie).expect(204);

    expect(await redisClient.get(`redirect:link:${shortCode}`)).toBeNull();
  });
});

describe("GET /api/links/:code/analytics", () => {
  it("returns a generic 404 for a link the requester does not own", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/analytics-private" });

    const response = await request(app).get(
      `/api/links/${createResponse.body.data.shortCode}/analytics`,
    );

    expect(response.status).toBe(404);
  });

  it("returns a generic 404 for an unknown code", async () => {
    const response = await request(app).get("/api/links/does-not-exist/analytics");
    expect(response.status).toBe(404);
  });

  it("returns totals, timeline, and breakdowns for an owned link with seeded events", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/analytics-a",
    );
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/analytics-target" });

    const shortCode = createResponse.body.data.shortCode as string;
    const linkId = createResponse.body.data.id as string;

    await insertTestClickEvent(pool, {
      linkId,
      shortCode,
      occurredAt: new Date(),
      referrerHost: "news.example.com",
      deviceType: "mobile",
      browserName: "Chrome",
      countryCode: "US",
      countryName: "United States",
      cityName: "Chicago",
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode,
      occurredAt: new Date(),
      referrerHost: null,
      deviceType: "desktop",
      browserName: "Firefox",
      countryCode: "IN",
      countryName: "India",
      cityName: null,
    });

    const response = await request(app)
      .get(`/api/links/${shortCode}/analytics`)
      .set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.totalClicks).toBe(2);
    expect(response.body.data.link.shortCode).toBe(shortCode);
    // The default range is 30 days, which is longer than the hour/day
    // switchover point (48 hours), so day buckets are expected here.
    expect(response.body.data.range.bucket).toBe("day");
    expect(response.body.data.referrers).toContainEqual({
      name: "news.example.com",
      clickCount: 1,
    });
    expect(response.body.data.referrers).toContainEqual({
      name: "Direct / unknown",
      clickCount: 1,
    });
    expect(response.body.data.devices).toContainEqual({ name: "mobile", clickCount: 1 });
    expect(response.body.data.freshness.isEventuallyConsistent).toBe(true);
  });

  it("reports lastRollupAt as null until a rollup has actually run, then reflects it", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/rollup-freshness",
    );
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/rollup-freshness" });
    const shortCode = createResponse.body.data.shortCode as string;

    const beforeResponse = await request(app)
      .get(`/api/links/${shortCode}/analytics`)
      .set("Cookie", ownerCookie);
    expect(beforeResponse.body.data.freshness.lastRollupAt).toBeNull();

    const rollupService = new RollupService(
      new RollupRepository(pool),
      new RollupCheckpointRepository(pool),
    );
    await rollupService.runHourlyTimeRollup(new Date());

    const afterResponse = await request(app)
      .get(`/api/links/${shortCode}/analytics`)
      .set("Cookie", ownerCookie);
    expect(afterResponse.body.data.freshness.lastRollupAt).not.toBeNull();
    expect(new Date(afterResponse.body.data.freshness.lastRollupAt).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("returns an explicit zero result for a link with no clicks in range", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/analytics-b",
    );
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/no-clicks" });

    const response = await request(app)
      .get(`/api/links/${createResponse.body.data.shortCode}/analytics`)
      .set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.totalClicks).toBe(0);
    expect(response.body.data.timeline).toEqual([]);
  });

  it("applies the requested date range and rejects an invalid one", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/analytics-c",
    );
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/range-target" });

    const shortCode = createResponse.body.data.shortCode as string;

    const invalidRangeResponse = await request(app)
      .get(
        `/api/links/${shortCode}/analytics?from=2026-09-05T00:00:00.000Z&to=2026-09-01T00:00:00.000Z`,
      )
      .set("Cookie", ownerCookie);

    expect(invalidRangeResponse.status).toBe(400);
    expect(invalidRangeResponse.body.error.code).toBe("VALIDATION_ERROR");

    const validRangeResponse = await request(app)
      .get(
        `/api/links/${shortCode}/analytics?from=2026-01-01T00:00:00.000Z&to=2026-01-31T00:00:00.000Z`,
      )
      .set("Cookie", ownerCookie);

    expect(validRangeResponse.status).toBe(200);
    expect(validRangeResponse.body.data.range.from).toBe("2026-01-01T00:00:00.000Z");
    expect(validRangeResponse.body.data.range.to).toBe("2026-01-31T00:00:00.000Z");
  });

  it("suppresses a low-volume city into its country in the response", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/analytics-d",
    );
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/privacy-target" });

    const shortCode = createResponse.body.data.shortCode as string;
    const linkId = createResponse.body.data.id as string;

    await insertTestClickEvent(pool, {
      linkId,
      shortCode,
      occurredAt: new Date(),
      countryCode: "US",
      countryName: "United States",
      cityName: "Peoria",
    });

    const response = await request(app)
      .get(`/api/links/${shortCode}/analytics`)
      .set("Cookie", ownerCookie);

    expect(response.body.data.geography).toEqual([
      { country: "United States", city: null, clickCount: 1 },
    ]);
  });
});
