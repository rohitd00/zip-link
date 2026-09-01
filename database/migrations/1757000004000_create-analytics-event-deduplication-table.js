// This table lets the worker safely retry a job without creating a second
// click event for the same eventId. See database-schema.md Section 9.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE analytics_event_deduplication (
      event_id uuid PRIMARY KEY,
      occurred_at timestamptz NOT NULL,
      link_id bigint NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      persisted_at timestamptz NULL,

      CONSTRAINT analytics_event_deduplication_link_id_foreign_key
        FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE RESTRICT
    );
  `);

  pgm.sql(`
    CREATE INDEX idx_analytics_event_deduplication_occurred_at
      ON analytics_event_deduplication (occurred_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS analytics_event_deduplication;`);
};
