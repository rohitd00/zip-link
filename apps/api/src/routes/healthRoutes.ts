import { Router } from "express";
import type { HealthController } from "../controllers/healthController";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler";

export function createHealthRoutes(healthController: HealthController): Router {
  const router = Router();

  router.get("/health/live", (request, response) => {
    healthController.handleLiveness(request, response);
  });

  router.get(
    "/health/ready",
    asyncRouteHandler((request, response) => healthController.handleReadiness(request, response)),
  );

  return router;
}
