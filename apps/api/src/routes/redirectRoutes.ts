import { Router } from "express";
import type { RedirectController } from "../controllers/redirectController";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler";

// This route is registered last in app.ts, after every /api and /health
// route, so a reserved path can never be mistaken for a short code. See
// Rule API-05 in project-rules.md.
export function createRedirectRoutes(redirectController: RedirectController): Router {
  const router = Router();

  router.get(
    "/:code",
    asyncRouteHandler((request, response) => redirectController.handleRedirect(request, response)),
  );

  return router;
}
