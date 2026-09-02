import { Router } from "express";
import type { MetricsController } from "../controllers/metricsController";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler";

export function createMetricsRoutes(metricsController: MetricsController): Router {
  const router = Router();

  router.get(
    "/metrics",
    asyncRouteHandler((request, response) => metricsController.handleMetrics(request, response)),
  );

  return router;
}
