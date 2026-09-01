import type { Request, Response } from "express";
import type { Pool } from "pg";

const READINESS_CHECK_TIMEOUT_MILLISECONDS = 2000;

/**
 * Liveness only reports that the process is responding; it never touches a
 * dependency. Readiness checks that PostgreSQL is reachable, with a short
 * timeout so a stuck dependency cannot make the health check itself hang.
 */
export class HealthController {
  constructor(private readonly databasePool: Pool) {}

  handleLiveness(_request: Request, response: Response): void {
    response.status(200).json({ status: "ok" });
  }

  async handleReadiness(_request: Request, response: Response): Promise<void> {
    try {
      await this.queryDatabaseWithTimeout();
      response.status(200).json({ status: "ok" });
    } catch {
      response.status(503).json({ status: "unavailable" });
    }
  }

  private async queryDatabaseWithTimeout(): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Readiness check timed out."));
      }, READINESS_CHECK_TIMEOUT_MILLISECONDS);
    });

    try {
      await Promise.race([this.databasePool.query("SELECT 1"), timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
