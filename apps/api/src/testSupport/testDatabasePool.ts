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
      analytics_event_deduplication,
      click_events,
      links
    RESTART IDENTITY CASCADE;
  `);
}
