// Run this script periodically (for example, once a month from a scheduled
// job) to make sure click_events always has a partition ready for the
// current month and a configured number of months ahead. Missing a future
// partition would make every worker insert fail once traffic crosses into
// an unpartitioned month, so this must run well before that horizon runs
// out. See database-schema.md Section 8.3 and the B-02 task in
// docs/07-agent-todo-tracker.md.
//
// Usage: npx tsx scripts/create-future-click-event-partitions.ts

import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONTHS_OF_FUTURE_PARTITIONS_TO_ENSURE = 3;

interface MonthlyPartitionBoundary {
  tableName: string;
  rangeStartInclusive: string;
  rangeEndExclusive: string;
}

function buildMonthlyPartitionBoundary(monthsFromNow: number): MonthlyPartitionBoundary {
  const now = new Date();
  const targetYear = now.getUTCFullYear();
  const targetMonthIndex = now.getUTCMonth() + monthsFromNow;

  const rangeStart = new Date(Date.UTC(targetYear, targetMonthIndex, 1));
  const rangeEnd = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 1));

  const paddedMonth = String(rangeStart.getUTCMonth() + 1).padStart(2, "0");
  const tableName = `click_events_${rangeStart.getUTCFullYear()}_${paddedMonth}`;

  return {
    tableName,
    rangeStartInclusive: rangeStart.toISOString(),
    rangeEndExclusive: rangeEnd.toISOString(),
  };
}

async function ensurePartitionExists(
  pool: Pool,
  boundary: MonthlyPartitionBoundary,
): Promise<void> {
  const existsResult = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class WHERE relname = $1
     ) AS exists;`,
    [boundary.tableName],
  );

  const alreadyExists = existsResult.rows[0]?.exists === true;

  if (alreadyExists) {
    console.log(`Partition already exists: ${boundary.tableName}`);
    return;
  }

  await pool.query(
    `CREATE TABLE ${boundary.tableName}
       PARTITION OF click_events
       FOR VALUES FROM ('${boundary.rangeStartInclusive}') TO ('${boundary.rangeEndExclusive}');`,
  );

  await pool.query(
    `CREATE INDEX idx_${boundary.tableName}_link_occurred_at
       ON ${boundary.tableName} (link_id, occurred_at DESC);`,
  );

  await pool.query(
    `CREATE INDEX idx_${boundary.tableName}_short_code_occurred_at
       ON ${boundary.tableName} (short_code, occurred_at DESC);`,
  );

  await pool.query(
    `CREATE INDEX idx_${boundary.tableName}_occurred_at
       ON ${boundary.tableName} (occurred_at DESC);`,
  );

  console.log(`Created partition: ${boundary.tableName}`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is not set. Add it to the repository .env file.");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    for (
      let monthsFromNow = 0;
      monthsFromNow <= MONTHS_OF_FUTURE_PARTITIONS_TO_ENSURE;
      monthsFromNow += 1
    ) {
      const boundary = buildMonthlyPartitionBoundary(monthsFromNow);
      await ensurePartitionExists(pool, boundary);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to ensure future click_events partitions exist.", error);
  process.exitCode = 1;
});
