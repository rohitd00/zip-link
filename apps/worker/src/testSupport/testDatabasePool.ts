import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

export function createTestDatabasePool(): Pool {
  const testDatabaseUrl = process.env.DATABASE_TEST_URL;

  if (testDatabaseUrl === undefined || testDatabaseUrl.trim().length === 0) {
    throw new Error(
      "DATABASE_TEST_URL is not set. Add it to the repository .env file before running integration tests.",
    );
  }

  return new Pool({ connectionString: testDatabaseUrl });
}

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

/**
 * Inserts a minimal link row directly with SQL, bypassing the API's
 * LinkService (a separate, independently deployed process this worker
 * does not depend on). click_events and analytics_event_deduplication
 * both have a foreign key to links(id), so tests need a real link row to
 * reference.
 */
export async function insertTestLink(pool: Pool, shortCode: string): Promise<string> {
  const insertResult = await pool.query<{ id: string }>(
    `
      INSERT INTO links (short_code, long_url, normalized_long_url, owner_type, owner_id)
      VALUES ($1, 'https://example.com/test', 'https://example.com/test', 'anonymous_session', 'test-owner')
      RETURNING id;
    `,
    [shortCode],
  );

  const firstRow = insertResult.rows[0];

  if (firstRow === undefined) {
    throw new Error("Failed to insert a test link row.");
  }

  return firstRow.id;
}
