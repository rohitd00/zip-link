import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { InvalidOrExpiredTokenError } from "../domain/applicationErrors";
import { PasswordResetTokenRepository } from "../repositories/passwordResetTokenRepository";
import { UserRepository } from "../repositories/userRepository";
import { SessionRepository } from "../repositories/sessionRepository";
import { createTestDatabasePool, truncateAllTestData } from "../testSupport/testDatabasePool";
import type { EmailMessage } from "./emailService";
import { AuthService } from "./authService";
import { SessionService } from "./sessionService";

let pool: Pool;
let authService: AuthService;
let capturedEmails: EmailMessage[];

beforeAll(() => {
  pool = createTestDatabasePool();

  const userRepository = new UserRepository(pool);
  const sessionService = new SessionService(new SessionRepository(pool));
  const passwordResetTokenRepository = new PasswordResetTokenRepository(pool);

  capturedEmails = [];
  // A minimal stand-in for EmailService that records what would have been
  // sent instead of actually sending it, so this test can recover the raw
  // reset token from the email body — the one place it ever appears,
  // since only its hash is ever persisted (see PasswordResetTokenRepository).
  const fakeEmailService = {
    send: async (message: EmailMessage) => {
      capturedEmails.push(message);
    },
    sendWelcomeEmail: async () => {},
    sendPasswordResetEmail: async (toAddress: string, resetUrl: string) => {
      capturedEmails.push({
        to: toAddress,
        subject: "Reset your ZipLink password",
        html: resetUrl,
      });
    },
  };

  authService = new AuthService(
    userRepository,
    sessionService,
    passwordResetTokenRepository,
    fakeEmailService as never,
    null,
    "https://dashboard.test",
  );
});

afterEach(async () => {
  await truncateAllTestData(pool);
  capturedEmails = [];
});

afterAll(async () => {
  await pool.end();
});

function extractTokenFromResetUrl(resetUrl: string): string {
  const url = new URL(resetUrl);
  const token = url.searchParams.get("token");

  if (token === null) {
    throw new Error(`Expected a token query parameter in reset URL: ${resetUrl}`);
  }

  return token;
}

describe("AuthService password reset", () => {
  it("lets a user reset their password with a valid token, and the new password works", async () => {
    await authService.signupWithPassword("reset-test@example.com", "original-password", undefined);
    capturedEmails = [];

    await authService.requestPasswordReset("reset-test@example.com");
    expect(capturedEmails).toHaveLength(1);

    const rawToken = extractTokenFromResetUrl(capturedEmails[0]?.html ?? "");
    await authService.resetPassword(rawToken, "brand-new-password");

    // The old password no longer works...
    await expect(
      authService.loginWithPassword("reset-test@example.com", "original-password"),
    ).rejects.toThrow();

    // ...but the new one does.
    const loginResult = await authService.loginWithPassword(
      "reset-test@example.com",
      "brand-new-password",
    );
    expect(loginResult.user.email).toBe("reset-test@example.com");
  });

  it("rejects reusing the same reset token twice", async () => {
    await authService.signupWithPassword("reset-reuse@example.com", "original-password", undefined);
    capturedEmails = [];

    await authService.requestPasswordReset("reset-reuse@example.com");
    const rawToken = extractTokenFromResetUrl(capturedEmails[0]?.html ?? "");

    await authService.resetPassword(rawToken, "first-new-password");

    await expect(authService.resetPassword(rawToken, "second-new-password")).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });

  it("rejects an unrecognized token", async () => {
    await expect(
      authService.resetPassword("this-token-was-never-issued", "some-new-password"),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it("does not send an email or throw when the address has no account", async () => {
    await expect(
      authService.requestPasswordReset("nobody-has-this-email@example.com"),
    ).resolves.toBeUndefined();
    expect(capturedEmails).toHaveLength(0);
  });
});
