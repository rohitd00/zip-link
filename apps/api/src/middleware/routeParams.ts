import type { Request } from "express";
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
