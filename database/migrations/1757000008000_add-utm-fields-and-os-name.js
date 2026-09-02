// Adds UTM campaign-tracking fields to `links` (captured once, from the
// long URL's own query string, at creation time — never changes afterward)
// and an operating-system column to `click_events` (parsed from the same
// User-Agent header the worker already reads for device/browser, so this
// is a new field on existing enrichment work, not a new enrichment step).

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE links
      ADD COLUMN utm_source varchar(255) NULL,
      ADD COLUMN utm_medium varchar(255) NULL,
      ADD COLUMN utm_campaign varchar(255) NULL;
  `);

  pgm.sql(`
    ALTER TABLE click_events
      ADD COLUMN os_name varchar(128) NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE links
      DROP COLUMN IF EXISTS utm_source,
      DROP COLUMN IF EXISTS utm_medium,
      DROP COLUMN IF EXISTS utm_campaign;
  `);

  pgm.sql(`
    ALTER TABLE click_events
      DROP COLUMN IF EXISTS os_name;
  `);
};
