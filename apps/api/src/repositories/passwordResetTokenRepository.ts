import type { Pool } from "pg";

export interface PasswordResetTokenRecord {
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

interface PasswordResetTokenDatabaseRow {
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}

/**
 * Like SessionRepository, every method here takes an already-hashed token
 * — the raw token only ever exists in the emailed link and briefly in
 * memory while handling that request, never persisted.
 */
export class PasswordResetTokenRepository {
  constructor(private readonly databasePool: Pool) {}

  async createToken(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.databasePool.query(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3);`,
      [tokenHash, userId, expiresAt],
    );
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const result = await this.databasePool.query<PasswordResetTokenDatabaseRow>(
      `SELECT user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1;`,
      [tokenHash],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return { userId: row.user_id, expiresAt: row.expires_at, usedAt: row.used_at };
  }

  /**
   * Marks a token used rather than deleting it, so a second attempt to
   * reuse the same reset link (for example, a visitor clicking an old
   * email link twice) can be told exactly why it no longer works instead
   * of just "not found."
   */
  async markTokenUsed(tokenHash: string): Promise<void> {
    await this.databasePool.query(
      `UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1;`,
      [tokenHash],
    );
  }
}
