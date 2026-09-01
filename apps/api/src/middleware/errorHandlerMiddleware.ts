import type { NextFunction, Request, Response } from "express";
import type { ApplicationErrorResponseBody } from "@shared/contracts/applicationError";
import { ApplicationError, RateLimitedError } from "../domain/applicationErrors";
import { logger } from "../observability/logger";

const ERROR_CODE_TO_HTTP_STATUS: Record<ApplicationError["code"], number> = {
  VALIDATION_ERROR: 400,
  ALIAS_UNAVAILABLE: 409,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  LINK_EXPIRED: 410,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/**
 * The single place that converts a thrown error into an HTTP response.
 * A known ApplicationError maps to its documented status code and a safe
 * message. Anything else is treated as unexpected: it is logged with full
 * detail on the server, but the client only ever receives a generic
 * message and the request ID, never a stack trace or database error text.
 */
export function errorHandlerMiddleware(
  thrownError: unknown,
  request: Request,
  response: Response,
  // Express only recognizes this as error-handling middleware when it
  // declares four parameters, even though `next` is unused here.
  _next: NextFunction,
): void {
  if (thrownError instanceof ApplicationError) {
    const httpStatus = ERROR_CODE_TO_HTTP_STATUS[thrownError.code];

    if (thrownError instanceof RateLimitedError && thrownError.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(thrownError.retryAfterSeconds));
    }

    const responseBody: ApplicationErrorResponseBody = {
      error: {
        code: thrownError.code,
        message: thrownError.message,
        requestId: request.requestId,
        ...(thrownError.details !== undefined ? { details: thrownError.details } : {}),
      },
    };

    response.status(httpStatus).json(responseBody);
    return;
  }

  logger.error("Unhandled error while processing a request.", {
    requestId: request.requestId,
    route: request.path,
    message: thrownError instanceof Error ? thrownError.message : "Unknown error",
  });

  const responseBody: ApplicationErrorResponseBody = {
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      requestId: request.requestId,
    },
  };

  response.status(500).json(responseBody);
}
