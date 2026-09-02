import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import type { Queue } from "bullmq";
import express, { type Express } from "express";
import helmet from "helmet";
import type Redis from "ioredis";
import type { Pool } from "pg";
import { AuthRateLimiter } from "./cache/authRateLimiter";
import { CreationRateLimiter } from "./cache/creationRateLimiter";
import { RedirectCacheRepository } from "./cache/redirectCacheRepository";
import { AnalyticsController } from "./controllers/analyticsController";
import { AuthController } from "./controllers/authController";
import { HealthController } from "./controllers/healthController";
import { LinksController } from "./controllers/linksController";
import { MetricsController } from "./controllers/metricsController";
import { RedirectController } from "./controllers/redirectController";
import { createAuthRateLimitMiddleware } from "./middleware/authRateLimitMiddleware";
import { createCreationRateLimitMiddleware } from "./middleware/creationRateLimitMiddleware";
import { errorHandlerMiddleware } from "./middleware/errorHandlerMiddleware";
import { createOwnerContextMiddleware } from "./middleware/ownerContextMiddleware";
import { requestIdMiddleware } from "./middleware/requestIdMiddleware";
import { requestLoggingMiddleware } from "./middleware/requestLoggingMiddleware";
import { createSessionMiddleware } from "./middleware/sessionMiddleware";
import { ClickEventPublisher } from "./queue/clickEventPublisher";
import { AnalyticsRepository } from "./repositories/analyticsRepository";
import { LinkRepository } from "./repositories/linkRepository";
import { PasswordResetTokenRepository } from "./repositories/passwordResetTokenRepository";
import { RollupCheckpointRepository } from "./repositories/rollupCheckpointRepository";
import { SessionRepository } from "./repositories/sessionRepository";
import { UserRepository } from "./repositories/userRepository";
import { createAuthRoutes } from "./routes/authRoutes";
import { createHealthRoutes } from "./routes/healthRoutes";
import { createLinksRoutes } from "./routes/linksRoutes";
import { createMetricsRoutes } from "./routes/metricsRoutes";
import { createRedirectRoutes } from "./routes/redirectRoutes";
import { AnalyticsService } from "./services/analyticsService";
import { AuthService } from "./services/authService";
import { EmailService } from "./services/emailService";
import { GoogleOAuthService } from "./services/googleOAuthService";
import { LinkService } from "./services/linkService";
import { RedirectService } from "./services/redirectService";
import { SessionService } from "./services/sessionService";

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
  dashboardBaseUrl: string;
  authRateLimitMaxRequests: number;
  authRateLimitWindowSeconds: number;
  googleOAuthClientId: string | null;
  googleOAuthClientSecret: string | null;
  resendApiKey: string | null;
  emailFromAddress: string;
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
  const userRepository = new UserRepository(options.databasePool);
  const sessionRepository = new SessionRepository(options.databasePool);
  const passwordResetTokenRepository = new PasswordResetTokenRepository(options.databasePool);
  const creationRateLimiter = new CreationRateLimiter(
    options.redisClient,
    options.createRateLimitMaxRequests,
    options.createRateLimitWindowSeconds,
  );
  const authRateLimiter = new AuthRateLimiter(
    options.redisClient,
    options.authRateLimitMaxRequests,
    options.authRateLimitWindowSeconds,
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

  const sessionService = new SessionService(sessionRepository);
  const emailService = new EmailService(options.resendApiKey, options.emailFromAddress);

  // Google sign-in is entirely optional: without both a client ID and
  // secret configured, GoogleOAuthService is simply never constructed,
  // and AuthService/AuthController fall back to returning a clear
  // "not configured" error for the two Google-specific routes rather than
  // failing to start at all. This matters most for local development,
  // where nobody should need Google Cloud credentials just to run the app
  // and test email/password sign-in.
  const isGoogleSignInConfigured =
    options.googleOAuthClientId !== null && options.googleOAuthClientSecret !== null;
  const googleOAuthService = isGoogleSignInConfigured
    ? new GoogleOAuthService(
        options.googleOAuthClientId as string,
        options.googleOAuthClientSecret as string,
        `${options.publicBaseUrl}/api/auth/google/callback`,
      )
    : null;

  const authService = new AuthService(
    userRepository,
    sessionService,
    passwordResetTokenRepository,
    emailService,
    googleOAuthService,
    options.dashboardBaseUrl,
  );

  const healthController = new HealthController(options.databasePool, options.redisClient);
  const metricsController = new MetricsController(options.clickEventQueue);
  const linksController = new LinksController(linkService);
  const analyticsController = new AnalyticsController(analyticsService);
  const redirectController = new RedirectController(redirectService, clickEventPublisher);
  const authController = new AuthController(
    authService,
    options.isProductionEnvironment,
    options.dashboardBaseUrl,
    isGoogleSignInConfigured,
  );

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

  // TEMPORARY diagnostic for the TRUST_PROXY_HOPS deployment issue — never
  // exposes the raw IP itself (hop count and a private-range boolean only),
  // to be removed once the correct hop count for this deployment is found.
  app.get("/debug/proxy-info", (request, response) => {
    const rawHeader = request.headers["x-forwarded-for"];
    const headerValue = Array.isArray(rawHeader) ? rawHeader.join(",") : (rawHeader ?? null);
    const hopCount = headerValue === null ? 0 : headerValue.split(",").length;
    const resolvedIp = request.ip ?? null;
    const isPrivateOrUnroutable =
      resolvedIp === null ||
      /^(10\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd|fe80:)/.test(resolvedIp);

    // Same HMAC construction as ipHasher.ts's hashClientIpAddress — reveals
    // only a hash, never the address, so this can be compared against a
    // hash computed locally from a known IP without exposing either one.
    const ipHashSecret = process.env.IP_HASH_SECRET;
    const resolvedIpHash =
      resolvedIp === null || ipHashSecret === undefined
        ? null
        : crypto.createHmac("sha256", ipHashSecret).update(resolvedIp).digest("hex");

    response.json({
      xForwardedForHopCount: hopCount,
      resolvedIpIsPrivateOrUnroutable: isPrivateOrUnroutable,
      trustProxyHopsConfigured: options.trustProxyHops,
      resolvedIpHash,
    });
  });

  // Session lookup runs before owner-context resolution, since a signed-in
  // user's identity (if any) takes priority over the anonymous cookie —
  // see ownerContextMiddleware.ts's own comment on this order.
  app.use(createSessionMiddleware(sessionRepository, userRepository));
  app.use(createOwnerContextMiddleware(options.isProductionEnvironment));

  app.use(createAuthRoutes(authController, createAuthRateLimitMiddleware(authRateLimiter)));
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
