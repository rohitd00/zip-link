// Adds real user accounts (email/password and Google OAuth) alongside the
// existing anonymous-session ownership model. See database-schema.md and
// docs/10-system-design.md for the full reasoning. `owner_type` already
// had an `authenticated_user` value reserved for exactly this from the
// original schema design (1757000001000_create-enums.js), so `links` and
// every query that scopes by (owner_type, owner_id) needs no changes at
// all — a signed-in user's links simply use owner_type =
// 'authenticated_user' and owner_id = their users.id (as text), the same
// generic shape anonymous links already use.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email varchar(320) NOT NULL,
      password_hash text NULL,
      google_id varchar(255) NULL,
      display_name varchar(200) NULL,
      email_verified_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT users_email_unique UNIQUE (email),
      CONSTRAINT users_google_id_unique UNIQUE (google_id),
      CONSTRAINT users_email_not_blank CHECK (char_length(trim(email)) > 0),
      -- A user must be able to actually sign in somehow: either a password
      -- was set, or a Google account is linked. Both may be present at
      -- once (an account created via Google could later add a password).
      CONSTRAINT users_has_login_method
        CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
    );
  `);

  pgm.sql(`
    CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  `);

  // Sessions store a SHA-256 hash of the random token that actually lives
  // in the signed cookie, never the raw token itself — the same reasoning
  // as hashing IP addresses before storage: if this table were ever
  // exposed, the hashes alone cannot be used to impersonate a session, and
  // the cookie is also independently signed, so a corrupted or forged
  // token is rejected before it would even reach a database lookup.
  pgm.sql(`
    CREATE TABLE sessions (
      token_hash varchar(64) PRIMARY KEY,
      user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,

      CONSTRAINT sessions_expires_after_creation CHECK (expires_at > created_at)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_sessions_user_id ON sessions (user_id);
  `);

  pgm.sql(`
    CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
  `);

  // Same hashed-token pattern for password-reset links: the emailed link
  // contains the raw token, only its hash is ever persisted.
  pgm.sql(`
    CREATE TABLE password_reset_tokens (
      token_hash varchar(64) PRIMARY KEY,
      user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz NULL,

      CONSTRAINT password_reset_tokens_expires_after_creation CHECK (expires_at > created_at)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS password_reset_tokens;`);
  pgm.sql(`DROP TABLE IF EXISTS sessions;`);
  pgm.sql(`DROP TRIGGER IF EXISTS users_set_updated_at ON users;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
};
