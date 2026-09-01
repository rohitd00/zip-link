import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { LinkRepository } from "./linkRepository";
import {
  createTestDatabasePool,
  insertTestClickEvent,
  truncateAllTestData,
} from "../testSupport/testDatabasePool";
import { AnalyticsRepository } from "./analyticsRepository";

let pool: Pool;
let analyticsRepository: AnalyticsRepository;
let linkRepository: LinkRepository;

beforeAll(() => {
  pool = createTestDatabasePool();
  analyticsRepository = new AnalyticsRepository(pool);
  linkRepository = new LinkRepository(pool);
});

afterEach(async () => {
  await truncateAllTestData(pool);
});

afterAll(async () => {
  await pool.end();
});

async function insertLink(shortCode: string): Promise<string> {
  const linkId = await linkRepository.allocateNextLinkId();
  const link = await linkRepository.insertGeneratedLinkWithKnownId(linkId, {
    shortCode,
    longUrl: "https://example.com/page",
    normalizedLongUrl: "https://example.com/page",
    ownerContext: { ownerType: "anonymous_session", ownerId: "test-owner" },
    expiresAt: null,
  });

  return link.id;
}

const from = new Date("2026-09-01T00:00:00.000Z");
const to = new Date("2026-09-03T00:00:00.000Z");

describe("AnalyticsRepository", () => {
  it("counts only events for the given link within the given range", async () => {
    const linkId = await insertLink("aaa");
    const otherLinkId = await insertLink("bbb");

    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-02T12:00:00.000Z"),
    });
    // Outside the range (but still within a month that has a partition):
    // must not be counted.
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-05T12:00:00.000Z"),
    });
    // Different link: must not be counted.
    await insertTestClickEvent(pool, {
      linkId: otherLinkId,
      shortCode: "bbb",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
    });

    const totalClicks = await analyticsRepository.getTotalClickCount({ linkId, from, to });
    expect(totalClicks).toBe(2);
  });

  it("returns zero for a range with no events", async () => {
    const linkId = await insertLink("ccc");
    const totalClicks = await analyticsRepository.getTotalClickCount({ linkId, from, to });
    expect(totalClicks).toBe(0);
  });

  it("groups the timeline into the requested bucket, sorted ascending", async () => {
    const linkId = await insertLink("ddd");

    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "ddd",
      occurredAt: new Date("2026-09-01T10:00:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "ddd",
      occurredAt: new Date("2026-09-01T15:00:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "ddd",
      occurredAt: new Date("2026-09-02T09:00:00.000Z"),
    });

    const timeline = await analyticsRepository.getTimeline({ linkId, from, to }, "day", "UTC");

    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.bucketStart).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(timeline[0]?.clickCount).toBe(2);
    expect(timeline[1]?.clickCount).toBe(1);
  });

  it("labels a click with no referrer as Direct / unknown", async () => {
    const linkId = await insertLink("eee");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "eee",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      referrerHost: null,
    });

    const referrers = await analyticsRepository.getTopReferrers({ linkId, from, to });
    expect(referrers).toEqual([{ name: "Direct / unknown", clickCount: 1 }]);
  });

  it("ranks referrers by click count descending", async () => {
    const linkId = await insertLink("fff");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "fff",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      referrerHost: "a.example.com",
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "fff",
      occurredAt: new Date("2026-09-01T13:00:00.000Z"),
      referrerHost: "b.example.com",
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "fff",
      occurredAt: new Date("2026-09-01T14:00:00.000Z"),
      referrerHost: "b.example.com",
    });

    const referrers = await analyticsRepository.getTopReferrers({ linkId, from, to });
    expect(referrers[0]).toEqual({ name: "b.example.com", clickCount: 2 });
    expect(referrers[1]).toEqual({ name: "a.example.com", clickCount: 1 });
  });

  it("breaks down devices and browsers", async () => {
    const linkId = await insertLink("ggg");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "ggg",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      deviceType: "mobile",
      browserName: "Safari",
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "ggg",
      occurredAt: new Date("2026-09-01T13:00:00.000Z"),
      deviceType: "desktop",
      browserName: null,
    });

    const devices = await analyticsRepository.getDeviceBreakdown({ linkId, from, to });
    const browsers = await analyticsRepository.getBrowserBreakdown({ linkId, from, to });

    expect(devices).toContainEqual({ name: "mobile", clickCount: 1 });
    expect(devices).toContainEqual({ name: "desktop", clickCount: 1 });
    expect(browsers).toContainEqual({ name: "Safari", clickCount: 1 });
    expect(browsers).toContainEqual({ name: "Unknown", clickCount: 1 });
  });

  it("breaks down geography by country and city", async () => {
    const linkId = await insertLink("hhh");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "hhh",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      countryCode: "US",
      countryName: "United States",
      cityName: "Chicago",
    });

    const geography = await analyticsRepository.getGeographyBreakdown({ linkId, from, to });
    expect(geography).toEqual([
      { countryCode: "US", countryName: "United States", cityName: "Chicago", clickCount: 1 },
    ]);
  });
});
