import { OAuth2Client } from "google-auth-library";

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

/**
 * Wraps Google's standard OAuth 2.0 authorization-code flow using Google's
 * own official client library only for the one genuinely fiddly part —
 * verifying an ID token's signature against Google's rotating public keys
 * (`OAuth2Client.verifyIdToken`). Everything else (building the
 * authorization URL, exchanging the code) is a thin wrapper so the rest of
 * this codebase never has to think about OAuth request/response shapes
 * directly.
 */
export class GoogleOAuthService {
  private readonly oAuth2Client: OAuth2Client;

  constructor(
    private readonly clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
    this.oAuth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  /**
   * `state` is a random, single-use value the caller generates and stores
   * (for example, in a short-lived signed cookie) before redirecting here,
   * then checks matches on the way back — the standard OAuth defense
   * against cross-site request forgery on the login flow itself.
   */
  buildAuthorizationUrl(state: string): string {
    return this.oAuth2Client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
    });
  }

  /**
   * Exchanges a one-time authorization code (from Google's redirect back
   * to our callback route) for the visitor's verified Google identity.
   * Throws if the code is invalid/expired or the token fails signature
   * verification — the caller is expected to treat that as a failed
   * sign-in attempt, not retry it.
   */
  async exchangeCodeForProfile(authorizationCode: string): Promise<GoogleProfile> {
    const { tokens } = await this.oAuth2Client.getToken(authorizationCode);

    if (tokens.id_token === undefined || tokens.id_token === null) {
      throw new Error("Google did not return an ID token for this authorization code.");
    }

    const ticket = await this.oAuth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.clientId,
    });

    const payload = ticket.getPayload();

    if (payload === undefined || payload.email === undefined) {
      throw new Error("Google's ID token did not include the expected profile fields.");
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      displayName: payload.name ?? null,
    };
  }
}
