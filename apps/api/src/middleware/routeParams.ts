import type { Request } from "express";
import type { OwnerContext } from "@shared/contracts/ownerContext";
import { NotFoundError } from "../domain/applicationErrors";

/**
 * Express types a route parameter as `string | string[]` because some
 * routers allow repeated path segments. Every route in this project uses a
 * single named parameter, so a real request always provides a plain
 * string; this function narrows that type and fails safely if it ever
 * does not.
 */
export function getRequiredRouteParam(request: Request, paramName: string): string {
  const rawValue = request.params[paramName];

  if (typeof rawValue !== "string" || rawValue.length === 0) {
    throw new NotFoundError();
  }

  return rawValue;
}

/**
 * Reads the owner context attached by createOwnerContextMiddleware. Every
 * route that calls this must be registered after that middleware; if it
 * is not, this throws immediately rather than silently treating the
 * request as unauthenticated.
 */
export function requireOwnerContext(request: Request): OwnerContext {
  if (request.ownerContext === undefined) {
    throw new Error(
      "requireOwnerContext was called on a route that is missing the owner-context middleware.",
    );
  }

  return request.ownerContext;
}
