import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { AnalyticsController } from "../controllers/analyticsController";
import type { LinksController } from "../controllers/linksController";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler";

type RequestHandler = (request: Request, response: Response, next: NextFunction) => void;

// The rate limiter is a parameter, not a module-level import, so it only
// ever applies to the one route that passes it in below (POST). GET and
// DELETE never see it: a popular link's owner must always be able to check
// or remove it regardless of how many links they recently created.
export function createLinksRoutes(
  linksController: LinksController,
  analyticsController: AnalyticsController,
  creationRateLimitMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/api/links",
    creationRateLimitMiddleware,
    asyncRouteHandler((request, response) => linksController.createLink(request, response)),
  );

  router.get(
    "/api/links",
    asyncRouteHandler((request, response) => linksController.listLinks(request, response)),
  );

  router.get(
    "/api/links/:code",
    asyncRouteHandler((request, response) => linksController.getOwnedLink(request, response)),
  );

  router.delete(
    "/api/links/:code",
    asyncRouteHandler((request, response) => linksController.deleteLink(request, response)),
  );

  router.get(
    "/api/links/:code/analytics",
    asyncRouteHandler((request, response) =>
      analyticsController.getLinkAnalytics(request, response),
    ),
  );

  return router;
}
