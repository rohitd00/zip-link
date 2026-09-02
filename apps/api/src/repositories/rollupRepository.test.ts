import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabasePool,
  insertTestClickEvent,
  truncateAllTestData,
} from "../testSupport/testDatabasePool";
import { LinkRepository } from "./linkRepository";
import { RollupRepository } from "./rollupRepository";

let pool: Pool;
let rollupRepository: RollupRepository;
let linkRepository: LinkRepository;

beforeAll(() => {
  pool = createTestDatabasePool();
  rollupRepository = new RollupRepository(pool);
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
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
  });

  return link.id;
}

async function readRollupRows(
  linkId: string,
): Promise<Array<{ bucket_start: Date; click_count: string }>> {
  const result = await pool.query<{ bucket_start: Date; click_count: string }>(
    `
      SELECT bucket_start, click_count
      FROM click_rollups_time
      WHERE link_id = $1 AND bucket_granularity = 'hour'
      ORDER BY bucket_start ASC;
    `,
    [linkId],
  );

  return result.rows;
}

describe("RollupRepository.upsertTimeRollupsForWindow", () => {
  it("groups events into UTC-truncated hourly buckets per link", async () => {
    const linkId = await insertLink("aaa");

    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T10:05:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T10:55:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T11:10:00.000Z"),
    });

    await rollupRepository.upsertTimeRollupsForWindow(
      "hour",
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-02T00:00:00.000Z"),
    );

    const rows = await readRollupRows(linkId);
    expect(rows).toEqual([
      { bucket_start: new Date("2026-09-01T10:00:00.000Z"), click_count: "2" },
      { bucket_start: new Date("2026-09-01T11:00:00.000Z"), click_count: "1" },
    ]);
  });

  it("does not mix events from a different link into the same bucket", async () => {
    const linkId = await insertLink("aaa");
    const otherLinkId = await insertLink("bbb");

    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T10:05:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId: otherLinkId,
      shortCode: "bbb",
      occurredAt: new Date("2026-09-01T10:06:00.000Z"),
    });

    await rollupRepository.upsertTimeRollupsForWindow(
      "hour",
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-02T00:00:00.000Z"),
    );

    expect(await readRollupRows(linkId)).toEqual([
      { bucket_start: new Date("2026-09-01T10:00:00.000Z"), click_count: "1" },
    ]);
    expect(await readRollupRows(otherLinkId)).toEqual([
      { bucket_start: new Date("2026-09-01T10:00:00.000Z"), click_count: "1" },
    ]);
  });

  it("produces the same final count when run twice with no new events (idempotent)", async () => {
    const linkId = await insertLink("aaa");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T10:05:00.000Z"),
    });

    const window: [Date, Date] = [
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-02T00:00:00.000Z"),
    ];
    await rollupRepository.upsertTimeRollupsForWindow("hour", ...window);
    await rollupRepository.upsertTimeRollupsForWindow("hour", ...window);

    expect(await readRollupRows(linkId)).toEqual([
      { bucket_start: new Date("2026-09-01T10:00:00.000Z"), click_count: "1" },
    ]);
  });

  it("includes a late-arriving event in the correct bucket after the window is recomputed", async () => {
    const linkId = await insertLink("aaa");
    const window: [Date, Date] = [
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-02T00:00:00.000Z"),
    ];

    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T10:05:00.000Z"),
    });
    await rollupRepository.upsertTimeRollupsForWindow("hour", ...window);
    expect(await readRollupRows(linkId)).toEqual([
      { bucket_start: new Date("2026-09-01T10:00:00.000Z"), click_count: "1" },
    ]);

    // Simulates a queued event that only reaches the worker (and therefore
    // the database) after the first rollup run already happened — this is
    // exactly the "late event" scenario the overlap window exists for.
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T10:40:00.000Z"),
    });
    await rollupRepository.upsertTimeRollupsForWindow("hour", ...window);

    expect(await readRollupRows(linkId)).toEqual([
      { bucket_start: new Date("2026-09-01T10:00:00.000Z"), click_count: "2" },
    ]);
  });

  it("ignores events outside the given window", async () => {
    const linkId = await insertLink("aaa");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T04:59:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-02T00:00:00.000Z"),
    });

    await rollupRepository.upsertTimeRollupsForWindow(
      "hour",
      new Date("2026-09-01T05:00:00.000Z"),
      new Date("2026-09-02T00:00:00.000Z"),
    );

    expect(await readRollupRows(linkId)).toEqual([]);
  });

  it("computes day buckets when asked for the day granularity", async () => {
    const linkId = await insertLink("aaa");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T02:00:00.000Z"),
    });
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T23:00:00.000Z"),
    });

    await rollupRepository.upsertTimeRollupsForWindow(
      "day",
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-02T00:00:00.000Z"),
    );

    const result = await pool.query<{ bucket_start: Date; click_count: string }>(
      `SELECT bucket_start, click_count FROM click_rollups_time WHERE link_id = $1 AND bucket_granularity = 'day';`,
      [linkId],
    );
    expect(result.rows).toEqual([
      { bucket_start: new Date("2026-09-01T00:00:00.000Z"), click_count: "2" },
    ]);
  });
});
