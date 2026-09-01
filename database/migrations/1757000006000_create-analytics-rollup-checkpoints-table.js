// Tracks rollup job progress and observability. See database-schema.md
// Section 11.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE analytics_rollup_checkpoints (
      rollup_name varchar(100) PRIMARY KEY,
      last_successful_started_at timestamptz NULL,
      last_successful_completed_at timestamptz NULL,
      last_processed_event_time timestamptz NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT analytics_rollup_checkpoints_name_not_blank
        CHECK (char_length(trim(rollup_name)) > 0)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS analytics_rollup_checkpoints;`);
};
