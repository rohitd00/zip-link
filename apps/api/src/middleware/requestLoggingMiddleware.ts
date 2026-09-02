import type { NextFunction, Request, Response } from "express";
import { logger } from "../observability/logger";

/**
 * Logs exactly one structured line per completed request: method, path
 * (never the query string, since analytics/search requests may carry
 * values a reader should not need to see), status code, duration, and the
 * request ID that ties it to any error response the client received.
 *
 * This deliberately never logs `request.ip`, cookies, or headers — see
 * Rule O-01. The logger's own redaction guard
 * (apps/api/src/observability/logger.ts) is a second, independent layer of
 * protection against a future change accidentally passing one of those in.
 */
export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestStartedAtMilliseconds = Date.now();

  response.on("finish", () => {
    const durationMilliseconds = Date.now() - requestStartedAtMilliseconds;

    logger.info("Handled a request.", {
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMilliseconds,
    });
  });

  next();
}
