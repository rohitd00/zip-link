import { buildApiApp } from "./app";
import { loadApiEnvironmentConfig } from "./config/environment";
import { logger } from "./observability/logger";
import { createDatabasePool } from "./repositories/databasePool";

function startApiServer(): void {
  const config = loadApiEnvironmentConfig();
  const databasePool = createDatabasePool(config.databaseConnectionString);

  const app = buildApiApp({
    databasePool,
    publicBaseUrl: config.publicBaseUrl,
    ownerCookieSecret: config.ownerCookieSecret,
    isProductionEnvironment: config.nodeEnvironment === "production",
  });

  const server = app.listen(config.port, () => {
    logger.info("API server started.", {
      port: config.port,
      nodeEnvironment: config.nodeEnvironment,
    });
  });

  function shutDownGracefully(signalName: string): void {
    logger.info("Shutting down API server.", { signal: signalName });

    server.close(() => {
      databasePool
        .end()
        .then(() => {
          logger.info("API server shutdown complete.");
          process.exit(0);
        })
        .catch((shutdownError: unknown) => {
          logger.error("Error while closing the database pool during shutdown.", {
            message: shutdownError instanceof Error ? shutdownError.message : "Unknown error",
          });
          process.exit(1);
        });
    });
  }

  process.on("SIGTERM", () => shutDownGracefully("SIGTERM"));
  process.on("SIGINT", () => shutDownGracefully("SIGINT"));
}

startApiServer();
