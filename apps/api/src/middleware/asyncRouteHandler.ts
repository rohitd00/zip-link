import type { NextFunction, Request, Response } from "express";

type AsyncRequestHandler = (request: Request, response: Response) => Promise<void>;

/**
 * Wraps an async controller function so a rejected promise is forwarded to
 * Express's error-handling middleware instead of becoming an unhandled
 * rejection. Every route in this project uses this wrapper.
 */
export function asyncRouteHandler(handler: AsyncRequestHandler) {
  return function wrappedHandler(request: Request, response: Response, next: NextFunction): void {
    handler(request, response).catch(next);
  };
}
