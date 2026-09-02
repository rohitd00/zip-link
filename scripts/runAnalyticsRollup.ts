// Runs the hourly and daily time rollups once and exits. Intended to be
// invoked on a schedule (cron, Windows Task Scheduler, or a hosting
// platform's own scheduled-job feature) — this project does not run a
// persistent rollup daemon, matching the same "an external scheduler
// invokes a short-lived script" pattern already used by
// scripts/create-future-click-event-partitions.ts. A reasonable schedule
// is every 15–30 minutes for the hourly rollup and once a day for the
// daily rollup; running both together on every invocation (as this script
// does) is simpler to operate and cheap enough at this project's scale to
// not need separate schedules yet.
//
// Usage: npx tsx scripts/runAnalyticsRollup.ts

import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { RollupCheckpointRepository } from "../apps/api/src/repositories/rollupCheckpointRepository";
import { RollupRepository } from "../apps/api/src/repositories/rollupRepository";
import { RollupService, type RollupRunResult } from "../apps/api/src/services/rollupService";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is not set. Add it to the repository .env file.");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const rollupService = new RollupService(
      new RollupRepository(pool),
      new RollupCheckpointRepository(pool),
    );

    const currentTime = new Date();
    const hourlyResult = await rollupService.runHourlyTimeRollup(currentTime);
    logRollupResult(hourlyResult);

    const dailyResult = await rollupService.runDailyTimeRollup(currentTime);
    logRollupResult(dailyResult);
  } finally {
    await pool.end();
  }
}

function logRollupResult(result: RollupRunResult): void {
  console.log(
    `${result.rollupName}: recomputed ${result.bucket} buckets from ` +
      `${result.windowStart.toISOString()} to ${result.windowEnd.toISOString()} ` +
      `(${result.rowsWritten} link/bucket rows written).`,
  );
}

main().catch((error: unknown) => {
  console.error("Failed to run the analytics rollup.", error);
  process.exitCode = 1;
});
