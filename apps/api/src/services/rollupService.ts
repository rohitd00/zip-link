import type { AnalyticsBucket } from "../domain/analyticsBucketSelection";
import { calculateDailyRollupWindow, calculateHourlyRollupWindow } from "../domain/rollupWindow";
import type { RollupCheckpointRepository } from "../repositories/rollupCheckpointRepository";
import type { RollupRepository } from "../repositories/rollupRepository";

export const HOURLY_TIME_ROLLUP_NAME = "hourly_time";
export const DAILY_TIME_ROLLUP_NAME = "daily_time";

export interface RollupRunResult {
  rollupName: string;
  bucket: AnalyticsBucket;
  windowStart: Date;
  windowEnd: Date;
  rowsWritten: number;
}

/**
 * Runs the time rollup jobs (`click_rollups_time`, per bucket granularity).
 *
 * Only the time dimension is implemented. `docs/06-implementation-plan.md`
 * Section 10.3's rollout policy is explicit: "enable dimension rollups
 * [referrer/device/browser/geography] when query plans or benchmark
 * results justify them" — this project's analytics queries have stayed
 * fast on raw `click_events` at every scale actually tested (see the
 * README's benchmark section), so there is no evidence yet that those four
 * additional rollup tables are needed. `click_rollups_referrer`,
 * `_device`, `_browser`, and `_geography` already exist from the schema
 * migration and can be populated the same way this class populates
 * `click_rollups_time`, the moment that evidence appears.
 *
 * `AnalyticsService` does not read from these rollups yet, for a related
 * reason: `AnalyticsRepository.getTimeline` buckets in the *requester's*
 * timezone, while rollups are always stored in UTC (per
 * database-schema.md Section 15.2) — switching the read path would need a
 * genuine hybrid-range strategy (recent, still-settling buckets from raw
 * events; older, UTC-safe buckets from rollups), not just a table swap.
 * This class exists so that switch is ready to build on top of once a
 * large/repeated-range query actually needs it, per the same rollout
 * policy ("start simple and correct").
 */
export class RollupService {
  constructor(
    private readonly rollupRepository: RollupRepository,
    private readonly checkpointRepository: RollupCheckpointRepository,
  ) {}

  async runHourlyTimeRollup(currentTime: Date): Promise<RollupRunResult> {
    return this.runTimeRollup(HOURLY_TIME_ROLLUP_NAME, "hour", currentTime);
  }

  async runDailyTimeRollup(currentTime: Date): Promise<RollupRunResult> {
    return this.runTimeRollup(DAILY_TIME_ROLLUP_NAME, "day", currentTime);
  }

  private async runTimeRollup(
    rollupName: string,
    bucket: AnalyticsBucket,
    currentTime: Date,
  ): Promise<RollupRunResult> {
    const startedAt = new Date();
    const window =
      bucket === "hour"
        ? calculateHourlyRollupWindow(currentTime)
        : calculateDailyRollupWindow(currentTime);

    const rowsWritten = await this.rollupRepository.upsertTimeRollupsForWindow(
      bucket,
      window.windowStart,
      window.windowEnd,
    );

    const completedAt = new Date();
    await this.checkpointRepository.recordSuccessfulRun(
      rollupName,
      startedAt,
      completedAt,
      window.windowEnd,
    );

    return {
      rollupName,
      bucket,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      rowsWritten,
    };
  }
}
