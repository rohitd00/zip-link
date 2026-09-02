import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { CurrentUserResponseData } from "@shared/contracts/auth";
import { ValidationError } from "../domain/applicationErrors";
import { buildSessionCookieOptions, SESSION_COOKIE_NAME } from "../middleware/sessionMiddleware";
import type { AuthResult } from "../services/authService";
import { AuthService, toAuthenticatedUserDto } from "../services/authService";
import {
  parseLoginRequestBody,
  parseRequestPasswordResetRequestBody,
  parseResetPasswordRequestBody,
  parseSignupRequestBody,
} from "../validation/authRequestValidation";

const GOOGLE_OAUTH_STATE_COOKIE_NAME = "google_oauth_state";
const GOOGLE_OAUTH_STATE_COOKIE_MAX_AGE_MILLISECONDS = 1000 * 60 * 10; // 10 minutes

/**
 * The HTTP-facing handlers for /api/auth. Like LinksController, these only
 * parse the request, call AuthService, and translate the result into a
 * response (setting/clearing the session cookie) — the actual account
 * rules all live in AuthService, per Rule C-03.
 */
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly isProductionEnvironment: boolean,
    private readonly dashboardBaseUrl: string,
    private readonly isGoogleSignInConfigured: boolean,
  ) {}

  async signup(request: Request, response: Response): Promise<void> {
    const body = parseSignupRequestBody(request.body);
    const result = await this.authService.signupWithPassword(
      body.email,
      body.password,
      body.displayName,
    );

    this.respondWithNewSession(response, result, 201);
  }

  async login(request: Request, response: Response): Promise<void> {
    const body = parseLoginRequestBody(request.body);
    const result = await this.authService.loginWithPassword(body.email, body.password);

    this.respondWithNewSession(response, result, 200);
  }

  async logout(request: Request, response: Response): Promise<void> {
    const rawSessionToken = request.signedCookies[SESSION_COOKIE_NAME] as string | undefined;

    if (rawSessionToken !== undefined) {
      await this.authService.logout(rawSessionToken);
    }

    response.clearCookie(SESSION_COOKIE_NAME);
    response.status(204).send();
  }

  getCurrentUser(request: Request, response: Response): void {
    const responseData: CurrentUserResponseData = {
      user:
        request.authenticatedUser === undefined
          ? null
          : toAuthenticatedUserDto(request.authenticatedUser),
      googleSignInEnabled: this.isGoogleSignInConfigured,
    };

    response.status(200).json({ data: responseData });
  }

  /**
   * Starts the Google OAuth flow: sets a short-lived, single-use `state`
   * value (the standard OAuth CSRF defense — see GoogleOAuthService's own
   * comment) and redirects the browser to Google's own consent screen.
   */
  startGoogleSignIn(_request: Request, response: Response): void {
    if (!this.isGoogleSignInConfigured) {
      throw new ValidationError("Google sign-in is not configured on this server.", []);
    }

    const state = crypto.randomBytes(32).toString("hex");

    response.cookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: this.isProductionEnvironment,
      sameSite: "lax",
      signed: true,
      maxAge: GOOGLE_OAUTH_STATE_COOKIE_MAX_AGE_MILLISECONDS,
    });

    const authorizationUrl = this.authService.buildGoogleAuthorizationUrl(state);
    response.redirect(authorizationUrl);
  }

  /**
   * Handles Google's redirect back after the visitor approves (or denies)
   * access. On any failure — a missing/mismatched state, a denied
   * consent, an invalid code — this redirects back to the dashboard's own
   * login page with an error flag rather than showing a raw API error
   * page, since a real visitor's browser lands here directly.
   */
  async handleGoogleCallback(request: Request, response: Response): Promise<void> {
    response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE_NAME);

    const expectedState = request.signedCookies[GOOGLE_OAUTH_STATE_COOKIE_NAME] as
      string | undefined;
    const receivedState = typeof request.query.state === "string" ? request.query.state : null;
    const authorizationCode = typeof request.query.code === "string" ? request.query.code : null;

    const stateIsValid =
      expectedState !== undefined && receivedState !== null && expectedState === receivedState;

    if (!stateIsValid || authorizationCode === null) {
      response.redirect(`${this.dashboardBaseUrl}/login?error=google_sign_in_failed`);
      return;
    }

    try {
      const result = await this.authService.signInWithGoogle(authorizationCode);
      this.setSessionCookie(response, result);
      response.redirect(`${this.dashboardBaseUrl}/dashboard`);
    } catch {
      response.redirect(`${this.dashboardBaseUrl}/login?error=google_sign_in_failed`);
    }
  }

  async requestPasswordReset(request: Request, response: Response): Promise<void> {
    const body = parseRequestPasswordResetRequestBody(request.body);
    await this.authService.requestPasswordReset(body.email);

    // Always 202 regardless of whether the email matched an account —
    // see AuthService.requestPasswordReset's own comment on why.
    response.status(202).json({
      data: { message: "If that email has an account, a reset link has been sent." },
    });
  }

  async resetPassword(request: Request, response: Response): Promise<void> {
    const body = parseResetPasswordRequestBody(request.body);
    await this.authService.resetPassword(body.token, body.newPassword);

    response.status(200).json({ data: { message: "Your password has been reset." } });
  }

  private respondWithNewSession(response: Response, result: AuthResult, httpStatus: number): void {
    this.setSessionCookie(response, result);
    response.status(httpStatus).json({ data: { user: toAuthenticatedUserDto(result.user) } });
  }

  private setSessionCookie(response: Response, result: AuthResult): void {
    response.cookie(
      SESSION_COOKIE_NAME,
      result.session.rawToken,
      buildSessionCookieOptions(this.isProductionEnvironment, result.session.expiresAt),
    );
  }
}
