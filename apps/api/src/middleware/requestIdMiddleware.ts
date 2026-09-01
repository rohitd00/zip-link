import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Attaches a unique request ID to every incoming request and echoes it back
 * in a response header. Every log line and error response for this request
 * includes the same ID, so a user-reported error can be traced through
 * logs without exposing any internal detail.
 */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = `req_${crypto.randomUUID()}`;
  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
}
