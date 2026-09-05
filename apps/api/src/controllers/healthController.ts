import type { Request, Response } from "express";
import type Redis from "ioredis";
import type { Pool } from "pg";
import { runWithTimeout } from "../utils/runWithTimeout";

const READINESS_CHECK_TIMEOUT_MILLISECONDS = 2000;

// A hosting platform's own health checker typically polls a configured
// health check path every few seconds, indefinitely, for as long as the
// service is deployed -- a very different traffic pattern from an
// occasional manual check. Without this cache, every one of those polls
// was a real Redis PING and a real "SELECT 1" against Postgres, which on
// a metered free-tier Redis plan (a fixed monthly command quota) adds up
// to real, wasted quota consumption completely independent of actual
// application traffic. This is deliberately longer than any reasonable
// poll interval, so most polls become a cache hit rather than a new
// dependency round trip; the tradeoff is that a dependency's reported
// status can be up to this many seconds stale, which is acceptable here
// since this data only ever appears in an informational response body,
// never gates anything else.
const DEPENDENCY_CHECK_CACHE_TTL_MILLISECONDS = 10_000;

interface CachedCheckResult {
  isHealthy: boolean;
  expiresAtEpochMilliseconds: number;
}

/**
 * Liveness only reports that the process is responding; it never touches a
 * dependency. Readiness checks both PostgreSQL and Redis, with a short
 * timeout each so a stuck dependency cannot make the health check itself
 * hang, and a short result cache (see the constant above) so a platform's
 * own frequent health-check polling cannot itself become a meaningful
 * source of load or metered-quota consumption.
 *
 * Only PostgreSQL failure marks the service "unavailable" (503): a redirect
 * cannot be resolved correctly without it. Redis failure is reported as
 * "degraded" but keeps the overall status "ok", because the redirect path
 * is designed to fall back to PostgreSQL when the cache is down — Redis is
 * an optimization, not a correctness dependency, per Rule A-02.
 */
export class HealthController {
  private cachedDatabaseResult: CachedCheckResult | null = null;
  private cachedRedisResult: CachedCheckResult | null = null;

  constructor(
    private readonly databasePool: Pool,
    private readonly redisClient: Redis,
  ) {}

  handleLiveness(_request: Request, response: Response): void {
    response.status(200).json({ status: "ok" });
  }

  async handleReadiness(_request: Request, response: Response): Promise<void> {
    const [isDatabaseReady, isCacheReady] = await Promise.all([
      this.getCachedOrFreshResult(
        () => this.cachedDatabaseResult,
        (result) => {
          this.cachedDatabaseResult = result;
        },
        () => this.checkDatabaseWithTimeout(),
      ),
      this.getCachedOrFreshResult(
        () => this.cachedRedisResult,
        (result) => {
          this.cachedRedisResult = result;
        },
        () => this.checkRedisWithTimeout(),
      ),
    ]);

    const responseBody = {
      status: isDatabaseReady ? "ok" : "unavailable",
      dependencies: {
        database: isDatabaseReady ? "ok" : "unavailable",
        cache: isCacheReady ? "ok" : "degraded",
      },
    };

    response.status(isDatabaseReady ? 200 : 503).json(responseBody);
  }

  private async getCachedOrFreshResult(
    readCache: () => CachedCheckResult | null,
    writeCache: (result: CachedCheckResult) => void,
    runFreshCheck: () => Promise<boolean>,
  ): Promise<boolean> {
    const cached = readCache();
    const now = Date.now();

    if (cached !== null && cached.expiresAtEpochMilliseconds > now) {
      return cached.isHealthy;
    }

    const isHealthy = await runFreshCheck();
    writeCache({
      isHealthy,
      expiresAtEpochMilliseconds: now + DEPENDENCY_CHECK_CACHE_TTL_MILLISECONDS,
    });

    return isHealthy;
  }

  private async checkDatabaseWithTimeout(): Promise<boolean> {
    try {
      await runWithTimeout(
        this.databasePool.query("SELECT 1"),
        READINESS_CHECK_TIMEOUT_MILLISECONDS,
      );
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedisWithTimeout(): Promise<boolean> {
    try {
      await runWithTimeout(this.redisClient.ping(), READINESS_CHECK_TIMEOUT_MILLISECONDS);
      return true;
    } catch {
      return false;
    }
  }
}
