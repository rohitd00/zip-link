// This migration creates the partitioned `click_events` table. It is
// intentionally separate from `links` because click data is append-heavy
// and queried by time range, while link data is small and read-heavy.
// See database-schema.md Section 8.
//
// A partitioned table's primary key must include the partition key, so a
// simple UNIQUE(event_id) is not possible here. Idempotency is handled
// instead by the analytics_event_deduplication table created in a later
// migration, inside one transaction with the event insert.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE click_events (
      occurred_at timestamptz NOT NULL,
      event_id uuid NOT NULL,
      link_id bigint NOT NULL,
      short_code varchar(64) NOT NULL,
      referrer text NULL,
      referrer_host varchar(255) NULL,
      device_type click_device_type NOT NULL DEFAULT 'unknown',
      browser_name varchar(128) NULL,
      country_code char(2) NULL,
      country_name varchar(128) NULL,
      city_name varchar(128) NULL,
      ip_hash varchar(128) NULL,
      ip_hash_key_version varchar(32) NULL,
      processed_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT click_events_event_id_not_blank CHECK (event_id IS NOT NULL),
      CONSTRAINT click_events_short_code_not_blank CHECK (char_length(trim(short_code)) > 0),
      CONSTRAINT click_events_ip_hash_pair CHECK (
        (ip_hash IS NULL AND ip_hash_key_version IS NULL)
        OR (ip_hash IS NOT NULL AND ip_hash_key_version IS NOT NULL)
      ),
      CONSTRAINT click_events_country_code_format CHECK (
        country_code IS NULL OR country_code ~ '^[A-Z]{2}$'
      )
    ) PARTITION BY RANGE (occurred_at);
  `);

  pgm.sql(`
    ALTER TABLE click_events
      ADD CONSTRAINT click_events_link_id_foreign_key
      FOREIGN KEY (link_id) REFERENCES links(id)
      ON DELETE RESTRICT;
  `);

  // Create the current month's partition plus two future months, so the
  // worker never fails an insert for lack of a partition during normal
  // development. Production deployments should run the future-partition
  // maintenance script (scripts/create-future-click-event-partitions.ts)
  // well ahead of this horizon running out.
  const monthlyPartitionBoundaries = [
    { name: "click_events_2026_09", from: "2026-09-01 00:00:00+00", to: "2026-10-01 00:00:00+00" },
    { name: "click_events_2026_10", from: "2026-10-01 00:00:00+00", to: "2026-11-01 00:00:00+00" },
    { name: "click_events_2026_11", from: "2026-11-01 00:00:00+00", to: "2026-12-01 00:00:00+00" },
  ];

  for (const partition of monthlyPartitionBoundaries) {
    pgm.sql(`
      CREATE TABLE ${partition.name}
        PARTITION OF click_events
        FOR VALUES FROM ('${partition.from}') TO ('${partition.to}');
    `);

    pgm.sql(`
      CREATE INDEX idx_${partition.name}_link_occurred_at
        ON ${partition.name} (link_id, occurred_at DESC);
    `);

    pgm.sql(`
      CREATE INDEX idx_${partition.name}_short_code_occurred_at
        ON ${partition.name} (short_code, occurred_at DESC);
    `);

    pgm.sql(`
      CREATE INDEX idx_${partition.name}_occurred_at
        ON ${partition.name} (occurred_at DESC);
    `);
  }
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS click_events CASCADE;`);
};
