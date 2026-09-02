import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { OwnerContext } from "@shared/contracts/ownerContext";

export const OWNER_COOKIE_NAME = "owner_id";
const OWNER_COOKIE_MAX_AGE_MILLISECONDS = 1000 * 60 * 60 * 24 * 365; // 1 year

// Express augmentation: every request handler downstream of this
// middleware can read req.ownerContext without re-deriving it.
declare global {
  namespace Express {
    interface Request {
      ownerContext?: OwnerContext;
    }
  }
}

/**
 * Reads the signed owner cookie if one is present and valid, or creates a
 * brand-new anonymous owner identity and sets a fresh signed cookie when
 * one is missing or fails signature verification. This never throws: an
 * invalid cookie is treated the same as a missing one, per Section 5 of
 * app-flow.md.
 *
 * If `sessionMiddleware` (registered before this one, in app.ts) already
 * found a real signed-in user for this request, that takes priority over
 * the anonymous cookie entirely — a signed-in visitor's links use
 * ownerType "authenticated_user" with their real user ID, not their
 * anonymous cookie identity. This is the only place account support
 * touches link ownership: LinkRepository/LinkService/RedirectService never
 * needed to change at all, since they only ever depended on this generic
 * OwnerContext shape.
 */
export function createOwnerContextMiddleware(isProductionEnvironment: boolean) {
  return function ownerContextMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    if (request.authenticatedUser !== undefined) {
      request.ownerContext = {
        ownerType: "authenticated_user",
        ownerId: request.authenticatedUser.id,
      };
      next();
      return;
    }

    const signedCookieValue = request.signedCookies[OWNER_COOKIE_NAME] as string | undefined;

    const ownerId = signedCookieValue ?? crypto.randomUUID();
    const isNewOwnerId = signedCookieValue === undefined;

    if (isNewOwnerId) {
      response.cookie(OWNER_COOKIE_NAME, ownerId, {
        httpOnly: true,
        secure: isProductionEnvironment,
        sameSite: "lax",
        signed: true,
        maxAge: OWNER_COOKIE_MAX_AGE_MILLISECONDS,
      });
    }

    request.ownerContext = {
      ownerType: "anonymous_session",
      ownerId,
    };

    next();
  };
}
