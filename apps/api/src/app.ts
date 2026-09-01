import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Pool } from "pg";
import { HealthController } from "./controllers/healthController";
import { LinksController } from "./controllers/linksController";
import { RedirectController } from "./controllers/redirectController";
import { errorHandlerMiddleware } from "./middleware/errorHandlerMiddleware";
import { createOwnerContextMiddleware } from "./middleware/ownerContextMiddleware";
import { requestIdMiddleware } from "./middleware/requestIdMiddleware";
import { LinkRepository } from "./repositories/linkRepository";
import { createHealthRoutes } from "./routes/healthRoutes";
import { createLinksRoutes } from "./routes/linksRoutes";
import { createRedirectRoutes } from "./routes/redirectRoutes";
import { LinkService } from "./services/linkService";
import { RedirectService } from "./services/redirectService";

const MAX_JSON_REQUEST_BODY_SIZE = "10kb";

export interface BuildApiAppOptions {
  databasePool: Pool;
  publicBaseUrl: string;
  ownerCookieSecret: string;
  isProductionEnvironment: boolean;
}

/**
 * Builds and wires the Express application. Route registration order
 * matters: health and /api routes are registered before the catch-all
 * public redirect route, so a reserved path is never interpreted as a
 * short code (Rule API-05).
 */
export function buildApiApp(options: BuildApiAppOptions): Express {
  const linkRepository = new LinkRepository(options.databasePool);
  const linkService = new LinkService(linkRepository, options.publicBaseUrl);
  const redirectService = new RedirectService(linkRepository);

  const healthController = new HealthController(options.databasePool);
  const linksController = new LinksController(linkService);
  const redirectController = new RedirectController(redirectService);

  const app = express();

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: MAX_JSON_REQUEST_BODY_SIZE }));
  app.use(cookieParser(options.ownerCookieSecret));

  app.use(createHealthRoutes(healthController));

  app.use(createOwnerContextMiddleware(options.isProductionEnvironment));
  app.use(createLinksRoutes(linksController));

  app.use(createRedirectRoutes(redirectController));

  app.use(errorHandlerMiddleware);

  return app;
}
