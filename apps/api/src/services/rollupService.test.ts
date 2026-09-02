import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabasePool,
  insertTestClickEvent,
  truncateAllTestData,
} from "../testSupport/testDatabasePool";
import { LinkRepository } from "../repositories/linkRepository";
import { RollupCheckpointRepository } from "../repositories/rollupCheckpointRepository";
import { RollupRepository } from "../repositories/rollupRepository";
import { DAILY_TIME_ROLLUP_NAME, HOURLY_TIME_ROLLUP_NAME, RollupService } from "./rollupService";

let pool: Pool;
let rollupService: RollupService;
let checkpointRepository: RollupCheckpointRepository;
let linkRepository: LinkRepository;

beforeAll(() => {
  pool = createTestDatabasePool();
  rollupService = new RollupService(
    new RollupRepository(pool),
    new RollupCheckpointRepository(pool),
  );
  checkpointRepository = new RollupCheckpointRepository(pool);
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

describe("RollupService.runHourlyTimeRollup", () => {
  it("writes hourly rollup rows for recent events and records a checkpoint", async () => {
    const linkId = await insertLink("aaa");
    const currentTime = new Date("2026-09-01T10:30:00.000Z");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T10:05:00.000Z"),
    });

    const result = await rollupService.runHourlyTimeRollup(currentTime);

    expect(result.bucket).toBe("hour");
    expect(result.rollupName).toBe(HOURLY_TIME_ROLLUP_NAME);
    expect(result.rowsWritten).toBeGreaterThanOrEqual(1);

    const rollupRows = await pool.query<{ click_count: string }>(
      `SELECT click_count FROM click_rollups_time WHERE link_id = $1 AND bucket_granularity = 'hour' AND bucket_start = '2026-09-01T10:00:00.000Z';`,
      [linkId],
    );
    expect(rollupRows.rows[0]?.click_count).toBe("1");

    const checkpoint = await checkpointRepository.getCheckpoint(HOURLY_TIME_ROLLUP_NAME);
    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.lastProcessedEventTime?.toISOString()).toBe(result.windowEnd.toISOString());
    expect(checkpoint?.lastSuccessfulCompletedAt).not.toBeNull();
  });
});

describe("RollupService.runDailyTimeRollup", () => {
  it("writes daily rollup rows and records its own separate checkpoint", async () => {
    const linkId = await insertLink("aaa");
    const currentTime = new Date("2026-09-01T10:30:00.000Z");
    await insertTestClickEvent(pool, {
      linkId,
      shortCode: "aaa",
      occurredAt: new Date("2026-09-01T02:00:00.000Z"),
    });

    const result = await rollupService.runDailyTimeRollup(currentTime);

    expect(result.bucket).toBe("day");
    expect(result.rollupName).toBe(DAILY_TIME_ROLLUP_NAME);

    const rollupRows = await pool.query<{ click_count: string }>(
      `SELECT click_count FROM click_rollups_time WHERE link_id = $1 AND bucket_granularity = 'day' AND bucket_start = '2026-09-01T00:00:00.000Z';`,
      [linkId],
    );
    expect(rollupRows.rows[0]?.click_count).toBe("1");

    // The hourly and daily rollups must never share a checkpoint row —
    // each tracks its own independent freshness.
    const hourlyCheckpoint = await checkpointRepository.getCheckpoint(HOURLY_TIME_ROLLUP_NAME);
    const dailyCheckpoint = await checkpointRepository.getCheckpoint(DAILY_TIME_ROLLUP_NAME);
    expect(hourlyCheckpoint).toBeNull();
    expect(dailyCheckpoint).not.toBeNull();
  });
});
