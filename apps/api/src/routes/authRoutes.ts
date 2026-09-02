import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { AuthController } from "../controllers/authController";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler";

type RequestHandler = (request: Request, response: Response, next: NextFunction) => void;

export function createAuthRoutes(
  authController: AuthController,
  authRateLimitMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/api/auth/signup",
    authRateLimitMiddleware,
    asyncRouteHandler((request, response) => authController.signup(request, response)),
  );

  router.post(
    "/api/auth/login",
    authRateLimitMiddleware,
    asyncRouteHandler((request, response) => authController.login(request, response)),
  );

  router.post(
    "/api/auth/logout",
    asyncRouteHandler((request, response) => authController.logout(request, response)),
  );

  router.get("/api/auth/me", (request, response) => {
    authController.getCurrentUser(request, response);
  });

  router.get("/api/auth/google", (request, response) => {
    authController.startGoogleSignIn(request, response);
  });

  router.get(
    "/api/auth/google/callback",
    asyncRouteHandler((request, response) =>
      authController.handleGoogleCallback(request, response),
    ),
  );

  router.post(
    "/api/auth/request-password-reset",
    authRateLimitMiddleware,
    asyncRouteHandler((request, response) =>
      authController.requestPasswordReset(request, response),
    ),
  );

  router.post(
    "/api/auth/reset-password",
    asyncRouteHandler((request, response) => authController.resetPassword(request, response)),
  );

  return router;
}
