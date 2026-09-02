import crypto from "node:crypto";

const RAW_TOKEN_BYTE_LENGTH = 32; // 256 bits of randomness

export interface GeneratedToken {
  // The raw token — goes in the cookie (for a session) or the emailed link
  // (for a password reset). Never stored anywhere.
  rawToken: string;
  // SHA-256 hex digest of rawToken — this is what actually gets stored in
  // the database, so a leaked database table alone can never be used to
  // impersonate a session or replay a reset link.
  tokenHash: string;
}

/**
 * Generates a new random, high-entropy token and its hash together, so a
 * caller can never accidentally store the raw value or forget to hash it
 * — see SessionRepository/PasswordResetTokenRepository, which only ever
 * accept a hash, never a raw token.
 */
export function generateToken(): GeneratedToken {
  const rawToken = crypto.randomBytes(RAW_TOKEN_BYTE_LENGTH).toString("hex");
  return { rawToken, tokenHash: hashToken(rawToken) };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
