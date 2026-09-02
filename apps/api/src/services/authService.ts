import bcrypt from "bcryptjs";
import type { AuthenticatedUserDto } from "@shared/contracts/auth";
import {
  EmailAlreadyInUseError,
  InvalidCredentialsError,
  InvalidOrExpiredTokenError,
  ValidationError,
} from "../domain/applicationErrors";
import {
  validateAndNormalizeDisplayName,
  validateAndNormalizeEmail,
  validatePasswordFormat,
} from "../domain/authValidation";
import { generateToken, hashToken } from "../domain/sessionTokens";
import type { PasswordResetTokenRepository } from "../repositories/passwordResetTokenRepository";
import type { UserRecord, UserRepository } from "../repositories/userRepository";
import { isPostgresUniqueViolation } from "../utils/postgresErrors";
import type { EmailService } from "./emailService";
import type { GoogleOAuthService } from "./googleOAuthService";
import type { CreatedSession, SessionService } from "./sessionService";

const BCRYPT_SALT_ROUNDS = 12;
const PASSWORD_RESET_TOKEN_LIFETIME_MILLISECONDS = 1000 * 60 * 60; // 1 hour

export interface AuthResult {
  user: UserRecord;
  session: CreatedSession;
}

/**
 * Coordinates everything about accounts: signup, login, Google sign-in,
 * and password reset. Deliberately does not touch links at all —
 * `OwnerContext` (see ownerContextMiddleware.ts) is the only place account
 * support connects to the rest of the product, so this service can be
 * read and tested in complete isolation from link/analytics logic.
 */
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionService: SessionService,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly emailService: EmailService,
    private readonly googleOAuthService: GoogleOAuthService | null,
    private readonly dashboardBaseUrl: string,
  ) {}

  async signupWithPassword(
    rawEmail: string,
    rawPassword: string,
    rawDisplayName: string | undefined,
  ): Promise<AuthResult> {
    const email = validateAndNormalizeEmail(rawEmail);
    const password = validatePasswordFormat(rawPassword);
    const displayName = validateAndNormalizeDisplayName(rawDisplayName);

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    let user: UserRecord;

    try {
      user = await this.userRepository.createUserWithPassword({
        email,
        passwordHash,
        displayName,
      });
    } catch (thrownError) {
      if (isPostgresUniqueViolation(thrownError)) {
        throw new EmailAlreadyInUseError();
      }

      throw thrownError;
    }

    const session = await this.sessionService.createSessionForUser(user.id);

    // The welcome email is a nice-to-have, not part of the account being
    // successfully created — EmailService itself never throws, so this
    // can be awaited safely without risking signup failing because email
    // delivery had a problem.
    await this.emailService.sendWelcomeEmail(user.email, user.displayName);

    return { user, session };
  }

  buildGoogleAuthorizationUrl(state: string): string {
    if (this.googleOAuthService === null) {
      throw new ValidationError("Google sign-in is not configured on this server.", []);
    }

    return this.googleOAuthService.buildAuthorizationUrl(state);
  }

  async loginWithPassword(rawEmail: string, rawPassword: string): Promise<AuthResult> {
    const email = validateAndNormalizeEmail(rawEmail);
    const user = await this.userRepository.findByEmail(email);

    // Deliberately the same error, and the same amount of work (still
    // hashing something) whether the account doesn't exist or the
    // password is wrong, so a timing difference can't reveal which one it
    // was — see InvalidCredentialsError's own comment.
    if (user === null || user.passwordHash === null) {
      await bcrypt.compare(rawPassword, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid");
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(rawPassword, user.passwordHash);

    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const session = await this.sessionService.createSessionForUser(user.id);
    return { user, session };
  }

  /**
   * Completes the Google OAuth redirect flow: exchanges the authorization
   * code for a verified Google identity, then either signs into an
   * existing account, links Google to an existing password account with
   * the same (Google-verified) email, or creates a brand-new account.
   */
  async signInWithGoogle(authorizationCode: string): Promise<AuthResult> {
    if (this.googleOAuthService === null) {
      throw new ValidationError("Google sign-in is not configured on this server.", []);
    }

    const googleProfile = await this.googleOAuthService.exchangeCodeForProfile(authorizationCode);

    const existingUserByGoogleId = await this.userRepository.findByGoogleId(googleProfile.googleId);

    if (existingUserByGoogleId !== null) {
      const session = await this.sessionService.createSessionForUser(existingUserByGoogleId.id);
      return { user: existingUserByGoogleId, session };
    }

    const existingUserByEmail = await this.userRepository.findByEmail(googleProfile.email);

    if (existingUserByEmail !== null) {
      // Same person, previously signed up with a password — link the two
      // instead of creating a second, disconnected account for them.
      await this.userRepository.attachGoogleIdToUser(
        existingUserByEmail.id,
        googleProfile.googleId,
        new Date(),
      );
      const refreshedUser = await this.userRepository.findById(existingUserByEmail.id);
      const session = await this.sessionService.createSessionForUser(existingUserByEmail.id);
      return { user: refreshedUser ?? existingUserByEmail, session };
    }

    const newUser = await this.userRepository.createUserWithGoogle({
      email: googleProfile.email,
      googleId: googleProfile.googleId,
      displayName: googleProfile.displayName,
      emailVerifiedAt: new Date(),
    });

    const session = await this.sessionService.createSessionForUser(newUser.id);
    await this.emailService.sendWelcomeEmail(newUser.email, newUser.displayName);

    return { user: newUser, session };
  }

  async logout(rawSessionToken: string): Promise<void> {
    await this.sessionService.destroySessionByRawToken(rawSessionToken);
  }

  /**
   * Always succeeds from the caller's point of view, whether or not the
   * email address belongs to an account — telling the visitor "that email
   * doesn't have an account" would let anyone check which addresses are
   * registered just by trying them here.
   */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    const email = validateAndNormalizeEmail(rawEmail);
    const user = await this.userRepository.findByEmail(email);

    if (user === null) {
      return;
    }

    const { rawToken, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_LIFETIME_MILLISECONDS);

    await this.passwordResetTokenRepository.createToken(tokenHash, user.id, expiresAt);

    const resetUrl = `${this.dashboardBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.emailService.sendPasswordResetEmail(user.email, resetUrl);
  }

  async resetPassword(rawToken: string, rawNewPassword: string): Promise<void> {
    const newPassword = validatePasswordFormat(rawNewPassword);
    const tokenHash = hashToken(rawToken);
    const resetToken = await this.passwordResetTokenRepository.findByTokenHash(tokenHash);

    if (
      resetToken === null ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new InvalidOrExpiredTokenError();
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepository.updatePasswordHash(resetToken.userId, passwordHash);
    await this.passwordResetTokenRepository.markTokenUsed(tokenHash);
  }
}

export function toAuthenticatedUserDto(user: UserRecord): AuthenticatedUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
