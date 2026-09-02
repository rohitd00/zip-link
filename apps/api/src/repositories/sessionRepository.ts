import type { Pool } from "pg";

export interface SessionRecord {
  userId: string;
  expiresAt: Date;
}

interface SessionDatabaseRow {
  user_id: string;
  expires_at: Date;
}

/**
 * Every method here takes an already-hashed token (SHA-256 hex digest of
 * the raw token the cookie actually holds) — see `services/sessionService.ts`
 * for where that hashing happens. Nothing in this repository ever sees or
 * stores a raw, usable session token.
 */
export class SessionRepository {
  constructor(private readonly databasePool: Pool) {}

  async createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.databasePool.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3);`,
      [tokenHash, userId, expiresAt],
    );
  }

  /**
   * Returns null both when the token is unrecognized and when it has
   * expired — an expired session is not distinguished from a missing one,
   * since both cases mean "not signed in" to every caller.
   */
  async findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const result = await this.databasePool.query<SessionDatabaseRow>(
      `
        SELECT user_id, expires_at
        FROM sessions
        WHERE token_hash = $1
          AND expires_at > now()
        LIMIT 1;
      `,
      [tokenHash],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return { userId: row.user_id, expiresAt: row.expires_at };
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.databasePool.query(`DELETE FROM sessions WHERE token_hash = $1;`, [tokenHash]);
  }
}
