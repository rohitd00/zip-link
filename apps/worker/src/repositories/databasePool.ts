import { Pool } from "pg";
import { logger } from "../observability/logger";

export function createDatabasePool(databaseConnectionString: string): Pool {
  const pool = new Pool({
    connectionString: databaseConnectionString,
  });

  pool.on("error", (unexpectedError) => {
    logger.error("Unexpected PostgreSQL pool error.", {
      errorMessage: unexpectedError.message,
    });
  });

  return pool;
}
