import { Worker } from "bullmq";
import { CLICK_ANALYTICS_QUEUE_NAME } from "@shared/contracts/clickEventJob";
import { loadWorkerEnvironmentConfig } from "./config/environment";
import { startHealthServerIfEnabled } from "./healthServer";
import { logger } from "./observability/logger";
import { processClickEventJob } from "./processors/clickEventProcessor";
import { createWorkerRedisConnection } from "./queue/workerRedisConnection";
import { createDatabasePool } from "./repositories/databasePool";
import { ClickEventRepository } from "./repositories/clickEventRepository";

function startAnalyticsWorker(): void {
  const config = loadWorkerEnvironmentConfig();
  const databasePool = createDatabasePool(config.databaseConnectionString);
  const redisConnection = createWorkerRedisConnection(config.redisConnectionString);
  const clickEventRepository = new ClickEventRepository(databasePool);
  const healthServer = startHealthServerIfEnabled();

  const worker = new Worker(
    CLICK_ANALYTICS_QUEUE_NAME,
    (job) =>
      processClickEventJob(job, {
        clickEventRepository,
        ipHashSecret: config.ipHashSecret,
        ipHashKeyVersion: config.ipHashKeyVersion,
      }),
    {
      connection: redisConnection,
      concurrency: config.analyticsWorkerConcurrency,
    },
  );

  worker.on("completed", (job) => {
    logger.info("Click-analytics job completed.", { jobId: job.id ?? "unknown" });
  });

  worker.on("failed", (job, failureError) => {
    logger.error("Click-analytics job failed.", {
      jobId: job?.id ?? "unknown",
      attemptsMade: job?.attemptsMade ?? 0,
      errorMessage: failureError.message,
    });
  });

  worker.on("error", (workerError) => {
    logger.error("Unexpected analytics worker error.", { errorMessage: workerError.message });
  });

  logger.info("Analytics worker started.", {
    concurrency: config.analyticsWorkerConcurrency,
    nodeEnvironment: config.nodeEnvironment,
  });

  function shutDownGracefully(signalName: string): void {
    logger.info("Shutting down analytics worker.", { signal: signalName });

    worker
      .close()
      .then(
        () =>
          new Promise<void>((resolve) => {
            if (healthServer === null) {
              resolve();
              return;
            }

            healthServer.close(() => resolve());
          }),
      )
      .then(() => Promise.allSettled([databasePool.end(), redisConnection.quit()]))
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

        logger.info("Analytics worker shutdown complete.");
        process.exit(0);
      })
      .catch((shutdownError: unknown) => {
        logger.error("Unexpected error during analytics worker shutdown.", {
          errorMessage: shutdownError instanceof Error ? shutdownError.message : "Unknown error",
        });
        process.exit(1);
      });
  }

  process.on("SIGTERM", () => shutDownGracefully("SIGTERM"));
  process.on("SIGINT", () => shutDownGracefully("SIGINT"));
}

startAnalyticsWorker();
