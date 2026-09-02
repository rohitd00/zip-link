import type { Pool } from "pg";
import type { AnalyticsBucket } from "../domain/analyticsBucketSelection";

/**
 * Recomputes `click_rollups_time` for a window of raw `click_events`. Only
 * the time rollup is implemented — see the header comment on
 * `services/rollupService.ts` for why the dimension rollups
 * (`click_rollups_referrer`/`device`/`browser`/`geography`) are
 * deliberately not built yet.
 */
export class RollupRepository {
  constructor(private readonly databasePool: Pool) {}

  /**
   * Groups every event in `[windowStart, windowEnd)` by link and UTC bucket
   * and upserts the result into `click_rollups_time`, per the pattern in
   * database-schema.md Section 15.1. `bucket_start` is always computed in
   * UTC regardless of the database session's own timezone setting — the
   * same `AT TIME ZONE` double-conversion used by
   * `AnalyticsRepository.getTimeline`, but with UTC hardcoded rather than a
   * per-request value, matching Section 15.2's "daily rows use
   * date_trunc('day', occurred_at) in UTC for storage."
   *
   * Safe to call repeatedly for the same window: `ON CONFLICT` overwrites
   * each row with its freshly recomputed count rather than adding to it, so
   * re-running never double-counts.
   */
  async upsertTimeRollupsForWindow(
    bucket: AnalyticsBucket,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number> {
    const result = await this.databasePool.query(
      `
        INSERT INTO click_rollups_time (
          link_id, bucket_granularity, bucket_start, click_count, calculated_at
        )
        SELECT
          link_id,
          $4::analytics_bucket_granularity,
          date_trunc($3, occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket_start,
          count(*) AS click_count,
          now()
        FROM click_events
        WHERE occurred_at >= $1
          AND occurred_at < $2
        GROUP BY link_id, bucket_start
        ON CONFLICT (link_id, bucket_granularity, bucket_start)
        DO UPDATE SET
          click_count = EXCLUDED.click_count,
          calculated_at = EXCLUDED.calculated_at;
      `,
      // $3 and $4 are the same value (the bucket unit, e.g. "hour"), bound
      // twice at different positions: PostgreSQL fixes one type per
      // parameter *number* for the whole statement, and $3's use inside
      // date_trunc() needs it treated as text while $4's use as the
      // inserted bucket_granularity column needs it treated as that enum —
      // a single shared placeholder can't satisfy both at once.
      [windowStart, windowEnd, bucket, bucket],
    );

    return result.rowCount ?? 0;
  }
}
