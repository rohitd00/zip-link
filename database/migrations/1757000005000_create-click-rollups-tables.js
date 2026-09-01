// This migration creates the rebuildable rollup tables used to keep large
// dashboard analytics queries fast. See database-schema.md Section 10.
// These tables are not populated until the Phase 5 rollup scheduler is
// implemented; they exist now so the schema is complete from the start.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE click_rollups_time (
      link_id bigint NOT NULL,
      bucket_granularity analytics_bucket_granularity NOT NULL,
      bucket_start timestamptz NOT NULL,
      click_count bigint NOT NULL,
      calculated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT click_rollups_time_pkey
        PRIMARY KEY (link_id, bucket_granularity, bucket_start),
      CONSTRAINT click_rollups_time_link_id_foreign_key
        FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE RESTRICT,
      CONSTRAINT click_rollups_time_count_non_negative
        CHECK (click_count >= 0)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_click_rollups_time_bucket
      ON click_rollups_time (bucket_granularity, bucket_start DESC);
  `);

  pgm.sql(`
    CREATE TABLE click_rollups_referrer (
      link_id bigint NOT NULL,
      bucket_granularity analytics_bucket_granularity NOT NULL,
      bucket_start timestamptz NOT NULL,
      referrer_host varchar(255) NULL,
      click_count bigint NOT NULL,
      calculated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT click_rollups_referrer_unique
        UNIQUE NULLS NOT DISTINCT (link_id, bucket_granularity, bucket_start, referrer_host),
      CONSTRAINT click_rollups_referrer_link_id_foreign_key
        FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE RESTRICT,
      CONSTRAINT click_rollups_referrer_count_non_negative CHECK (click_count >= 0)
    );
  `);

  pgm.sql(`
    CREATE TABLE click_rollups_device (
      link_id bigint NOT NULL,
      bucket_granularity analytics_bucket_granularity NOT NULL,
      bucket_start timestamptz NOT NULL,
      device_type click_device_type NOT NULL,
      click_count bigint NOT NULL,
      calculated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT click_rollups_device_pkey
        PRIMARY KEY (link_id, bucket_granularity, bucket_start, device_type),
      CONSTRAINT click_rollups_device_link_id_foreign_key
        FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE RESTRICT,
      CONSTRAINT click_rollups_device_count_non_negative CHECK (click_count >= 0)
    );
  `);

  pgm.sql(`
    CREATE TABLE click_rollups_browser (
      link_id bigint NOT NULL,
      bucket_granularity analytics_bucket_granularity NOT NULL,
      bucket_start timestamptz NOT NULL,
      browser_name varchar(128) NULL,
      click_count bigint NOT NULL,
      calculated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT click_rollups_browser_unique
        UNIQUE NULLS NOT DISTINCT (link_id, bucket_granularity, bucket_start, browser_name),
      CONSTRAINT click_rollups_browser_link_id_foreign_key
        FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE RESTRICT,
      CONSTRAINT click_rollups_browser_count_non_negative CHECK (click_count >= 0)
    );
  `);

  pgm.sql(`
    CREATE TABLE click_rollups_geography (
      link_id bigint NOT NULL,
      bucket_granularity analytics_bucket_granularity NOT NULL,
      bucket_start timestamptz NOT NULL,
      country_code char(2) NULL,
      country_name varchar(128) NULL,
      city_name varchar(128) NULL,
      click_count bigint NOT NULL,
      calculated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT click_rollups_geography_unique
        UNIQUE NULLS NOT DISTINCT (
          link_id, bucket_granularity, bucket_start, country_code, city_name
        ),
      CONSTRAINT click_rollups_geography_link_id_foreign_key
        FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE RESTRICT,
      CONSTRAINT click_rollups_geography_count_non_negative CHECK (click_count >= 0)
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_click_rollups_referrer_link_bucket
      ON click_rollups_referrer (link_id, bucket_granularity, bucket_start DESC);
  `);

  pgm.sql(`
    CREATE INDEX idx_click_rollups_device_link_bucket
      ON click_rollups_device (link_id, bucket_granularity, bucket_start DESC);
  `);

  pgm.sql(`
    CREATE INDEX idx_click_rollups_browser_link_bucket
      ON click_rollups_browser (link_id, bucket_granularity, bucket_start DESC);
  `);

  pgm.sql(`
    CREATE INDEX idx_click_rollups_geography_link_bucket
      ON click_rollups_geography (link_id, bucket_granularity, bucket_start DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS click_rollups_geography;`);
  pgm.sql(`DROP TABLE IF EXISTS click_rollups_browser;`);
  pgm.sql(`DROP TABLE IF EXISTS click_rollups_device;`);
  pgm.sql(`DROP TABLE IF EXISTS click_rollups_referrer;`);
  pgm.sql(`DROP TABLE IF EXISTS click_rollups_time;`);
};
