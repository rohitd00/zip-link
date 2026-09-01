// This migration creates the small, stable enumerated types used across the
// schema. See database-schema.md Section 6.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE owner_type AS ENUM (
      'anonymous_session',
      'authenticated_user'
    );
  `);

  pgm.sql(`
    CREATE TYPE click_device_type AS ENUM (
      'desktop',
      'mobile',
      'tablet',
      'bot',
      'unknown'
    );
  `);

  pgm.sql(`
    CREATE TYPE analytics_bucket_granularity AS ENUM (
      'hour',
      'day'
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TYPE IF EXISTS analytics_bucket_granularity;`);
  pgm.sql(`DROP TYPE IF EXISTS click_device_type;`);
  pgm.sql(`DROP TYPE IF EXISTS owner_type;`);
};
