import { Router } from "express";
import type { LinksController } from "../controllers/linksController";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler";

export function createLinksRoutes(linksController: LinksController): Router {
  const router = Router();

  router.post(
    "/api/links",
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

  return router;
}
