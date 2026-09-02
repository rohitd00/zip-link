# Database Schema Specification

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | ZipLink |
| Document | Database Schema Specification |
| Version | 1.0 |
| Database | PostgreSQL 16+ recommended |
| Related documents | `01-prd.md`, `02-technical-specification.md`, `03-app-flow.md` |

## 2. Purpose

This document defines the durable relational data model for short links and click analytics. It separates low-volume link metadata from high-volume click events, makes lifecycle and ownership rules enforceable, and provides an incremental path from raw analytics events to efficient time-bucket rollups.

PostgreSQL is the source of truth. Redis stores derived redirect cache records and BullMQ job state, and therefore does not replace any table described here.

## 3. Schema Principles

1. **Links and clicks have different workloads.** Link records are small and frequently read. Click events are append-heavy and queried by time range. They must not share one overloaded table.
2. **The database enforces critical correctness.** Application validation improves feedback; primary keys, unique constraints, foreign keys, checks, and indexes preserve integrity under concurrency.
3. **Timestamps are UTC.** Store all instants as `timestamptz`. The application accepts/returns ISO-8601 and converts for presentation only.
4. **Deletion is soft for links.** A deleted link stops redirecting but can retain historical analytics and avoid accidental alias reuse.
5. **Raw IP addresses are never stored.** Analytics stores only an HMAC-derived hash plus key version, after enrichment.
6. **Events are idempotent.** Every queued click has a globally unique event ID constrained in storage, so worker retries do not double count.
7. **Analytics queries are bounded.** Time partitioning, indexes, range limits, and rollups prevent dashboard requests from scanning unbounded event history.
8. **Readable and explicit SQL wins.** Migrations use descriptive names, clear statements, and comments for non-obvious decisions.

## 4. Logical Entity Map

```text
owner contexts (logical abstraction)
          |
          | owns
          v
       links 1 ------------------------ * click_events
          |                                      |
          |                                      | summarized into
          |                                      v
          +------------------------------- click_rollups
                                                 |
                                                 v
                                     analytics_rollup_checkpoints
```

`owner contexts` is initially represented directly by `owner_type` and `owner_id` columns on `links`. A separate owners/users table is deliberately not required for anonymous-session Release 1. If authentication is added later, a users table may become an authoritative source for owner IDs without changing the link ownership shape.

## 5. PostgreSQL Extensions and Conventions

### 5.1 Recommended extensions

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Usage:

- `citext` supports case-insensitive short-code uniqueness and lookup for custom aliases. This prevents `Summer` and `summer` from resolving as different aliases.
- `pgcrypto` is optional for database-side UUID generation. The recommended event ID source is the API process, but the extension is useful for migration/maintenance operations.

### 5.2 Naming conventions

| Item | Convention | Example |
| --- | --- | --- |
| Tables | plural `snake_case` | `click_events` |
| Columns | `snake_case` | `created_at` |
| PKs | `id` unless natural compound key is intentional | `links.id` |
| FK columns | singular table name + `_id` | `link_id` |
| Indexes | `idx_{table}_{purpose}` | `idx_links_owner_created_at` |
| Constraints | `{table}_{column/purpose}_{suffix}` | `links_short_code_unique` |
| Timestamps | `*_at` and `timestamptz` | `expires_at` |
| Booleans | `is_` / `has_` where a boolean is truly needed | `is_aggregate_complete` |

### 5.3 General field rules

- Identifiers are `bigint` for link IDs and `uuid` for click event IDs.
- `timestamptz` is used for creation, deletion, expiry, event time, and rollup/checkpoint times.
- All new table columns should have a deliberate `NULL`/`NOT NULL` decision; nullable fields mean “unknown or not applicable,” not “we did not decide.”
- Avoid storing derived values unless they are a necessary optimization. Link state is derived from `deleted_at` and `expires_at`.

## 6. Enumerated Types

Use PostgreSQL enums only where the values are stable and small. Device types and owner types meet that criterion.

```sql
CREATE TYPE owner_type AS ENUM (
  'anonymous_session',
  'authenticated_user'
);

CREATE TYPE click_device_type AS ENUM (
  'desktop',
  'mobile',
  'tablet',
  'bot',
  'unknown'
);

CREATE TYPE analytics_bucket_granularity AS ENUM (
  'hour',
  'day'
);
```

If future device classifications become frequently changing vendor data rather than a stable category, migrate `click_device_type` to a validated text field rather than repeatedly altering an enum.

## 7. Table: `links`

### 7.1 Purpose

Stores durable metadata for every created short link. It is the authoritative record used by cache-miss redirect resolution, owner link listing, authorization, lifecycle evaluation, and cache invalidation.

### 7.2 Column definition

| Column | Type | Null | Default | Purpose |
| --- | --- | --- | --- | --- |
| `id` | `bigint` | No | identity sequence | Numeric source for generated base62 codes. |
| `short_code` | `citext` | No | — | Public unique alias/code used in redirects. |
| `long_url` | `text` | No | — | Original validated destination URL. |
| `normalized_long_url` | `text` | No | — | URL representation used for owner-scoped duplicate detection. |
| `owner_type` | `owner_type` | No | — | Indicates anonymous session or authenticated user ownership. |
| `owner_id` | `text` | No | — | Opaque owner identifier from session/auth layer. |
| `redirect_status_code` | `smallint` | No | `302` | Redirect behavior; Release 1 default. |
| `created_at` | `timestamptz` | No | `now()` | Creation instant. |
| `updated_at` | `timestamptz` | No | `now()` | Last metadata update. |
| `expires_at` | `timestamptz` | Yes | `NULL` | Optional end of active lifecycle. |
| `deleted_at` | `timestamptz` | Yes | `NULL` | Soft deletion instant. |
| `is_custom_alias` | `boolean` | No | `false` | Helps reporting and future alias policy; not needed for redirect behavior. |

### 7.3 Canonical DDL

```sql
CREATE TABLE links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  short_code citext NOT NULL,
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
  CONSTRAINT links_short_code_not_blank CHECK (char_length(trim(short_code::text)) > 0),
  CONSTRAINT links_long_url_not_blank CHECK (char_length(trim(long_url)) > 0),
  CONSTRAINT links_normalized_long_url_not_blank CHECK (char_length(trim(normalized_long_url)) > 0),
  CONSTRAINT links_owner_id_not_blank CHECK (char_length(trim(owner_id)) > 0),
  CONSTRAINT links_redirect_status_code_valid CHECK (redirect_status_code IN (301, 302)),
  CONSTRAINT links_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
);
```

Application validation must enforce protocol, maximum length, and alias character policy. A generic database check cannot reliably and safely implement all URL parsing rules; the database protects basic invariants while application code owns semantic validation.

### 7.4 Why `citext` for `short_code`

Generated base62 codes include uppercase letters. If the product uses a case-insensitive public code policy, then a code with uppercase and lowercase forms can collide. The product must choose one policy before implementation:

**Recommended Release 1 policy: case-sensitive generated codes, case-insensitive custom aliases is not supported without a separate normalized alias column.**

Base62 requires case-sensitive handling to preserve all 62 symbols. Therefore, storing the direct public `short_code` as `citext` would reduce the generated-code namespace and cause collisions (for example, `a` and `A`). The correct implementation recommendation is to use `varchar`/`text` with case-sensitive uniqueness for all codes, and a separate lowercased alias comparison mechanism if case-insensitive custom-alias uniqueness is desired.

The canonical `links` DDL is therefore revised as follows for the final implementation:

```sql
CREATE TABLE links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  short_code varchar(64) NOT NULL,
  short_code_normalized varchar(64) NOT NULL,
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
  CONSTRAINT links_short_code_normalized_unique UNIQUE (short_code_normalized),
  CONSTRAINT links_short_code_not_blank CHECK (char_length(trim(short_code)) > 0),
  CONSTRAINT links_short_code_normalized_not_blank CHECK (char_length(trim(short_code_normalized)) > 0),
  CONSTRAINT links_long_url_not_blank CHECK (char_length(trim(long_url)) > 0),
  CONSTRAINT links_normalized_long_url_not_blank CHECK (char_length(trim(normalized_long_url)) > 0),
  CONSTRAINT links_owner_id_not_blank CHECK (char_length(trim(owner_id)) > 0),
  CONSTRAINT links_redirect_status_code_valid CHECK (redirect_status_code IN (301, 302)),
  CONSTRAINT links_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
);
```

However, `short_code_normalized` must not lowercase generated base62 values because that would make `a` collide with `A`. To keep the 62-character space, the recommended final policy is:

- Short codes are case-sensitive.
- Custom aliases use the exact same case-sensitive uniqueness behavior.
- UI states this clearly and normalizes neither codes nor aliases.

With this choice, remove `short_code_normalized` and `citext`; use the simpler final DDL below.

### 7.5 Final Release 1 DDL (recommended)

```sql
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

  CONSTRAINT links_pkey PRIMARY KEY (id),
  CONSTRAINT links_short_code_unique UNIQUE (short_code),
  CONSTRAINT links_short_code_not_blank CHECK (char_length(trim(short_code)) > 0),
  CONSTRAINT links_long_url_not_blank CHECK (char_length(trim(long_url)) > 0),
  CONSTRAINT links_normalized_long_url_not_blank CHECK (char_length(trim(normalized_long_url)) > 0),
  CONSTRAINT links_owner_id_not_blank CHECK (char_length(trim(owner_id)) > 0),
  CONSTRAINT links_redirect_status_code_valid CHECK (redirect_status_code IN (301, 302)),
  CONSTRAINT links_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
);
```

The earlier `citext` discussion is retained to document the important trade-off. Do not enable case-insensitive lookup casually: it conflicts with base62’s full alphabet.

### 7.6 Link indexes

```sql
CREATE INDEX idx_links_owner_created_at
  ON links (owner_type, owner_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_links_owner_normalized_url
  ON links (owner_type, owner_id, normalized_long_url)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_links_active_expiry
  ON links (expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
```

Index rationale:

- `links_short_code_unique` supports database redirect lookup, ownership detail lookup after code resolution, and uniqueness.
- `idx_links_owner_created_at` supports the dashboard list in the user’s natural ordering.
- `idx_links_owner_normalized_url` supports duplicate detection scoped to an owner context.
- `idx_links_active_expiry` supports maintenance/reporting jobs that need to locate expired links; redirect resolution still uses the short-code unique index first.

### 7.7 Link update trigger

`updated_at` should advance whenever mutable metadata changes. Use a small explicit trigger:

```sql
CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER links_set_updated_at
BEFORE UPDATE ON links
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();
```

The application must not rely on this trigger to encode business rules. It only maintains a timestamp consistently.

## 8. Table: `click_events`

### 8.1 Purpose

Stores immutable, enriched analytics events produced by the background worker. This table is write-heavy and grows with redirect traffic, so it is partitioned by `occurred_at`.

### 8.2 Partitioning strategy

Use PostgreSQL range partitioning by month:

```sql
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
```

Important PostgreSQL note: a partitioned table unique/primary-key constraint must include the partition key. Therefore the parent table cannot use `UNIQUE (event_id)` alone with standard declarative range partitions. To preserve idempotency, Release 1 uses a dedicated event-deduplication table described in Section 9. This keeps a globally unique event ID while retaining time partitions.

### 8.3 Monthly partition example

```sql
CREATE TABLE click_events_2026_09
  PARTITION OF click_events
  FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
```

Create partitions ahead of time (for example, at least two months in advance) using a scheduled maintenance script/migration. Missing future partitions must trigger an alert before worker inserts begin failing.

### 8.4 Per-partition indexes

Each partition needs these indexes. PostgreSQL may create/attach partitioned indexes depending on migration approach; verify actual per-partition indexes in CI and production migration checks.

```sql
CREATE INDEX idx_click_events_2026_09_link_occurred_at
  ON click_events_2026_09 (link_id, occurred_at DESC);

CREATE INDEX idx_click_events_2026_09_short_code_occurred_at
  ON click_events_2026_09 (short_code, occurred_at DESC);

CREATE INDEX idx_click_events_2026_09_occurred_at
  ON click_events_2026_09 (occurred_at DESC);
```

The primary dashboard query is link + time range, so `(link_id, occurred_at DESC)` is the required index. `short_code` is duplicated for operational/debugging convenience and should not replace `link_id` in joins or ownership authorization.

### 8.5 Why retain `short_code` on a click event

`link_id` is authoritative. `short_code` is denormalized intentionally so certain operational queries, data exports, and historical analysis can identify the public code without joining. A short-code changes are not supported in Release 1; if rename is introduced later, use `link_id` for semantic truth and decide whether historical `short_code` is event-time snapshot data.

### 8.6 Field handling

| Field | Worker behavior |
| --- | --- |
| `occurred_at` | Use API event timestamp, not worker insertion time. |
| `event_id` | API-generated UUID; passed unchanged through queue and dedupe table. |
| `link_id` | From verified redirect resolution, not user input. |
| `referrer` | Store bounded normalized URL/origin only after privacy review; use `NULL` for direct/unknown. |
| `referrer_host` | Parsed hostname used for grouping; `NULL` for direct/invalid. |
| `device_type` | Parser output mapped to enum; `unknown` on failure. |
| `browser_name` | Canonical parser family, bounded; `Unknown`/null on failure per API contract. |
| Geography fields | Offline lookup result; null if unknown. |
| `ip_hash` | HMAC-derived value only; raw IP is discarded. |
| `processed_at` | Worker insert time for pipeline observability. |

### 8.7 Foreign key decision

An FK from a high-ingest partitioned click table to `links(id)` improves strict referential integrity but can add write overhead and complicate very high-scale retention/deletion operations. For Release 1, use the foreign key because it improves correctness and the expected data volume is modest:

```sql
ALTER TABLE click_events
  ADD CONSTRAINT click_events_link_id_foreign_key
  FOREIGN KEY (link_id) REFERENCES links(id)
  ON DELETE RESTRICT;
```

The link service uses soft deletion, so this does not block normal link deletion. If later benchmark evidence shows FK overhead is material, revisiting it is an explicit architecture decision—not an unreviewed optimization.

## 9. Table: `analytics_event_deduplication`

### 9.1 Purpose

Provides globally unique event IDs independently of click-event partitions. The worker first claims the event ID in this small table. If it has already been claimed/completed, the worker knows a retry must not create another analytics event.

### 9.2 DDL

```sql
CREATE TABLE analytics_event_deduplication (
  event_id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  link_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  persisted_at timestamptz NULL,

  CONSTRAINT analytics_event_deduplication_link_id_foreign_key
    FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE RESTRICT
);

CREATE INDEX idx_analytics_event_deduplication_occurred_at
  ON analytics_event_deduplication (occurred_at);
```

### 9.3 Idempotent worker transaction

The dedupe claim and click-event insert must happen in one database transaction:

```sql
BEGIN;

INSERT INTO analytics_event_deduplication (event_id, occurred_at, link_id)
VALUES ($1, $2, $3)
ON CONFLICT (event_id) DO NOTHING;

-- Application checks affected row count.
-- If zero rows were inserted, COMMIT and treat the job as already processed.

INSERT INTO click_events (
  occurred_at,
  event_id,
  link_id,
  short_code,
  referrer,
  referrer_host,
  device_type,
  browser_name,
  country_code,
  country_name,
  city_name,
  ip_hash,
  ip_hash_key_version
)
VALUES (
  $2, $1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
);

UPDATE analytics_event_deduplication
SET persisted_at = now()
WHERE event_id = $1;

COMMIT;
```

If any statement after the dedupe claim fails, the transaction rolls back and a retry can claim the ID later. If the database commit succeeds but BullMQ acknowledgment is interrupted, the retry sees the claimed ID and does not double insert.

### 9.4 Dedupe retention

The deduplication table must retain IDs at least as long as BullMQ can retry or retain duplicate jobs. Recommended initial retention: 30 days, subject to queue retention settings and observability requirements. A scheduled cleanup deletes only rows with `occurred_at` earlier than the verified safe retention boundary.

Do not delete dedupe records based only on `created_at` without considering delayed event timestamps and queue retries.

## 10. Table: `click_rollups`

### 10.1 Purpose

Stores pre-aggregated analytics counts for fast dashboard queries over common historical ranges. Raw events remain canonical. Rollups are a rebuildable performance optimization.

### 10.2 Granularity model

The initial approach stores separate rollup rows per dimension and bucket. A simple unified `dimension_type`/`dimension_value` design makes it flexible but weakens referential checks and makes common total queries more awkward. The recommended Release 1 design is explicit narrow rollup tables or one table with nullable dimension columns.

For clarity and maintainability, use distinct rollup tables:

- `click_rollups_time` — total click counts per link/time bucket.
- `click_rollups_referrer` — referrer counts.
- `click_rollups_device` — device counts.
- `click_rollups_browser` — browser counts.
- `click_rollups_geography` — country/city counts.

This document fully defines `click_rollups_time`; the dimension rollups use the same patterns and are outlined below.

### 10.3 `click_rollups_time` DDL

```sql
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

CREATE INDEX idx_click_rollups_time_bucket
  ON click_rollups_time (bucket_granularity, bucket_start DESC);
```

### 10.4 Dimension rollup DDL

```sql
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
```

`UNIQUE NULLS NOT DISTINCT` requires PostgreSQL 15+. If using an earlier supported version, store explicit sentinel values such as `'(direct)'` or `'(unknown)'` after a carefully documented normalization policy, or model a non-null `dimension_key` column.

### 10.5 Rollup indexes

```sql
CREATE INDEX idx_click_rollups_referrer_link_bucket
  ON click_rollups_referrer (link_id, bucket_granularity, bucket_start DESC);

CREATE INDEX idx_click_rollups_device_link_bucket
  ON click_rollups_device (link_id, bucket_granularity, bucket_start DESC);

CREATE INDEX idx_click_rollups_browser_link_bucket
  ON click_rollups_browser (link_id, bucket_granularity, bucket_start DESC);

CREATE INDEX idx_click_rollups_geography_link_bucket
  ON click_rollups_geography (link_id, bucket_granularity, bucket_start DESC);
```

## 11. Table: `analytics_rollup_checkpoints`

### 11.1 Purpose

Tracks rollup job progress and observability. The aggregation worker uses a recent overlap window, so a checkpoint indicates successful execution history rather than an absolute hard cutoff.

### 11.2 DDL

```sql
CREATE TABLE analytics_rollup_checkpoints (
  rollup_name varchar(100) PRIMARY KEY,
  last_successful_started_at timestamptz NULL,
  last_successful_completed_at timestamptz NULL,
  last_processed_event_time timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT analytics_rollup_checkpoints_name_not_blank
    CHECK (char_length(trim(rollup_name)) > 0)
);
```

Example `rollup_name` values: `hourly_time`, `daily_time`, `hourly_dimensions`, `daily_dimensions`.

## 12. Optional Table: `schema_migrations` / Migration Tool Metadata

Use the migration table provided by the selected migration framework. Do not manually edit it. Migration files must be committed, ordered, reversible where practical, and tested against a clean database plus an upgraded database.

## 13. Write Paths

### 13.1 Create generated link

The generated code requires the allocated ID before the insert. Use a transaction with explicit steps:

```text
1. Validate URL, owner context, expiry, and duplicate policy in application service.
2. If duplicate reuse applies, query active owner-scoped normalized URL and return it if found.
3. Insert a provisional link using an application-produced code only if the selected approach permits it,
   OR obtain the next identity value with INSERT ... RETURNING id.
4. Encode returned id with custom base62 code.
5. Update/complete inserted row with short_code in the same transaction.
6. Commit.
7. Best-effort populate Redis redirect cache after commit.
```

Recommended SQL pattern that avoids a provisional public code:

```sql
WITH allocated_identifier AS (
  SELECT nextval(pg_get_serial_sequence('links', 'id')) AS id
)
INSERT INTO links (
  id,
  short_code,
  long_url,
  normalized_long_url,
  owner_type,
  owner_id,
  expires_at,
  is_custom_alias
)
SELECT
  allocated_identifier.id,
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  false
FROM allocated_identifier
RETURNING *;
```

Here `$1` is the base62 code calculated by the application from the preallocated ID. The migration/tooling must configure the identity sequence so `nextval` access is safe. Sequence values may have gaps from failed/rolled-back operations; this is correct and does not cause collisions.

Alternative: insert a temporary internal `short_code` then update it inside a transaction. This is less elegant and risks confusing audit/log behavior, so preallocation is preferred.

### 13.2 Create custom alias

```sql
INSERT INTO links (
  short_code,
  long_url,
  normalized_long_url,
  owner_type,
  owner_id,
  expires_at,
  is_custom_alias
)
VALUES ($1, $2, $3, $4, $5, $6, true)
RETURNING *;
```

The `id` identity is allocated automatically. A unique violation of `links_short_code_unique` maps to HTTP `409 Conflict` with “That custom alias is already in use.” Do not retry by silently altering the requested alias.

### 13.3 Duplicate lookup

```sql
SELECT id, short_code, long_url, created_at, expires_at
FROM links
WHERE owner_type = $1
  AND owner_id = $2
  AND normalized_long_url = $3
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY created_at DESC, id DESC
LIMIT 1;
```

This query must not include custom-alias creation requests where the product requires the requested alias to be honored.

### 13.4 Public redirect cache-miss lookup

```sql
SELECT
  id,
  short_code,
  long_url,
  expires_at,
  redirect_status_code
FROM links
WHERE short_code = $1
  AND deleted_at IS NULL
LIMIT 1;
```

The application evaluates `expires_at` using its current UTC time. The query intentionally includes expired records so the HTTP layer can distinguish `410 Gone` from `404 Not Found` if product policy permits. If deletion should be indistinguishable from unknown, deleted rows remain excluded.

### 13.5 Soft delete and cache invalidation

```sql
UPDATE links
SET deleted_at = now()
WHERE short_code = $1
  AND owner_type = $2
  AND owner_id = $3
  AND deleted_at IS NULL
RETURNING id, short_code, long_url, expires_at;
```

After successful commit, delete the Redis `redirect:link:{short_code}` key. If Redis invalidation fails, record an error and retry asynchronously if possible. Never roll back the database delete merely because Redis is unavailable—the database is authoritative.

### 13.6 Worker event insert

Follow the transaction described in Section 9.3. Event writes must use parameterized values and a database connection/transaction that is returned to the pool in all error branches.

## 14. Read Paths and Query Patterns

### 14.1 Dashboard list query

```sql
SELECT
  link.id,
  link.short_code,
  link.long_url,
  link.created_at,
  link.expires_at,
  link.deleted_at,
  COALESCE(total_clicks.total_click_count, 0) AS total_click_count
FROM links AS link
LEFT JOIN LATERAL (
  SELECT count(*) AS total_click_count
  FROM click_events
  WHERE click_events.link_id = link.id
) AS total_clicks ON true
WHERE link.owner_type = $1
  AND link.owner_id = $2
  AND link.deleted_at IS NULL
  AND ($3::text IS NULL OR link.short_code ILIKE '%' || $3 || '%' OR link.long_url ILIKE '%' || $3 || '%')
  AND (
    $4::timestamptz IS NULL
    OR (link.created_at, link.id) < ($4, $5::bigint)
  )
ORDER BY link.created_at DESC, link.id DESC
LIMIT $6;
```

For a sizable links list, a per-row raw-event count becomes expensive. Release 1 can compute/return recent or total counts through rollups or a separately maintained `link_analytics_totals` table. The implementation plan should choose one of these paths:

- Start with no list count or a recent-window count for a small owner list.
- Add `link_analytics_totals` after correctness is proven.
- Use a materialized view only when refresh behavior fits product freshness needs.

Do not execute an unbounded `count(*)` over all click events per dashboard row in production.

### 14.2 Analytics total and timeline from raw events

For short ranges, query a partition-pruned time range:

```sql
SELECT
  date_trunc($4, occurred_at AT TIME ZONE $5) AT TIME ZONE $5 AS bucket_start,
  count(*) AS click_count
FROM click_events
WHERE link_id = $1
  AND occurred_at >= $2
  AND occurred_at < $3
GROUP BY bucket_start
ORDER BY bucket_start ASC;
```

Parameters:

- `$1`: link ID.
- `$2`, `$3`: UTC range boundaries.
- `$4`: validated literal `hour` or `day`, never raw unvalidated input.
- `$5`: validated IANA timezone only if presentation-time bucketing is supported in database; otherwise aggregate UTC then transform at the API layer.

Do not interpolate a user-provided bucket string directly into SQL.

### 14.3 Analytics breakdown query from raw events

```sql
SELECT
  COALESCE(referrer_host, 'Direct / unknown') AS name,
  count(*) AS click_count
FROM click_events
WHERE link_id = $1
  AND occurred_at >= $2
  AND occurred_at < $3
GROUP BY referrer_host
ORDER BY click_count DESC, name ASC
LIMIT 10;
```

Use analogous queries for device, browser, and geography. The geography service layer must apply privacy thresholds before returning city-level data.

### 14.4 Analytics from rollups

```sql
SELECT
  bucket_start,
  click_count
FROM click_rollups_time
WHERE link_id = $1
  AND bucket_granularity = $2
  AND bucket_start >= $3
  AND bucket_start < $4
ORDER BY bucket_start ASC;
```

The service decides whether a requested range reads raw events, rollups, or a combined strategy. This decision must be transparent in testing but need not be exposed to users beyond the freshness metadata.

## 15. Rollup Computation

### 15.1 Hourly time rollup example

```sql
INSERT INTO click_rollups_time (
  link_id,
  bucket_granularity,
  bucket_start,
  click_count,
  calculated_at
)
SELECT
  click_events.link_id,
  'hour'::analytics_bucket_granularity,
  date_trunc('hour', click_events.occurred_at),
  count(*) AS click_count,
  now()
FROM click_events
WHERE click_events.occurred_at >= $1
  AND click_events.occurred_at < $2
GROUP BY
  click_events.link_id,
  date_trunc('hour', click_events.occurred_at)
ON CONFLICT (link_id, bucket_granularity, bucket_start)
DO UPDATE SET
  click_count = EXCLUDED.click_count,
  calculated_at = EXCLUDED.calculated_at;
```

The worker passes an overlap window, such as the last two hours. Recomputing the complete affected bucket guarantees convergence even when events arrive late.

### 15.2 Daily rollups

Daily rows use `date_trunc('day', occurred_at)` in UTC for storage. UI timezones should be handled during API presentation or by a documented local-time aggregation strategy; mixing user-specific local buckets into globally stored daily rollups creates complexity and inconsistent totals.

## 16. Data Retention and Privacy

Retention must be confirmed before production launch. Initial policy recommendation:

| Data category | Suggested retention | Rationale |
| --- | --- | --- |
| Active/deleted link metadata | Retain until owner deletion/account policy says otherwise | Needed for lifecycle and ownership audit. |
| Raw click events | 12–13 months | Supports seasonal comparison while bounding storage. |
| Hourly rollups | 90 days | Useful for recent detailed charts. |
| Daily rollups | 24 months or longer | Lightweight historical summaries. |
| Event dedupe rows | 30 days | Must exceed queue retry/replay horizon. |
| Failed job diagnostics | Bounded operational retention | Debugging without indefinite payload retention. |

Retention operations:

- Prefer dropping old `click_events` partitions rather than row-by-row deleting millions of records.
- Archive/export only if a later product requirement authorizes it.
- Do not include raw IPs in any retention path because they are never persisted.
- Verify rollups are complete before dropping a partition whose history remains needed.

## 17. Migration Plan

Suggested ordered migration sequence:

1. Enable required extensions only if selected by the final code policy.
2. Create enums.
3. Create `links`, link indexes, and `updated_at` trigger.
4. Create partitioned `click_events` parent and first/current/future monthly partitions with indexes.
5. Create `analytics_event_deduplication`.
6. Create rollup tables and rollup checkpoints.
7. Seed/reserve no public aliases in the database; enforce reserved route policy in application validation.
8. Add migration verification tests: create generated/custom link, insert event, roll up test range, and inspect constraints/indexes.

Migration rules:

- Each migration has a descriptive timestamp/name and one responsibility.
- Never edit a migration already applied to a shared environment; write a new forward migration.
- Test migration upgrade from a realistic prior schema and from empty database.
- Back up and validate before destructive partition drops.
- Document any migration that takes locks or needs a maintenance window.

## 18. Backup, Restore, and Operational Checks

### 18.1 Backups

- Use managed PostgreSQL point-in-time recovery or scheduled logical/physical backups.
- Verify restore procedure regularly; a backup is not trustworthy until restoration is tested.
- Link metadata has highest restore priority because it controls redirects.
- Analytics can be restored separately if operational recovery time requires it.

### 18.2 Routine checks

| Check | Frequency | Expected action |
| --- | --- | --- |
| Future event partitions exist | Daily or deployment check | Create missing partitions before month boundary. |
| Partition size/growth | Weekly | Adjust retention, indexes, or storage planning. |
| Rollup freshness | Every aggregation run | Alert on delayed checkpoint. |
| Dedupe table growth | Weekly | Run safe cleanup after retention threshold. |
| Index usage / slow query plans | Weekly under load | Tune evidence-based indexes only. |
| Backup restore test | Periodic | Record recovery time and gaps. |

## 19. Security Rules at the Persistence Boundary

1. Database credentials use a least-privilege application role; do not run the API with superuser rights.
2. Use parameterized queries for every untrusted value, including search text and analytics filter values.
3. Do not log connection strings, SQL parameter values containing sensitive data, or raw click job payloads.
4. Encrypt database connections in deployed environments.
5. Give the API role only the tables/operations it needs; give the worker a distinct role if practical.
6. Migration role permissions are separate from runtime service permissions in production.
7. Database errors are mapped to safe application errors; unique violations become understandable conflict messages, not raw SQL output.

## 20. Schema-Level Test Checklist

- [ ] `links.short_code` rejects duplicate values.
- [ ] Generated base62 codes can be stored at their maximum anticipated length.
- [ ] Alias/code character and reserved-word policy is enforced by application tests.
- [ ] Expiry cannot precede creation.
- [ ] Owner-scoped duplicate lookup finds only non-deleted active records.
- [ ] Soft-deleted links no longer appear in active list queries.
- [ ] Click events insert into the correct monthly partition.
- [ ] Missing future partition is detected before a worker failure occurs.
- [ ] Dedupe claim plus event insert is atomic and retry-safe.
- [ ] No column can store raw IP address.
- [ ] Rollup upserts converge after rerunning the same overlap interval.
- [ ] Analytics range queries use partition pruning and link/time indexes.
- [ ] Cleanup drops/archives only eligible partitions after rollup/retention checks.

## 21. Final Schema Decisions Summary

| Concern | Release 1 decision |
| --- | --- |
| Link primary key | PostgreSQL `bigint` identity sequence. |
| Generated codes | Application custom base62 encode of link ID. |
| Code case | Case-sensitive, preserving full base62 alphabet. |
| Link removal | Soft delete with `deleted_at`. |
| Link expiry | Nullable `expires_at`, evaluated at redirect time. |
| Owner representation | `owner_type` + opaque `owner_id`. |
| Raw analytics | Monthly-partitioned `click_events`. |
| Click idempotency | Separate globally unique dedupe table and single transaction. |
| IP privacy | HMAC-derived `ip_hash`, never raw IP. |
| Historical performance | Rebuildable hourly/daily rollups. |
| Time standard | UTC at storage; local timezone only at presentation/query boundary. |

