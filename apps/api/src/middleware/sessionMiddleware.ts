import type { NextFunction, Request, Response } from "express";
import { hashToken } from "../domain/sessionTokens";
import { logger } from "../observability/logger";
import type { SessionRepository } from "../repositories/sessionRepository";
import type { UserRecord, UserRepository } from "../repositories/userRepository";

export const SESSION_COOKIE_NAME = "session_id";

/**
 * The exact cookie options used everywhere the session cookie is set or
 * cleared (login, signup, the Google callback, logout) — centralized here
 * so all four call sites stay consistent by construction rather than by
 * remembering to copy the same object each time.
 */
export function buildSessionCookieOptions(
  isProductionEnvironment: boolean,
  expiresAt: Date,
): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  signed: true;
  expires: Date;
} {
  return {
    httpOnly: true,
    secure: isProductionEnvironment,
    sameSite: "lax",
    signed: true,
    expires: expiresAt,
  };
}

// Express augmentation: every request handler downstream of this
// middleware can read req.authenticatedUser without re-deriving it. This
// is set independently of req.ownerContext (see ownerContextMiddleware.ts)
// — a handler that only cares "who owns this link" reads ownerContext; a
// handler that specifically needs the signed-in user's own profile (for
// example, GET /api/auth/me) reads this instead.
declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: UserRecord;
    }
  }
}

/**
 * Reads the signed session cookie, if present, and — only if it points at
 * a real, unexpired session row — attaches the signed-in user to the
 * request. A missing, invalid, or expired session is treated exactly like
 * no session at all: this middleware never throws and never blocks the
 * request, since most routes in this project work fine for a signed-out
 * visitor (Rule: anonymous access stays fully supported, per the
 * accounts-are-additive design decision).
 */
export function createSessionMiddleware(
  sessionRepository: SessionRepository,
  userRepository: UserRepository,
) {
  return async function sessionMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const rawSessionToken = request.signedCookies[SESSION_COOKIE_NAME] as string | undefined;

      if (rawSessionToken === undefined) {
        next();
        return;
      }

      const tokenHash = hashToken(rawSessionToken);
      const session = await sessionRepository.findActiveSessionByTokenHash(tokenHash);

      if (session === null) {
        next();
        return;
      }

      const user = await userRepository.findById(session.userId);

      if (user !== null) {
        request.authenticatedUser = user;
      }

      next();
    } catch (thrownError) {
      // A database error while checking a session must not take down the
      // whole request — proceed as signed-out (never as an unverified
      // "signed in," which would be the unsafe direction to fail in) and
      // let the rest of the request continue normally. This mirrors the
      // fail-open pattern already used for the Redis-backed redirect
      // cache and rate limiter elsewhere in this codebase.
      logger.error("Session lookup failed; continuing as signed-out.", {
        errorMessage: thrownError instanceof Error ? thrownError.message : "Unknown error",
      });
      next();
    }
  };
}
