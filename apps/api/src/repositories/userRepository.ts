import type { Pool } from "pg";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserDatabaseRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  display_name: string | null;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserWithPasswordInput {
  email: string;
  passwordHash: string;
  displayName: string | null;
}

export interface CreateUserWithGoogleInput {
  email: string;
  googleId: string;
  displayName: string | null;
  // A Google sign-in only ever reaches this repository after Google's own
  // token verification already confirmed the address, so this project
  // trusts it as verified immediately — no separate email-verification
  // step for Google accounts.
  emailVerifiedAt: Date;
}

/**
 * Every query here is parameterized; nothing user-supplied is concatenated
 * into SQL. `email` is stored and looked up already lowercased/trimmed —
 * see `domain/authValidation.ts`'s `validateAndNormalizeEmail`, which every
 * caller of this repository is expected to have already run.
 */
export class UserRepository {
  constructor(private readonly databasePool: Pool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.databasePool.query<UserDatabaseRow>(
      `SELECT * FROM users WHERE email = $1 LIMIT 1;`,
      [email],
    );

    return mapRowToUser(result.rows[0]);
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const result = await this.databasePool.query<UserDatabaseRow>(
      `SELECT * FROM users WHERE id = $1 LIMIT 1;`,
      [userId],
    );

    return mapRowToUser(result.rows[0]);
  }

  async findByGoogleId(googleId: string): Promise<UserRecord | null> {
    const result = await this.databasePool.query<UserDatabaseRow>(
      `SELECT * FROM users WHERE google_id = $1 LIMIT 1;`,
      [googleId],
    );

    return mapRowToUser(result.rows[0]);
  }

  /**
   * A unique-constraint violation on `email` is expected to be caught by
   * the caller and mapped to `EmailAlreadyInUseError`; this method does
   * not swallow that error.
   */
  async createUserWithPassword(input: CreateUserWithPasswordInput): Promise<UserRecord> {
    const result = await this.databasePool.query<UserDatabaseRow>(
      `
        INSERT INTO users (email, password_hash, display_name)
        VALUES ($1, $2, $3)
        RETURNING *;
      `,
      [input.email, input.passwordHash, input.displayName],
    );

    return mapRowToUserOrThrow(result.rows[0]);
  }

  async createUserWithGoogle(input: CreateUserWithGoogleInput): Promise<UserRecord> {
    const result = await this.databasePool.query<UserDatabaseRow>(
      `
        INSERT INTO users (email, google_id, display_name, email_verified_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `,
      [input.email, input.googleId, input.displayName, input.emailVerifiedAt],
    );

    return mapRowToUserOrThrow(result.rows[0]);
  }

  /**
   * Links a Google account to an existing email/password account that
   * happens to share the same (already-verified-by-Google) email address,
   * so the same person doesn't end up with two separate accounts just
   * because they used a different sign-in method the second time.
   */
  async attachGoogleIdToUser(
    userId: string,
    googleId: string,
    emailVerifiedAt: Date,
  ): Promise<void> {
    await this.databasePool.query(
      `
        UPDATE users
        SET google_id = $2, email_verified_at = COALESCE(email_verified_at, $3)
        WHERE id = $1;
      `,
      [userId, googleId, emailVerifiedAt],
    );
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.databasePool.query(`UPDATE users SET password_hash = $2 WHERE id = $1;`, [
      userId,
      passwordHash,
    ]);
  }
}

function mapRowToUser(row: UserDatabaseRow | undefined): UserRecord | null {
  if (row === undefined) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    displayName: row.display_name,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToUserOrThrow(row: UserDatabaseRow | undefined): UserRecord {
  const user = mapRowToUser(row);

  if (user === null) {
    throw new Error("Expected a user row back from an INSERT ... RETURNING but got none.");
  }

  return user;
}
