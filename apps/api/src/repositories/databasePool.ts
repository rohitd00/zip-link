import { Pool } from "pg";
import { logger } from "../observability/logger";

/**
 * Creates the single PostgreSQL connection pool used by the API process.
 * All repositories receive this pool rather than creating their own
 * connections, so the process has one place to close connections cleanly
 * during shutdown.
 */
export function createDatabasePool(databaseConnectionString: string): Pool {
  const pool = new Pool({
    connectionString: databaseConnectionString,
  });

  pool.on("error", (unexpectedError) => {
    // A background, idle client emitted an error. This does not crash the
    // process; the pool will create a new connection on the next request.
    // We still want this visible in logs because repeated occurrences
    // usually mean the database is unreachable.
    logger.error("Unexpected PostgreSQL pool error.", {
      message: unexpectedError.message,
    });
  });

  return pool;
}
