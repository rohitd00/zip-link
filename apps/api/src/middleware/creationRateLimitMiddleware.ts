import type { NextFunction, Request, Response } from "express";
import type { CreationRateLimiter } from "../cache/creationRateLimiter";
import { RateLimitedError } from "../domain/applicationErrors";

/**
 * Applies the creation rate limit to a single route. This must only be
 * attached to POST /api/links, never to the public redirect route — a
 * popular link needs to stay reachable no matter how often it is visited.
 * See Rule API-04 and Rule R-04 in project-rules.md.
 */
export function createCreationRateLimitMiddleware(creationRateLimiter: CreationRateLimiter) {
  return function creationRateLimitMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    if (request.ownerContext === undefined) {
      next(
        new Error(
          "creationRateLimitMiddleware was registered before the owner-context middleware.",
        ),
      );
      return;
    }

    creationRateLimiter
      .checkAndConsume(request.ownerContext)
      .then((result) => {
        if (result.allowed) {
          next();
          return;
        }

        next(
          new RateLimitedError(
            "You've created several links recently. Try again shortly.",
            result.retryAfterSeconds,
          ),
        );
      })
      .catch(next);
  };
}
