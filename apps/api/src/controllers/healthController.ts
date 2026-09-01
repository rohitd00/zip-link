import type { Request, Response } from "express";
import type Redis from "ioredis";
import type { Pool } from "pg";

const READINESS_CHECK_TIMEOUT_MILLISECONDS = 2000;

/**
 * Liveness only reports that the process is responding; it never touches a
 * dependency. Readiness checks both PostgreSQL and Redis, with a short
 * timeout each so a stuck dependency cannot make the health check itself
 * hang.
 *
 * Only PostgreSQL failure marks the service "unavailable" (503): a redirect
 * cannot be resolved correctly without it. Redis failure is reported as
 * "degraded" but keeps the overall status "ok", because the redirect path
 * is designed to fall back to PostgreSQL when the cache is down — Redis is
 * an optimization, not a correctness dependency, per Rule A-02.
 */
export class HealthController {
  constructor(
    private readonly databasePool: Pool,
    private readonly redisClient: Redis,
  ) {}

  handleLiveness(_request: Request, response: Response): void {
    response.status(200).json({ status: "ok" });
  }

  async handleReadiness(_request: Request, response: Response): Promise<void> {
    const [isDatabaseReady, isCacheReady] = await Promise.all([
      this.checkDatabaseWithTimeout(),
      this.checkRedisWithTimeout(),
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

async function runWithTimeout<T>(work: Promise<T>, timeoutMilliseconds: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error("Readiness check timed out."));
    }, timeoutMilliseconds);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
