// This migration creates the durable `links` table using the final Release
// 1 DDL from database-schema.md Section 7.5: case-sensitive short codes (no
// citext), because a case-insensitive comparison would collide base62
// values such as "a" and "A" and shrink the usable code space.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE links (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      short_code varchar(64) NOT NULL,
      long_url text NOT NULL,
      normalized_long_url text NOT NULL,
      owner_type owner_type NOT NULL,
      owner_id text NOT NULL,
      redirect_status_code smallint NOT NULL DEFAULT 302,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NULL,
      deleted_at timestamptz NULL,
      is_custom_alias boolean NOT NULL DEFAULT false,

      CONSTRAINT links_short_code_unique UNIQUE (short_code),
      CONSTRAINT links_short_code_not_blank CHECK (char_length(trim(short_code)) > 0),
      CONSTRAINT links_long_url_not_blank CHECK (char_length(trim(long_url)) > 0),
      CONSTRAINT links_normalized_long_url_not_blank CHECK (char_length(trim(normalized_long_url)) > 0),
      CONSTRAINT links_owner_id_not_blank CHECK (char_length(trim(owner_id)) > 0),
      CONSTRAINT links_redirect_status_code_valid CHECK (redirect_status_code IN (301, 302)),
      CONSTRAINT links_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_links_owner_created_at
      ON links (owner_type, owner_id, created_at DESC, id DESC)
      WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX idx_links_owner_normalized_url
      ON links (owner_type, owner_id, normalized_long_url)
      WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX idx_links_active_expiry
      ON links (expires_at)
      WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_row_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$;
  `);

  pgm.sql(`
    CREATE TRIGGER links_set_updated_at
    BEFORE UPDATE ON links
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TRIGGER IF EXISTS links_set_updated_at ON links;`);
  pgm.sql(`DROP FUNCTION IF EXISTS set_row_updated_at;`);
  pgm.sql(`DROP TABLE IF EXISTS links;`);
};
