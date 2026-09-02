import type { NextFunction, Request, Response } from "express";
import type { AuthRateLimiter } from "../cache/authRateLimiter";
import { RateLimitedError } from "../domain/applicationErrors";

/**
 * Applies the auth rate limit to a single route (login and signup). Same
 * shape as creationRateLimitMiddleware.ts, kept separate because it wraps
 * a different limiter with a different Redis keyspace — see
 * AuthRateLimiter's own comment for why it isn't just the same limiter
 * reused.
 */
export function createAuthRateLimitMiddleware(authRateLimiter: AuthRateLimiter) {
  return function authRateLimitMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    if (request.ownerContext === undefined) {
      next(
        new Error("authRateLimitMiddleware was registered before the owner-context middleware."),
      );
      return;
    }

    authRateLimiter
      .checkAndConsume(request.ownerContext)
      .then((result) => {
        if (result.allowed) {
          next();
          return;
        }

        next(
          new RateLimitedError("Too many attempts. Try again shortly.", result.retryAfterSeconds),
        );
      })
      .catch(next);
  };
}
