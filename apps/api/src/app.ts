import cookieParser from "cookie-parser";
import type { Queue } from "bullmq";
import express, { type Express } from "express";
import helmet from "helmet";
import type Redis from "ioredis";
import type { Pool } from "pg";
import { CreationRateLimiter } from "./cache/creationRateLimiter";
import { RedirectCacheRepository } from "./cache/redirectCacheRepository";
import { AnalyticsController } from "./controllers/analyticsController";
import { HealthController } from "./controllers/healthController";
import { LinksController } from "./controllers/linksController";
import { MetricsController } from "./controllers/metricsController";
import { RedirectController } from "./controllers/redirectController";
import { createCreationRateLimitMiddleware } from "./middleware/creationRateLimitMiddleware";
import { errorHandlerMiddleware } from "./middleware/errorHandlerMiddleware";
import { createOwnerContextMiddleware } from "./middleware/ownerContextMiddleware";
import { requestIdMiddleware } from "./middleware/requestIdMiddleware";
import { requestLoggingMiddleware } from "./middleware/requestLoggingMiddleware";
import { ClickEventPublisher } from "./queue/clickEventPublisher";
import { AnalyticsRepository } from "./repositories/analyticsRepository";
import { LinkRepository } from "./repositories/linkRepository";
import { RollupCheckpointRepository } from "./repositories/rollupCheckpointRepository";
import { createHealthRoutes } from "./routes/healthRoutes";
import { createLinksRoutes } from "./routes/linksRoutes";
import { createMetricsRoutes } from "./routes/metricsRoutes";
import { createRedirectRoutes } from "./routes/redirectRoutes";
import { AnalyticsService } from "./services/analyticsService";
import { LinkService } from "./services/linkService";
import { RedirectService } from "./services/redirectService";

const MAX_JSON_REQUEST_BODY_SIZE = "10kb";

export interface BuildApiAppOptions {
  databasePool: Pool;
  redisClient: Redis;
  clickEventQueue: Queue;
  publicBaseUrl: string;
  ownerCookieSecret: string;
  redirectCacheTtlSeconds: number;
  createRateLimitMaxRequests: number;
  createRateLimitWindowSeconds: number;
  isProductionEnvironment: boolean;
  trustProxyHops: number;
}

/**
 * Builds and wires the Express application. Route registration order
 * matters: health and /api routes are registered before the catch-all
 * public redirect route, so a reserved path is never interpreted as a
 * short code (Rule API-05).
 */
export function buildApiApp(options: BuildApiAppOptions): Express {
  const linkRepository = new LinkRepository(options.databasePool);
  const analyticsRepository = new AnalyticsRepository(options.databasePool);
  const rollupCheckpointRepository = new RollupCheckpointRepository(options.databasePool);
  const redirectCacheRepository = new RedirectCacheRepository(options.redisClient);
  const creationRateLimiter = new CreationRateLimiter(
    options.redisClient,
    options.createRateLimitMaxRequests,
    options.createRateLimitWindowSeconds,
  );
  const clickEventPublisher = new ClickEventPublisher(options.clickEventQueue);

  const linkService = new LinkService(
    linkRepository,
    redirectCacheRepository,
    options.publicBaseUrl,
    options.redirectCacheTtlSeconds,
  );
  const redirectService = new RedirectService(
    linkRepository,
    redirectCacheRepository,
    options.redirectCacheTtlSeconds,
  );
  const analyticsService = new AnalyticsService(
    linkRepository,
    analyticsRepository,
    options.publicBaseUrl,
    rollupCheckpointRepository,
  );

  const healthController = new HealthController(options.databasePool, options.redisClient);
  const metricsController = new MetricsController(options.clickEventQueue);
  const linksController = new LinksController(linkService);
  const analyticsController = new AnalyticsController(analyticsService);
  const redirectController = new RedirectController(redirectService, clickEventPublisher);

  const app = express();

  // Controls whether Express reads the real visitor IP from the
  // X-Forwarded-For header (set by a reverse proxy/load balancer in front
  // of this process) instead of the raw socket address. This must stay 0
  // wherever requests arrive directly — local development, and
  // docker-compose's own network — because X-Forwarded-For is just an
  // ordinary header: with nothing in front of this process to strip and
  // re-set it, any caller could put an arbitrary value in it and spoof
  // their IP. It should be set to the real number of proxy hops (usually
  // 1) only in a deployment that actually has one, so that
  // RedirectController's use of request.ip (for the analytics IP hash and
  // the creation rate limiter) reflects the real visitor rather than every
  // request appearing to come from the load balancer's own address.
  app.set("trust proxy", options.trustProxyHops);

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(express.json({ limit: MAX_JSON_REQUEST_BODY_SIZE }));
  app.use(cookieParser(options.ownerCookieSecret));

  app.use(createHealthRoutes(healthController));
  app.use(createMetricsRoutes(metricsController));

  app.use(createOwnerContextMiddleware(options.isProductionEnvironment));
  app.use(
    createLinksRoutes(
      linksController,
      analyticsController,
      createCreationRateLimitMiddleware(creationRateLimiter),
    ),
  );

  app.use(createRedirectRoutes(redirectController));

  app.use(errorHandlerMiddleware);

  return app;
}
