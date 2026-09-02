import crypto from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

/**
 * Creates a PostgreSQL pool pointed at the dedicated test database
 * (DATABASE_TEST_URL), never the development database. Integration tests
 * use this so they can freely insert and delete rows without touching
 * data a developer is looking at in the dashboard.
 */
export function createTestDatabasePool(): Pool {
  const testDatabaseUrl = process.env.DATABASE_TEST_URL;

  if (testDatabaseUrl === undefined || testDatabaseUrl.trim().length === 0) {
    throw new Error(
      "DATABASE_TEST_URL is not set. Add it to the repository .env file before running integration tests.",
    );
  }

  return new Pool({ connectionString: testDatabaseUrl });
}

export interface TestClickEventInput {
  linkId: string;
  shortCode: string;
  occurredAt: Date;
  referrerHost?: string | null;
  deviceType?: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  browserName?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  cityName?: string | null;
}

/**
 * Inserts a click_events row directly with SQL, bypassing the analytics
 * worker (a separate, independently deployed process this API test does
 * not run). Analytics endpoint tests use this to seed known data instead
 * of running the full queue/worker pipeline for every test case.
 */
export async function insertTestClickEvent(pool: Pool, input: TestClickEventInput): Promise<void> {
  await pool.query(
    `
      INSERT INTO click_events (
        occurred_at, event_id, link_id, short_code, referrer_host,
        device_type, browser_name, country_code, country_name, city_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
    `,
    [
      input.occurredAt,
      crypto.randomUUID(),
      input.linkId,
      input.shortCode,
      input.referrerHost ?? null,
      input.deviceType ?? "unknown",
      input.browserName ?? null,
      input.countryCode ?? null,
      input.countryName ?? null,
      input.cityName ?? null,
    ],
  );
}

/**
 * Removes every row created by tests, in an order that respects foreign
 * keys. This runs between tests instead of dropping/recreating tables, so
 * migrations only need to run once per test session.
 */
export async function truncateAllTestData(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      click_rollups_geography,
      click_rollups_browser,
      click_rollups_device,
      click_rollups_referrer,
      click_rollups_time,
      analytics_rollup_checkpoints,
      analytics_event_deduplication,
      click_events,
      links
    RESTART IDENTITY CASCADE;
  `);
}
