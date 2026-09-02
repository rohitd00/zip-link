import { buildApiApp } from "./app";
import { createRedisClient } from "./cache/redisClient";
import { loadApiEnvironmentConfig } from "./config/environment";
import { logger } from "./observability/logger";
import { createClickEventQueue } from "./queue/clickEventQueue";
import { createQueueRedisConnection } from "./queue/queueRedisConnection";
import { createDatabasePool } from "./repositories/databasePool";

function startApiServer(): void {
  const config = loadApiEnvironmentConfig();
  const databasePool = createDatabasePool(config.databaseConnectionString);
  const redisClient = createRedisClient(config.redisConnectionString);
  const queueRedisConnection = createQueueRedisConnection(config.redisConnectionString);
  const clickEventQueue = createClickEventQueue(queueRedisConnection);

  const app = buildApiApp({
    databasePool,
    redisClient,
    clickEventQueue,
    publicBaseUrl: config.publicBaseUrl,
    ownerCookieSecret: config.ownerCookieSecret,
    redirectCacheTtlSeconds: config.redirectCacheTtlSeconds,
    createRateLimitMaxRequests: config.createRateLimitMaxRequests,
    createRateLimitWindowSeconds: config.createRateLimitWindowSeconds,
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
      Promise.allSettled([
        databasePool.end(),
        redisClient.quit(),
        clickEventQueue.close(),
        queueRedisConnection.quit(),
      ])
        .then((results) => {
          const failure = results.find((result) => result.status === "rejected");

          if (failure !== undefined && failure.status === "rejected") {
            logger.error("Error while closing a dependency connection during shutdown.", {
              errorMessage:
                failure.reason instanceof Error ? failure.reason.message : "Unknown error",
            });
            process.exit(1);
            return;
          }

          logger.info("API server shutdown complete.");
          process.exit(0);
        })
        .catch((shutdownError: unknown) => {
          logger.error("Unexpected error during shutdown.", {
            errorMessage: shutdownError instanceof Error ? shutdownError.message : "Unknown error",
          });
          process.exit(1);
        });
    });
  }

  process.on("SIGTERM", () => shutDownGracefully("SIGTERM"));
  process.on("SIGINT", () => shutDownGracefully("SIGINT"));
}

startApiServer();
