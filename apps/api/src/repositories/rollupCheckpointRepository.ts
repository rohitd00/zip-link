import type { Pool } from "pg";

export interface RollupCheckpoint {
  rollupName: string;
  lastSuccessfulStartedAt: Date | null;
  lastSuccessfulCompletedAt: Date | null;
  lastProcessedEventTime: Date | null;
}

interface RollupCheckpointRow {
  rollup_name: string;
  last_successful_started_at: Date | null;
  last_successful_completed_at: Date | null;
  last_processed_event_time: Date | null;
}

/**
 * Reads and writes `analytics_rollup_checkpoints` — one row per rollup job
 * name (see database-schema.md Section 11), used to report rollup freshness
 * rather than to gate correctness: the rollup repository always recomputes
 * its full overlap window from raw events regardless of what the last
 * checkpoint says, so a missed or stale checkpoint cannot cause incorrect
 * (only possibly late) rollup data.
 */
export class RollupCheckpointRepository {
  constructor(private readonly databasePool: Pool) {}

  async getCheckpoint(rollupName: string): Promise<RollupCheckpoint | null> {
    const result = await this.databasePool.query<RollupCheckpointRow>(
      `
        SELECT rollup_name, last_successful_started_at, last_successful_completed_at, last_processed_event_time
        FROM analytics_rollup_checkpoints
        WHERE rollup_name = $1
        LIMIT 1;
      `,
      [rollupName],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return mapRowToCheckpoint(row);
  }

  async recordSuccessfulRun(
    rollupName: string,
    startedAt: Date,
    completedAt: Date,
    lastProcessedEventTime: Date,
  ): Promise<void> {
    await this.databasePool.query(
      `
        INSERT INTO analytics_rollup_checkpoints (
          rollup_name, last_successful_started_at, last_successful_completed_at,
          last_processed_event_time, updated_at
        )
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (rollup_name)
        DO UPDATE SET
          last_successful_started_at = EXCLUDED.last_successful_started_at,
          last_successful_completed_at = EXCLUDED.last_successful_completed_at,
          last_processed_event_time = EXCLUDED.last_processed_event_time,
          updated_at = now();
      `,
      [rollupName, startedAt, completedAt, lastProcessedEventTime],
    );
  }
}

function mapRowToCheckpoint(row: RollupCheckpointRow): RollupCheckpoint {
  return {
    rollupName: row.rollup_name,
    lastSuccessfulStartedAt: row.last_successful_started_at,
    lastSuccessfulCompletedAt: row.last_successful_completed_at,
    lastProcessedEventTime: row.last_processed_event_time,
  };
}
