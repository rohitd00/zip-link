# Agent To-Do and Delivery Tracker

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | URL Shortener with Analytics at Scale |
| Document | Agent To-Do and Delivery Tracker |
| Version | 1.0 |
| Initial status | Not started |
| Related document | `06-implementation-plan.md` |

## 2. How to Use This Tracker

This document is the execution checklist for an implementation agent or small engineering team. Update task status only after the listed completion evidence exists. “Code was written” is not sufficient evidence.

### 2.1 Status values

| Status | Meaning |
| --- | --- |
| `Not started` | No work has begun. |
| `In progress` | Work is underway; the task is not yet reviewable as complete. |
| `Blocked` | Work cannot continue without a decision, access, dependency, or clarified requirement. Record the blocker. |
| `In review` | Implementation exists and is awaiting tests, review, or verification. |
| `Done` | Acceptance criteria, tests, and documentation requirements are met. |
| `Deferred` | Explicitly moved beyond Release 1 with reason recorded. |

### 2.2 Update rule

For each completed task, record:

- Date completed.
- Files/modules changed.
- Tests or verification command/result.
- Any trade-off or deviation from the plan.
- Follow-up task created, if needed.

Never mark a task `Done` if its dependent service is mocked but the required real integration has not been tested.

## 3. Execution Guardrails

Before beginning implementation, every agent must follow these guardrails:

1. Read the PRD, technical specification, app flow, design specification, schema specification, and implementation plan relevant to the task.
2. Preserve the redirect/analytics separation: a redirect must not wait for enrichment or click persistence.
3. Use verbose, humanized code. Prefer explicit names, clear branches, small functions, and typed contracts.
4. Do not introduce a dependency or architectural pattern merely for convenience; document why it is needed.
5. Do not store/log raw IP addresses or secrets.
6. Do not silently change public API shapes, database migrations, or owner/privacy policy without updating the relevant document and dependent tests.
7. Run targeted tests after each logical change and full quality checks before marking a feature complete.
8. Keep unrelated workspace changes untouched.

## 4. Project Status Dashboard

Update this summary first when task statuses change.

| Workstream | Status | Owner | Dependency / next gate |
| --- | --- | --- | --- |
| Project foundation | Done | Claude (agent) | None — complete. |
| Database and domain contracts | Done | Claude (agent) | None — complete. |
| Core link API and redirect | Done | Claude (agent) | None — complete (Redis/queue deliberately excluded, per Phase 2 scope). |
| Redis cache and rate limiting | Done | Claude (agent) | None — complete. |
| Queue and analytics worker | Done | Claude (agent) | None — complete. |
| Analytics API and rollups | In progress | Claude (agent) | F-01/F-02 done; F-03 (rollups) deferred, per Section 13's "potentially deferrable" list. |
| Dashboard UI | Done | Claude (agent) | G-01 through G-03 complete and verified live in a real browser; G-04 intentionally not duplicated in React (see G-04 note). |
| Hardening and operations | Not started | Unassigned | End-to-end workflow complete. |
| Benchmarks and release docs | Not started | Unassigned | Operational build ready. |

## 5. Workstream A — Foundation

### A-01: Establish repository layout

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | None |
| Deliverable | API, worker, web, shared, database, scripts, and test directories aligned with technical specification. |

To-do:

- [ ] Create the approved monorepo or multi-app layout.
- [ ] Add a root README that identifies API, worker, web, and infrastructure roles.
- [ ] Confirm import/path strategy is simple and explicit.
- [ ] Avoid creating empty abstractions or placeholder folders with unclear ownership.

Acceptance evidence:

- [ ] Directory layout is committed and matches intended runtime boundaries.
- [ ] A new contributor can identify where redirect logic, analytics worker logic, and web UI belong.

### A-02: Configure quality tooling

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-01 |
| Deliverable | Type checking, linting, formatting, and test commands. |

To-do:

- [ ] Configure strict TypeScript or documented JSDoc checking.
- [ ] Configure lint rules that discourage unsafe/implicit types and unused values.
- [ ] Configure formatter.
- [ ] Add test runner and one passing representative test.
- [ ] Add root scripts with descriptive names.

Acceptance evidence:

- [ ] `format:check`, `lint`, `typecheck`, and `test` run from a clean install.
- [ ] Tooling output is actionable and does not depend on a developer’s global configuration.

### A-03: Create environment configuration contract

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-01 |
| Deliverable | `.env.example` and strongly validated runtime configuration module. |

To-do:

- [ ] List all required API/worker variables from technical specification.
- [ ] Add clear placeholder values only; never add real secrets.
- [ ] Implement explicit startup parsing/validation.
- [ ] Provide safe failure messages that name missing settings without echoing values.
- [ ] Document local configuration steps.

Acceptance evidence:

- [ ] API fails fast and clearly when a required variable is missing.
- [ ] Worker validates its own required values independently.
- [ ] No credential appears in committed source/history/output.

### A-04: Local service environment

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-03 |
| Deliverable | Docker Compose development services for PostgreSQL and Redis. |

Note: Docker Desktop's daemon was initially unavailable in the development environment
(resolved once the user started it — see completion log). `docker-compose.yml` defines
both `postgres` and `redis` services and matches the technical specification; `redis` is
what local development actually runs (`docker compose up -d redis`), verified via
`redis-cli ping`. PostgreSQL stays native (see A-03/README) rather than switching to the
compose `postgres` service, since the native instance was already set up and verified
working — the compose `postgres` service remains available as a documented alternative
but is not the path this project actually exercises.

To-do:

- [ ] Define PostgreSQL service with persisted local volume.
- [ ] Define Redis service appropriate for cache and BullMQ development.
- [ ] Expose ports only as needed for development.
- [ ] Add health checks.
- [ ] Document start/stop/reset behavior without destructive ambiguous commands.

Acceptance evidence:

- [ ] Services start from documented command.
- [ ] API can connect to both services using `.env` settings.
- [ ] Health checks report expected state.

## 6. Workstream B — Database and Shared Domain

### B-01: Implement database migrations

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-04 |
| Deliverable | Ordered, tested migrations implementing the approved schema. |

To-do:

- [ ] Create enums and `links` table with constraints/indexes.
- [ ] Add `updated_at` trigger/function.
- [ ] Create partitioned `click_events` parent and current/future partitions.
- [ ] Create event deduplication table.
- [ ] Create rollup and checkpoint tables.
- [ ] Include indexes specified in schema document.
- [ ] Add migration test for a fresh database and upgrade path.

Acceptance evidence:

- [ ] Migration completes from empty database.
- [ ] Re-running migration command is safe/no-op according to tool behavior.
- [ ] Schema inspection confirms keys, indexes, constraints, and partitions.
- [ ] No schema deviates from documented code-case and IP-privacy policy.

### B-02: Partition maintenance utility

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P1 |
| Depends on | B-01 |
| Deliverable | Safe utility/job that creates future click-event partitions. |

To-do:

- [ ] Calculate current and future partition date boundaries in UTC.
- [ ] Create partitions idempotently.
- [ ] Create/attach required per-partition indexes.
- [ ] Log created/existing partition names without sensitive data.
- [ ] Add alert/health signal when the required future horizon is missing.

Acceptance evidence:

- [ ] Test creates a partition for a future month.
- [ ] Test confirms repeated invocation does not fail or duplicate indexes.
- [ ] A simulated event date routes to expected partition.

### B-03: Shared contracts

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-02, B-01 |
| Deliverable | Explicit shared contracts for HTTP, cache, queue, and domain boundaries. |

To-do:

- [ ] Define owner context contract.
- [ ] Define create/list/delete link DTOs.
- [ ] Define redirect cache payload contract.
- [ ] Define versioned click-event job payload.
- [ ] Define analytics response contracts.
- [ ] Define structured application error codes.
- [ ] Avoid importing database-row types directly into web/UI code.

Acceptance evidence:

- [ ] API and worker compile against the same queue payload type.
- [ ] Contract validation covers untrusted boundaries where appropriate.
- [ ] Type names distinguish entity, row, cache, job, and API response concepts.

### B-04: Base62 and validation services

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | B-03 |
| Deliverable | Tested pure functions for code generation support and input policy. |

To-do:

- [ ] Implement custom base62 encode/decode with `bigint`.
- [ ] Add known value and round-trip tests.
- [ ] Validate HTTP/HTTPS destination URLs.
- [ ] Normalize URLs for duplicate detection without changing redirect intent unexpectedly.
- [ ] Validate custom aliases/length/reserved words.
- [ ] Evaluate active/expired/deleted state from timestamps.

Acceptance evidence:

- [ ] No UUID/Nano ID/random library is used for generated short code creation.
- [ ] Negative/non-integer invalid input fails predictably.
- [ ] Case-sensitive code behavior is documented and tested.
- [ ] Dangerous URL protocols are rejected.

## 7. Workstream C — Core Link API and Redirect Baseline

### C-01: Owner-context middleware

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-03, B-03 |
| Deliverable | Signed anonymous owner context available to management endpoints. |

To-do:

- [ ] Read and verify existing owner cookie.
- [ ] Create random opaque ID when absent/invalid.
- [ ] Set cookie with correct production/development flags.
- [ ] Attach typed owner context to request.
- [ ] Do not expose raw owner ID in API responses or UI.

Acceptance evidence:

- [ ] Same browser context owns newly created links across requests.
- [ ] A separate owner cannot list/read/delete the first owner’s links.
- [ ] Invalid cookie does not crash the request.

### C-02: Link repository

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | B-01, B-04 |
| Deliverable | Explicit persistence methods for link lifecycle. |

To-do:

- [ ] Create generated-code links using safe sequence allocation.
- [ ] Create custom aliases with unique-conflict mapping support.
- [ ] Find owner-scoped active duplicate.
- [ ] Cursor-paginate active owned links.
- [ ] Find public link by code.
- [ ] Find owned link by code.
- [ ] Soft delete owned link.
- [ ] Keep SQL parameterized and localized to repository modules.

Acceptance evidence:

- [ ] Concurrent generated creates remain collision-free.
- [ ] Repository returns clear result for absent/unowned/deleted states.
- [ ] SQL integration tests use real PostgreSQL.

### C-03: Link service and management endpoints

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | C-01, C-02 |
| Deliverable | `POST`, list, owned detail, and delete API behavior. |

To-do:

- [ ] Implement create-link policy and duplicate handling.
- [ ] Implement list pagination/filter input validation.
- [ ] Implement owned-detail endpoint.
- [ ] Implement soft-delete operation.
- [ ] Map expected service errors to stable JSON errors.
- [ ] Add request ID and safe error middleware.

Acceptance evidence:

- [ ] Create API returns 201 for new / 200 for reused duplicate.
- [ ] Alias conflict returns 409 with field-level detail.
- [ ] Cross-owner detail/delete returns generic 404.
- [ ] Deleted link no longer appears in active list.

### C-04: Database-backed public redirect

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | C-02 |
| Deliverable | Correct public `GET /:code` behavior before caching/analytics. |

To-do:

- [ ] Register route after API/static routes.
- [ ] Validate code shape before lookup.
- [ ] Look up non-deleted link in database.
- [ ] Evaluate expiry using UTC current time.
- [ ] Return configured 302 for active link.
- [ ] Render minimal 404/410 browser pages and JSON counterparts.
- [ ] Return controlled 503 when database cannot resolve a cache-miss baseline request.

Acceptance evidence:

- [ ] Active link redirects to exact stored destination.
- [ ] Expired link is 410 and never redirects.
- [ ] Unknown/deleted link is 404.
- [ ] Route ordering prevents `/api`, `/health`, etc. from being interpreted as code.

## 8. Workstream D — Redis Cache and Rate Limiting

### D-01: Redis integration foundation

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-04, C-04 |
| Deliverable | Reusable Redis client/lifecycle integration. |

To-do:

- [ ] Create connection factory with clear startup/shutdown.
- [ ] Add safe error logging and readiness behavior.
- [ ] Separate cache keys from BullMQ keyspace.
- [ ] Implement test fixture/reset helpers scoped to project keys only.

Acceptance evidence:

- [ ] Redis connection failure is visible but does not crash unrelated unit tests.
- [ ] Shutdown closes connection cleanly.
- [ ] No broad Redis flush is used by test or application code.

### D-02: Redirect cache-aside implementation

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | D-01 |
| Deliverable | Cache-first redirect resolution with correct database fallback. |

To-do:

- [ ] Implement named cache key construction.
- [ ] Validate cache payload when reading.
- [ ] Calculate safe TTL for permanent/expiring links.
- [ ] Cache after creation and cache miss.
- [ ] Delete cache key after deletion.
- [ ] Treat malformed/stale cache record as cache miss.
- [ ] Record hit/miss/error metrics.

Acceptance evidence:

- [ ] Warm redirect does not query PostgreSQL.
- [ ] Cache miss backfills correct record.
- [ ] Cached expiry is checked before redirect.
- [ ] Cache outage falls back to database.
- [ ] Cache entry is invalidated by deletion.

### D-03: Creation rate limiting

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P1 |
| Depends on | D-01, C-03 |
| Deliverable | Redis-backed per-owner/IP creation limit. |

To-do:

- [ ] Create a stable creation-limit key based on owner/IP policy.
- [ ] Implement configurable window/max values.
- [ ] Return 429 and Retry-After when known.
- [ ] Add rate-limit metric/log with privacy-conscious key handling.
- [ ] Exclude public redirects from this limiter.

Acceptance evidence:

- [ ] Limit permits requests below threshold and rejects above threshold.
- [ ] Limit expires/reset behavior is tested.
- [ ] A rate-limited response does not reveal internal Redis state.

## 9. Workstream E — Queue and Analytics Worker

### E-01: BullMQ queue configuration

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | D-01, B-03 |
| Deliverable | Named click-analytics queue with explicit retry/retention policy. |

To-do:

- [ ] Create queue and worker configuration modules.
- [ ] Define attempts, exponential backoff, concurrency, and job retention settings.
- [ ] Implement graceful queue/worker close behavior.
- [ ] Add queue metrics hooks.

Acceptance evidence:

- [ ] A test job can enqueue and be consumed.
- [ ] Failed job retries follow configured policy.
- [ ] Queue configuration is documented in environment/configuration docs.

### E-02: Click-event publisher on redirect path

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | E-01, D-02 |
| Deliverable | Best-effort queue event publication after successful redirect resolution. |

To-do:

- [ ] Build versioned job payload with UUID `eventId`.
- [ ] Bound referrer and User-Agent values.
- [ ] Obtain trusted client IP using secure proxy configuration.
- [ ] Publish event with documented short operational budget.
- [ ] Increment success/failure metrics.
- [ ] Ensure queue failure is isolated from redirect response.

Acceptance evidence:

- [x] Queue job includes link ID, code, occurrence time, referrer, UA, and IP input.
- [x] Public redirect succeeds when publisher throws/times out (bounded to 500ms; the
  publish call is awaited but never allowed to block longer than that).
- [x] Redirect controller does not import parsing/GeoIP/database event modules — only
  `ClickEventPublisher`.

Note: "secure proxy configuration" is not yet applicable — this deployment has no reverse
proxy in front of it, so Express's default `trust proxy: false` is correct as-is and
`request.ip` is the real socket address, not a spoofable header. A production deployment
behind a real reverse proxy must configure `trust proxy` deliberately before relying on
`request.ip`, per Rule S-02; this is documented as a known limitation in the README and in
a code comment in `redirectController.ts`, not implemented, since there is no proxy
topology yet to configure it against.

### E-03: Worker enrichment and persistence

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | E-01, B-01 |
| Deliverable | Worker consumes, enriches, de-identifies, and persist click events. |

To-do:

- [ ] Validate job payload/version on consume.
- [ ] Normalize referrer and derive host.
- [ ] Parse device/browser with clear fallback values.
- [ ] Perform offline GeoIP lookup with unknown fallback.
- [ ] HMAC-hash IP using configured secret/key version.
- [ ] Use one transaction for dedupe claim and event insert.
- [ ] Classify retryable versus permanent errors.
- [ ] Redact sensitive data in all worker diagnostics.

Acceptance evidence:

- [ ] Valid job produces exactly one `click_events` row.
- [ ] Same job ID retried produces no second row.
- [ ] Raw IP is absent from database/logs/API results.
- [ ] UA/geo failure still counts click safely.
- [ ] A temporary database failure retries.

### E-04: Pipeline observability

| Field | Detail |
| --- | --- |
| Status | In progress |
| Priority | P1 |
| Depends on | E-02, E-03 |
| Deliverable | Metrics/logs for queue delivery and worker processing. |

To-do:

- [x] Emit enqueue success/failure counters — as structured log lines
  (`"Attempted to publish a click-analytics event."` with `publishOutcome`), not yet a
  numeric counter/metrics endpoint.
- [x] Emit job completion/failure/duration metrics — as structured log lines
  (`"Click-analytics job completed."` / `"Click-analytics job failed."`), not yet a
  numeric duration histogram.
- [ ] Surface queue depth and oldest-job age internally. Not started; deferred per the
  critical-path checklist below (a `/metrics` endpoint is Phase 7 hardening work).
- [x] Include safe event/job IDs in structured logs.
- [ ] Add alert thresholds/documented operator guidance. Not started.

This remains deliberately partial: Section 13 of this document lists "E-04: advanced
alerting dashboards" as potentially deferrable after the core pipeline works, which it
now does (see E-01 through E-03). Structured logs already make queue/worker behavior
inspectable; a real metrics endpoint is better built alongside the API's own `/metrics`
in Phase 7 rather than as a one-off here.

Acceptance evidence:

- [ ] A deliberately failed job is visible without exposing its raw sensitive payload.
- [ ] Worker backlog is observable.

## 10. Workstream F — Analytics API and Rollups

### F-01: Raw analytics query layer

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | E-03 |
| Deliverable | Partition-aware raw-event queries for a single link/time range. |

To-do:

- [x] Implement total count query.
- [x] Implement timeline query with validated hour/day bucket.
- [x] Implement top-referrer/device/browser/geography queries.
- [x] Ensure link ID/time bounds drive all queries.
- [x] Validate query plan/index usage with representative data — every query filters on
  `link_id` and `occurred_at` together, matching the `(link_id, occurred_at DESC)`
  per-partition index from `05-database-schema.md` Section 8.4; not separately verified
  with `EXPLAIN` against production-scale data (no such data exists yet).

Acceptance evidence:

- [x] Query results are sorted, bounded, and use selected range.
- [x] `Direct / unknown` and missing fields are normalized consistently.
- [x] Raw range query does not scan unrelated partitions — WHERE clause always includes
  `occurred_at >=/< ` bounds ahead of PostgreSQL's own partition pruning.

Real bug caught and fixed during this task: the timeline query's `date_trunc` was
truncating in the PostgreSQL session's local timezone (not UTC) because the unit
argument alone does not anchor to a zone. Fixed with the
`date_trunc($bucket, occurred_at AT TIME ZONE $tz) AT TIME ZONE $tz` pattern from
`05-database-schema.md` Section 14.2, and now takes the validated `timezone` query
parameter as an actual input rather than ignoring it. A repository-level integration
test (inserting a known UTC timestamp and asserting the exact returned bucket boundary)
caught this before it shipped.

### F-02: Analytics service and endpoint

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | F-01, C-01 |
| Deliverable | Owner-authorized analytics API contract. |

To-do:

- [x] Resolve owned link before query.
- [x] Validate `from`, `to`, timezone, bucket, and max range.
- [x] Select a sensible default date range/bucket (30 days ending now; hour buckets for
  ranges ≤48h, day buckets otherwise; an explicit hour request is overridden if the range
  would produce too many points).
- [x] Build response with range and freshness metadata.
- [x] Apply city-level privacy threshold (fewer than 3 events in range → merged into the
  country row).
- [x] Return explicit zero-data response.

Acceptance evidence:

- [x] Unowned link returns generic 404 before data query — verified both with a real
  unowned-request integration test and manually (`curl` with no owner cookie).
- [x] Valid owner receives all required summaries — verified with seeded `click_events`
  rows (both direct SQL in tests and a live manual walkthrough) covering totals,
  timeline, referrers, devices, browsers, and geography together.
- [x] No raw IP hash or personal identifier appears in output — the response contract
  (`AnalyticsResponseData`) has no field for it; nothing in the service/repository reads
  `ip_hash` at all.
- [x] Invalid range returns readable 400 error — verified with an integration test and
  manually.

### F-03: Rollup scheduler and queries

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P1 |
| Depends on | F-01, B-01 |
| Deliverable | Rebuildable hourly/daily rollups with checkpoint. |

To-do:

- [ ] Define schedule and recent overlap window.
- [ ] Aggregate time rollups first.
- [ ] Upsert counts rather than incrementing blindly.
- [ ] Store successful checkpoint/observability data.
- [ ] Add dimension rollups only as query scale requires.
- [ ] Add raw-versus-rollup equivalence tests.

Acceptance evidence:

- [ ] Same overlap run is idempotent.
- [ ] Late event appears after rerun.
- [ ] Rollup freshness is observable.
- [ ] Raw data can rebuild a test rollup after deletion.

## 11. Workstream G — Web Dashboard

### G-01: Design system and shared UI primitives

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | A-02, B-03 |
| Deliverable | Minimalist Tailwind tokens and accessible reusable components. |

To-do:

- [x] Implement colors/type/spacing/radius tokens from design spec — Tailwind v4's
  CSS-native `@theme` block in `apps/web/src/styles/global.css` (no separate JS config
  file needed with v4).
- [x] Build button, field, error, copy, badge, card, empty state, and dialog primitives —
  `Button` (variant prop: primary/secondary/text/destructive, `isLoading`), `TextField`,
  `StatusBadge`, `CopyButton`, `Card`, `EmptyState`, `MetricCard`, `BreakdownCard`,
  `ConfirmDialog` (built on the native `<dialog>` element for a free focus trap and
  Escape-to-close instead of hand-rolling one).
- [x] Test focus/keyboard behavior — `RangeSelector.test.tsx` verifies Tab+Enter
  operation; `ConfirmDialog.test.tsx` verifies confirm/cancel/disabled-while-confirming.
- [x] Avoid duplicate dense class strings; use named components — confirmed no raw
  Tailwind class soup at call sites; every visual pattern is a named component.

Acceptance evidence:

- [x] Components meet contrast/touch/focus requirements — buttons/inputs use
  `min-h-11` (44px, the design spec's minimum touch target); focus-visible outlines use
  the accent color at 2px with offset everywhere.
- [x] Destructive and primary variants are visually distinct and labelled — verified in
  the live delete-confirmation screenshot (outlined red "Delete link" vs. solid indigo
  primary actions elsewhere).

### G-02: Dashboard create/list experience

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | C-03, G-01 |
| Deliverable | Functional home page for create, copy, list, filter, and pagination. |

To-do:

- [x] Build create form with advanced options disclosure — `CreateLinkForm.tsx`, closed
  by default, `aria-expanded`/`aria-controls` wired correctly.
- [x] Map API validation/conflict/rate-limit errors to clear UI states — field errors
  mapped by `field` name from `ApiRequestError.details`; `RATE_LIMITED` gets its own
  friendly message; network failures get their own `NetworkUnavailableError` message.
- [x] Render new/duplicate result panel — distinguishes "Link created" vs. "Existing link
  found" per the design spec's copy guidance.
- [x] Implement copy state and fallback — `CopyButton` shows "Copied"/"Couldn't copy".
- [x] Render empty/loading/error/populated link-list states — `useLinkList` hook +
  skeleton rows + `EmptyState` + retry-on-error.
- [x] Add filter and cursor pagination — debounced (300ms) search via `searchQuery`
  state; "Load more" button consumes `page.nextCursor`.
- [x] Ensure responsive link-row/card behavior — verified in a live 375px-wide screenshot
  with no horizontal scroll.

Acceptance evidence:

- [x] Form values survive recoverable errors — verified by test
  ("shows a field error and keeps the entered URL...") and live in the browser.
- [x] A successful link appears in list without full page reload — `prependCreatedLink`
  updates local state directly; verified live (screenshot 02).
- [x] Long URLs do not overflow layout — `truncate`/`break-all` used throughout;
  destination shown truncated in the list, wrapped in full on the detail page.
- [x] Keyboard user can operate create/copy/filter/pagination — all controls are native
  `button`/`input` elements; no custom click-only affordances.

### G-03: Link detail and analytics experience

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P0 |
| Depends on | F-02, G-01 |
| Deliverable | Link overview, date range, metrics, chart, breakdowns, and deletion UI. |

To-do:

- [x] Render link header/status/destination/copy action.
- [x] Implement preset and custom analytics range controls — 24h/7d/30d segmented
  control plus a custom from/to pair (`RangeSelector.tsx`,
  `features/analytics/dateRangeHelpers.ts`).
- [x] Render total metric, timeline, and ranked lists — `MetricCard` + `ClicksChart`
  (Recharts) + `BreakdownCard` × 4 (referrers/devices/browsers/geography).
- [x] Implement chart table/text alternative — a `<details>`-collapsible `<table>` with
  the exact same bucket/count data as the chart, per Rule U-03.
- [x] Render loading, zero, partial, and failure analytics states — skeleton, explicit
  "No clicks in this period" empty state, and an error message on fetch failure.
- [x] Explain eventual analytics delay unobtrusively — "Recent clicks may take a moment
  to appear." shown under the Analytics heading, matching the design spec's exact copy.
- [x] Implement delete modal with focus management and navigation on success — native
  `<dialog>` (free focus trap/Escape), `navigate("/")` on successful delete.

Acceptance evidence:

- [x] Every displayed summary uses selected time range — all breakdown/timeline/total
  data comes from one `useLinkAnalytics(shortCode, activeRange)` call.
- [x] No-data state is useful and non-misleading — verified live: a freshly created link
  shows "No clicks in this period", not a blank or zero-filled chart.
- [x] Delete needs explicit confirmation — verified live (screenshot 06): dialog opens,
  Cancel and the destructive "Delete link" button are both present and distinct.
- [x] Layout works at mobile width — verified live at 375px width (screenshot 07), no
  horizontal scroll. 200% zoom was not separately verified (no automated tool for it in
  this environment); relative units (rem/em-based Tailwind spacing, no fixed pixel
  layout widths) make it likely to hold up, but this is an assumption, not a checked fact.

### G-04: Public error pages

| Field | Detail |
| --- | --- |
| Status | Done |
| Priority | P1 |
| Depends on | C-04, G-01 |
| Deliverable | Minimal 404/410 browser screens matching approved design. |

Note: this deliverable was already built in Workstream C (C-04, Phase 2) as
server-rendered HTML — `apps/api/src/views/publicErrorPage.ts`, matching the design
spec's copy exactly, with tested JSON-vs-HTML branching by `Accept` header. It is
deliberately **not** duplicated in the React app: a bad short code is resolved entirely
server-side by the public `GET /:code` route and never reaches the SPA at all, so a
React-rendered 404/410 page would be dead code with no route that could ever render it.

To-do:

- [x] Build unavailable and expired page components/templates — done in C-04.
- [x] Keep content neutral and non-revealing — done in C-04.
- [x] Support JSON errors for API-oriented Accept header — done in C-04.
- [x] Verify route does not leak destination or owner details — done in C-04.

Acceptance evidence:

- [x] Public pages use correct status code and clear copy — see C-04's evidence.
- [x] Browser and JSON behavior are both tested — see `apps/api/src/app.test.ts`
  ("returns 404 JSON when the client explicitly requests JSON").

## 12. Workstream H — Hardening, Deployment, and Evidence

### H-01: Security and privacy audit

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P0 |
| Depends on | C-04, E-03, F-02, G-03 |
| Deliverable | Verified security/privacy controls and documented remaining limitations. |

To-do:

- [ ] Re-test protocol validation, ownership checks, input bounds, and parameterized SQL.
- [ ] Verify proxy trust and client IP handling.
- [ ] Verify cookie/CSRF/security header posture.
- [ ] Search database/log output for raw IP/secret leaks.
- [ ] Review error responses for stack trace/internal messages.
- [ ] Document analytics retention/privacy behavior.

Acceptance evidence:

- [ ] Security test cases pass.
- [ ] Manual log inspection finds no raw IP address/secret output.
- [ ] Known limitations are documented, not hidden.

### H-02: Containers, health, and shutdown

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P0 |
| Depends on | E-03, G-03 |
| Deliverable | Complete local Docker topology with health and graceful shutdown. |

To-do:

- [ ] Create API/worker/web Dockerfiles.
- [ ] Finish Docker Compose service dependencies/health checks.
- [ ] Add liveness/readiness endpoints.
- [ ] Implement orderly API/worker shutdown.
- [ ] Document startup, migrations, seed, and stop operations.

Acceptance evidence:

- [ ] Full compose stack starts from documented steps.
- [ ] A complete create → redirect → analytics journey works in containers.
- [ ] Stopping a service does not corrupt database/queue state.

### H-03: Load testing and benchmark record

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P1 |
| Depends on | D-02, E-02, H-02 |
| Deliverable | Reproducible redirect benchmark report using `autocannon`. |

To-do:

- [ ] Define warm-cache, cold-cache, burst, and queue-degraded scenarios.
- [ ] Prepare reproducible seeded active link.
- [ ] Capture RPS, p50/p95/p99, error rate, cache ratio, and environment details.
- [ ] Repeat enough runs to identify anomalies.
- [ ] Record results in README without inventing values.

Acceptance evidence:

- [ ] Benchmark commands and conditions are documented.
- [ ] Results include cache state and test duration.
- [ ] Queue degradation does not change successful redirect behavior beyond documented enqueue loss.

### H-04: Documentation and release review

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P0 |
| Depends on | H-01, H-02, H-03 |
| Deliverable | Accurate README and final release review. |

To-do:

- [ ] Update README architecture/setup/API/benchmark sections.
- [ ] Link all project documents.
- [ ] Confirm document claims match implementation.
- [ ] List known limitations/future scale path.
- [ ] Run full quality suite.
- [ ] Review diffs for accidental files/secrets/debug code.

Acceptance evidence:

- [ ] A fresh developer can set up the project from README.
- [ ] All final checks pass.
- [ ] Architecture and resume language use measured facts only.

## 13. Critical-Path Checklist

These tasks cannot be deferred if the project is presented as a scalable URL shortener with analytics:

- [x] A-01 through A-04: reproducible environment.
- [x] B-01, B-03, B-04: schema and trusted domain rules.
- [x] C-01 through C-04: correct durable link and redirect baseline.
- [x] D-01 and D-02: cache-aside redirect behavior.
- [x] E-01 through E-03: non-blocking queue/worker analytics pipeline.
- [x] F-01 and F-02: analytics API with ownership/privacy.
- [x] G-02 and G-03: minimum usable dashboard.
- [ ] H-01, H-02, H-04: safe/reproducible release.

Potentially deferrable after the core is working:

- [x] B-02: automated partition maintenance (documented manual process: `npm run
  maintain:partitions`, verified idempotent).
- [ ] D-03: rate limiter tuning beyond baseline policy.
- [ ] E-04: advanced alerting dashboards.
- [ ] F-03: full dimension rollups, if raw short-range queries are safe and documented.
- [x] G-04: polished public error pages — already correct (server-rendered in C-04); see
  the note under G-04 above for why it is not duplicated in React.
- [ ] H-03: expanded benchmark matrix, though at least one defensible redirect benchmark remains required for resume claims.

## 14. Daily Agent Handoff Template

Use this format in task updates or pull-request descriptions:

```markdown
### Status
In progress / In review / Done / Blocked

### Completed today
- [Task ID] What changed, in plain language.

### Verification
- Command/test: result.
- Manual flow checked: result.

### Files / modules touched
- Path — short purpose.

### Risks or decisions
- Decision needed, trade-off made, or known limitation.

### Next action
- [Task ID] concrete next task.
```

If blocked, add this exactly:

```markdown
### Blocker
What cannot proceed, why it matters, what decision/access is required, and the safe work that can continue meanwhile.
```

## 15. Final Agent Sign-Off

Before declaring the project complete, the responsible agent must confirm each statement:

- [ ] I verified the implementation against every required product flow, not only unit tests.
- [ ] I verified that redirect completion does not depend on analytics worker completion.
- [ ] I verified cache-miss/database fallback and cache invalidation behavior.
- [ ] I verified queue retry/idempotency behavior.
- [ ] I verified raw IP addresses are not persisted or logged.
- [ ] I verified owner authorization for management and analytics.
- [ ] I verified the dashboard’s accessibility-critical interactions.
- [ ] I ran and recorded final quality checks and benchmarks.
- [ ] I updated docs to reflect the implementation actually delivered.
- [ ] I reviewed code for the required verbose, humanized style and removed unclear shorthand.

## 16. Completion Log

Append real updates below; do not rewrite prior history.

| Date | Task ID | Status change | Evidence / notes | Agent |
| --- | --- | --- | --- | --- |
| 2026-09-02 | A-01 to A-03 | Not started → Done | Repo layout (`apps/`, `packages/shared`, `database/`, `scripts/`); TypeScript strict + ESLint + Prettier + Vitest configured; `.env.example` + validated `apps/api/src/config/environment.ts` with per-field error messages. `npm run format:check`, `lint`, `typecheck`, `test` all pass from a clean install. | Claude (agent) |
| 2026-09-02 | A-04 | Not started → Blocked | `docker-compose.yml` written for Postgres+Redis but unverified (Docker Desktop daemon unavailable). Used native PostgreSQL 18 with dedicated `url_shortener_app` role and `url_shortener_dev`/`url_shortener_test` databases instead. Does not block Workstreams A-C since Redis is not needed until Workstream D. | Claude (agent) |
| 2026-09-02 | B-01, B-02, B-03, B-04 | Not started → Done | 6 migrations under `database/migrations/` create enums, `links`, partitioned `click_events` (current month + 2 ahead), `analytics_event_deduplication`, rollup tables, and rollup checkpoints — verified against both `url_shortener_dev` and `url_shortener_test` via `\dt`/`\d links`. `scripts/create-future-click-event-partitions.ts` implemented and manually verified idempotent. Shared contracts in `packages/shared/src/contracts/`. Base62 encoder/decoder (`packages/shared/src/base62/`) with 9 unit tests; URL/alias/expiry validation (`apps/api/src/domain/`) with 29 unit tests. No UUID/random-ID library used for code generation. | Claude (agent) |
| 2026-09-02 | C-01 to C-04 | Not started → Done | Signed anonymous owner-context cookie middleware; `LinkRepository` (parameterized SQL only); `LinkService` (create/list/get/delete business rules, duplicate handling, custom alias vs. generated code); `POST`/`GET`/`GET :code`/`DELETE /api/links`; public `GET /:code` redirect (302/404/410) registered after all `/api` and `/health` routes. Verified via 27 integration tests (`apps/api/src/repositories/linkRepository.test.ts`, `apps/api/src/app.test.ts`) against the real `url_shortener_test` database, covering concurrent ID allocation, alias conflicts, cross-owner denial (404, not 403), expiry, and idempotent delete — plus a full manual curl walkthrough of create → duplicate → alias conflict → list → detail → delete → post-delete 404. All 65 tests pass; lint/typecheck clean. | Claude (agent) |
| 2026-09-02 | A-04 | Blocked → Done | User started Docker Desktop; its CLI was found at `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe` (not on `PATH`, not under the older `Program Files\Docker\Docker` location). Ran `docker compose up -d redis` successfully; `docker exec url-shortener-redis redis-cli ping` returned `PONG`. PostgreSQL remains native by choice (already working), not a limitation. | Claude (agent) |
| 2026-09-02 | D-01, D-02, D-03 | Not started → Done | Redis client factory (`apps/api/src/cache/redisClient.ts`, 1s command timeout, 1 retry, so a stuck Redis can't hang a redirect). `RedirectCacheRepository`: validated reads (zod schema, malformed/wrong-shape/JSON-parse-failure all treated as miss), best-effort writes/deletes that never throw. `calculateRedirectCacheTtlSeconds` (pure function, 5 unit tests) bounds TTL to the smaller of the default and the link's remaining lifetime. `RedirectService` rewritten as true cache-aside: Redis read first, PostgreSQL fallback on miss/error, backfill on miss, cached-but-now-expired entries are bypassed and deleted rather than trusted. `LinkService` writes through the cache on creation and invalidates on delete. `CreationRateLimiter` (Redis INCR+EXPIRE fixed window, documented sliding-vs-fixed trade-off, fails open on Redis error) applied only to `POST /api/links` via route-scoped middleware — confirmed the public redirect route is never rate-limited. `HealthController` now reports PostgreSQL and Redis separately; only PostgreSQL failure returns 503. Verified with 24 new tests (unit: cache TTL, mocked-Redis error handling; integration: real Redis cache-aside via `app.test.ts` — including deleting the DB row directly and confirming the redirect still serves from cache — and real-Redis rate-limiter behavior including window reset) plus a full manual walkthrough (readiness shows both deps ok, cache payload inspected directly in Redis, 20-requests-then-429 confirmed live). Also fixed a pre-existing test-suite flake: multiple test files sharing one real Postgres/Redis test instance were running in parallel and racing each other's cleanup; set `fileParallelism: false` in `vitest.config.ts`. All 89 tests pass, 0 lint errors, clean typecheck. | Claude (agent) |
| 2026-09-02 | E-01, E-02, E-03 | Not started → Done | BullMQ queue (`apps/api/src/queue/clickEventQueue.ts`: 5 attempts, exponential backoff from 1s, bounded completed/failed job retention) with its own dedicated Redis connection (`maxRetriesPerRequest: null`, required by BullMQ, separate from the cache/rate-limit connection). `ClickEventPublisher` builds the versioned job payload and publishes with a 500ms bounded budget from `RedirectController` (the only queue-aware code in the redirect path — verified it imports no parsing/GeoIP/DB-event modules). Worker (`apps/worker`, new independently-configured process — its own `config/environment.ts` validates `DATABASE_URL`/`REDIS_URL`/`IP_HASH_SECRET`/`IP_HASH_KEY_VERSION`/`ANALYTICS_WORKER_CONCURRENCY` on its own, per the "worker validates its own required values independently" rule) consumes jobs: validates the payload (zod; unrecognized version or missing field throws BullMQ `UnrecoverableError`, i.e. no retry), normalizes the referrer (`ua-parser-js` for device/browser — bot detection via a local keyword pattern instead of the library's own bot-detection submodule, which needs a module-resolution setting this CommonJS project doesn't use), looks up geography via `geoip-lite` (fully offline, no network call; country names derived from Node's built-in `Intl.DisplayNames` rather than a second dataset), HMAC-SHA-256-hashes the IP (`crypto.createHmac`, keyed by `IP_HASH_SECRET`+`IP_HASH_KEY_VERSION`), and persists via the exact dedupe-claim-then-insert transaction from `05-database-schema.md` Section 9.3. GEOIP_DATABASE_PATH (named in the tech spec's config contract) does not apply given this GeoIP choice and was dropped from `.env`/`.env.example`. Added `REDIS_TEST_URL` (a separate logical Redis database, index 1) so the test suite's own queue/cache/rate-limit activity can never collide with a locally running dev server's — test cleanup simplified to a scoped `FLUSHDB` on that isolated database (safe because nothing else ever uses it). Verified with 32 new tests: unit tests for the IP hasher (exact HMAC vector match), referrer normalizer, and UA parser (real Chrome/iPhone/iPad/Googlebot user-agent strings); integration tests for the dedupe-claim transaction against real Postgres; and — the key proof — a real BullMQ `Queue` + `Worker` + `QueueEvents` round-trip test with no mocks, confirming a published job is consumed and produces exactly one row, a redelivered duplicate `eventId` produces zero additional rows, and a malformed payload fails permanently without ever reaching the database. Also verified live: ran both processes together, created a link, curled it with a real User-Agent and Referer header, watched the worker log the completed job, and inspected the actual `click_events` row in the dev database — referrer/device/browser/country populated correctly, `ip_hash` present as a hex digest, no raw IP anywhere. All 121 tests pass (89 existing + 32 new); lint/typecheck clean. | Claude (agent) |
| 2026-09-02 | E-04 | Not started → In progress | Structured logs cover enqueue success/failure and job completion/failure with safe event/job IDs. Queue depth/oldest-job-age surfacing and alert-threshold documentation are not started — deliberately deferred alongside the API's own future `/metrics` endpoint (Phase 7), per Section 13's "potentially deferrable" list. | Claude (agent) |
| 2026-09-02 | F-01, F-02 | Not started → Done | `AnalyticsRepository` (`apps/api/src/repositories/analyticsRepository.ts`): total count, timeline, top-referrer/device/browser/geography queries, every one scoped to `link_id` + `occurred_at` range. `AnalyticsService` orchestrates ownership check (before any query runs), range/timezone/bucket validation (`domain/analyticsRangeValidation.ts`, `domain/timezoneValidation.ts`, `domain/analyticsBucketSelection.ts` — default 30-day range, 90-day cap, hour buckets ≤48h else day, an explicit over-long hour request is overridden), and the geography privacy threshold (`services/analyticsService.ts`: below 3 events, a city is merged into its country row rather than shown, with counts summed for two suppressed cities in the same country). New route `GET /api/links/:code/analytics`. Found and fixed a real bug via the test suite: the timeline query's `date_trunc` was truncating in the Postgres session's local timezone rather than UTC/the requested zone (session timezone here happens to be IST, UTC+5:30) — fixed with the `AT TIME ZONE` double-conversion pattern from `05-database-schema.md` Section 14.2, and the previously-unused `timezone` query parameter is now actually threaded through to the query. Extracted `buildShortUrl` (previously private to `LinkService`) into `domain/shortUrlBuilder.ts`, and `requireOwnerContext` (previously duplicated across controllers) into `middleware/routeParams.ts`, so `AnalyticsService`/`AnalyticsController` could reuse both instead of a third copy. Verified with 34 new tests (unit: range/bucket/timezone validation, geography-threshold grouping with 6 scenarios; integration: `AnalyticsRepository` against real seeded `click_events`, including the exact-UTC-boundary assertion that caught the timezone bug; HTTP: ownership 404, full response shape with seeded events, explicit zero-click response, invalid-range 400, and the privacy threshold verified end-to-end through the real HTTP response) plus a live manual walkthrough (seeded real rows in the dev database, confirmed the exact same privacy-suppression behavior live, confirmed 404 with no owner cookie, confirmed 400 on an inverted range). All 153 tests pass; lint/typecheck clean. | Claude (agent) |
| 2026-09-02 | F-03 | — | Not started, deliberately deferred per Section 13's "potentially deferrable" list — the analytics API queries raw `click_events` directly, which is correct (if not maximally scalable) at the traffic volumes this project has been tested at. `click_rollups_*` tables and checkpoints already exist from the B-01 migrations; only the scheduler/population job remains unbuilt. | — |
| 2026-09-02 | G-01, G-02, G-03, G-04 | Not started → Done | Scaffolded `apps/web` as a Vite + React 19 + TypeScript + Tailwind v4 + React Router SPA, sharing the root `package.json`/`node_modules` (no npm workspaces, consistent with the rest of the project) via `@shared/*` path aliases in both `apps/web/tsconfig.json` and `apps/web/vite.config.mts`. Design tokens from `04-design-specification.md` Section 5 as a Tailwind v4 `@theme` block (`apps/web/src/styles/global.css`) — no separate JS config file needed with v4. Built the full primitive set (`Button`, `TextField`, `StatusBadge`, `CopyButton`, `Card`, `EmptyState`, `MetricCard`, `BreakdownCard`, `ConfirmDialog` — the last built on the native `<dialog>` element for a free focus trap/Escape-close instead of hand-rolling one), the dashboard home page (create form with collapsed-by-default advanced options, debounced search, cursor pagination, no global state library — just a small `useLinkList` hook per Rule G-02), and the link detail/analytics page (range presets + custom range, a Recharts area chart with a collapsible accessible `<table>` alternative of the identical data, four breakdown cards, delete confirmation). Added a `GetLinkDetailResponseData` shared contract and had `LinkService.getOwnedLinkDetail`/`LinksController.getOwnedLink` return it directly (previously an untyped inline object) so the frontend's `GET /api/links/:code` response is typed end-to-end; extended it with `shortUrl` for consistency with the other link endpoints. G-04 (public error pages) was already done in Phase 2 (C-04) as server-rendered HTML and is deliberately not duplicated in React — a bad short code never reaches the SPA. Verified with 16 new component/unit tests (Vitest + Testing Library + jsdom, opted in per-file via `// @vitest-environment jsdom` since the rest of the suite stays in the faster `node` environment) — caught and fixed two real environment issues along the way: Testing Library's auto-cleanup between tests never fired because this project doesn't use Vitest's `globals` mode (fixed by registering `afterEach(cleanup)` explicitly in a shared setup file), and jsdom does not implement `HTMLDialogElement.showModal()`/`close()` (fixed with a same-setup-file polyfill that only patches the test environment, never a real browser). Also caught and fixed a genuine Vite config-loading bug: `@tailwindcss/vite` is ESM-only and the root `package.json` has no `"type": "module"`, so Vite tried to load `vite.config.ts` as CommonJS and failed — renamed to `vite.config.mts` to force ESM loading for that one file. Beyond the automated tests, did a full live verification in a real headless Chromium (via a temporary Playwright script, `chromium-cli` not being available on this Windows machine): started the API, worker, and Vite dev server together, created a link through the actual form, visited the real short link three times to generate genuine click events end-to-end through the real queue/worker pipeline, and confirmed the chart, total-clicks metric, and all four breakdown cards rendered the correct live data (it even correctly classified Playwright's headless Chrome user agent as "Chrome Headless" desktop) — zero console or page errors across the whole session. Also screenshotted and confirmed the delete-confirmation dialog and a 375px mobile viewport (no horizontal scroll). All 169 automated tests pass (153 backend + 16 frontend); lint/typecheck/format all clean across the whole repo. | Claude (agent) |
| 2026-09-02 | H | — | Not started. Next up: hardening, deployment, and benchmark evidence (Workstream H) — the last workstream before Release 1 is complete, per the dependency map in `06-implementation-plan.md`. | — |
| 2026-09-02 | UI redesign | Not started → Done | Redesigned the frontend dashboard from the original minimalist spec toward a "modern polished minimal" Linear-inspired SaaS aesthetic, at the user's explicit request. New design tokens in `apps/web/src/styles/global.css` (cool-neutral canvas/surface palette, violet `#5B57E0` accent, `16px`/`10px` radii, a restrained two-layer shadow system, Inter with tightened letter-spacing) replace the original warm-neutral/indigo tokens. Added `lucide-react` and gave every card/badge/button a small supporting icon (metric cards, breakdown cards, empty states, the app-shell logo mark, copy/status/success icons) — all decorative (`aria-hidden`) and never a substitute for the existing text labels, preserving every accessibility rule from the original spec. `StatusBadge` moved from a filled pill to a dot-indicator pattern; `RangeSelector` moved from individual buttons to a segmented-control track; the app header is now sticky with a blurred backdrop; `MetricCard`/`BreakdownCard` gained a required `icon` prop (updated both call sites in `LinkDetailPage.tsx`). Also restyled the server-rendered public error pages (`apps/api/src/views/publicErrorPage.ts`) to the same palette/font for visual consistency across the whole product. Updated `docs/04-design-specification.md` in place (color tokens, shadow/radius rules, status badge and metric/breakdown card descriptions, app shell description, typography) per the user's explicit choice to keep the doc in sync rather than leaving it describing the old design. Verified with the full existing suite — all 169 tests still pass (one assertion in `LinkListItem.test.tsx` needed the click-count row to keep the word "clicks" next to the new icon, which was already a design-spec requirement) — plus `format:check`/`lint`/`typecheck` clean, and a live Playwright walkthrough (create-link flow, dashboard list, link-detail/empty-analytics page) with zero console errors, screenshotted for visual confirmation. | Claude (agent) |
| 2026-09-02 | Analytics refresh control | Not started → Done | Added a small icon-only refresh control beside the range selector on the link detail page (`RefreshCw` from `lucide-react`, spins while refreshing) so the owner can pull the latest click counts on demand, per the user's request. `useLinkAnalytics` (`apps/web/src/features/analytics/useLinkAnalytics.ts`) gained a `refresh()` function and `isRefreshing` flag: a manual refresh keeps existing analytics on screen and shows the spinner instead of replacing the page with the full loading skeleton. While building this, live-verified with a real create-link-then-click-then-refresh Playwright walkthrough and found a genuine pre-existing bug the new button exposed: the "30 days" (and "24 hours"/"7 days") range's end boundary was computed once via `useMemo(..., new Date())` at page mount and never advanced, so refreshing re-ran the identical frozen query and could never surface clicks that happened after the page loaded — confirmed against the raw API response (`totalClicks: 3` from the backend, `0` shown on screen) before diagnosing it as frontend-only. Fixed in `LinkDetailPage.tsx` by introducing a `rangeAnchorTime` state that anchors preset-range calculations and is advanced to `new Date()` on every refresh click (custom ranges are left untouched, since their boundaries are user-chosen, not "now"-relative). Also investigated a second user report ("geography is not being shown"): confirmed via direct Postgres query that `click_events.country_code`/`country_name` are `null` for local-dev clicks because the offline `geoip-lite` lookup cannot resolve `localhost`/`127.0.0.1` (private/loopback IPs) — this is expected, by-design behavior (see `apps/worker/src/enrichment/geoIpLookup.ts`), not a bug; the existing privacy-threshold grouping already surfaces these as an "Unknown" row rather than dropping them, confirmed live in the same Playwright walkthrough after the range fix. Documented the new refresh control in `docs/04-design-specification.md` Section 9.4 as one of the few permitted icon-only controls (Section 2.2), with its accessible-label/tooltip justification. All 169 tests still pass; lint/typecheck/format clean. | Claude (agent) |
| 2026-09-02 | H (Phase 7 — Quality, Security, and Operational Hardening) | Not started → Done | Full pass over Section 12's task list. **Correctness fix found and fixed**: `RedirectService.resolveFromDatabase` let a raw PostgreSQL error bubble up as a generic `500` on a cache miss; it now throws `ServiceUnavailableError` for a documented, controlled `503` (Section 12.3's explicit checklist item), covered by a new `redirectService.test.ts`. **Logging fix found and fixed**: both loggers (`apps/api` and `apps/worker` `observability/logger.ts`) spread `...fields` after the reserved `level`/`message`/`timestamp` keys, so any call site passing a field literally named `message` (very common — usually an error's own `.message`) silently overwrote the real log message; reordered the spread so the reserved keys always win, and renamed every colliding call-site field from `message` to `errorMessage` across both processes (10 call sites) for clarity. Also added a redaction guard to both loggers: any field whose *name* matches an IP/cookie/password/secret/token/authorization/connection-string pattern has its value replaced with `[REDACTED]` before the line is written, a safety net beyond every call site already avoiding these fields on purpose — covered by `logger.test.ts` in both processes. Added `apps/api/src/middleware/requestLoggingMiddleware.ts`: one structured line per request (method, path — never the query string, status, duration, request ID), wired in ahead of body parsing in `app.ts`. Added `GET /metrics` (`MetricsController`, `metricsRoutes.ts`): process uptime plus click-analytics queue depth (waiting/active/delayed/failed/completed counts and the oldest waiting job's age) — the signal explicitly deferred from the E-04 entry above. Reviewed cookie flags, proxy-trust configuration, CSRF strategy, and body-size limits — all were already correct (`HttpOnly`/signed/`SameSite=Lax`/`Secure` cookie, no CORS middleware so no cross-origin credentialed request is possible, `trust proxy` deliberately unset with a comment at the `request.ip` usage site, `express.json()` capped at `10kb`, `helmet()` already applied) and are now written up in the README rather than only living as inline comments. Wrote Dockerfiles for all three services (`apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/web/Dockerfile` — the last a two-stage build producing a static bundle served by nginx, with `apps/web/nginx.conf` proxying `/api`/`/health` to the API service exactly like the Vite dev proxy does) and extended `docker-compose.yml` with `api`/`worker`/`web` services, health-check-gated startup ordering, and a root `.dockerignore`. Bumped the base image (and `package.json`'s `engines.node`) from `node:20-alpine` to `node:24-alpine` after the first build surfaced a real `EBADENGINE` warning — `geoip-lite` actually requires Node ≥24, matching the Node version this project has been developed and tested against all along. **Verified live**: built and ran the full five-service stack with real Docker Desktop, ran migrations and the partition-maintenance script from inside the `api` container against the containerized Postgres, and completed a full create-link → redirect → worker-processes-it → analytics-visible journey entirely through `web`'s nginx proxy on port 8080, confirmed via `docker compose logs worker` that the job was processed — then tore the test containers/volume down and restored the native dev environment (only the `redis` container the project already used remains, matching the state before this session). Added `scripts/seedSampleData.ts` (`npm run seed`) — three obviously-fake links with varied click events; found and fixed a real robustness bug in its own first draft (a hardcoded "N days ago" offset could compute a timestamp in the previous, unpartitioned month depending what day it's run, since `click_events` is a partitioned table — fixed by clamping to the start of the current UTC month). Added failure-mode unit tests that did not previously exist: `redirectService.test.ts` (cache-error fallback, DB-error → 503, not-found), `clickEventPublisher.test.ts` (queue rejects, queue hangs past its 500ms budget, IP/referrer/user-agent field shape), `healthController.test.ts` (both dependencies healthy, DB down → 503, Redis-only down → still 200 degraded, a hung dependency doesn't block forever). Ran `npm audit`: unchanged root causes (`esbuild` via Vite/Vitest's dev toolchain, `glob` via `node-pg-migrate`'s CLI, neither reachable through this project's own code) — refreshed the README's explanation and added the honest caveat that the Docker images do include these dev dependencies (since `tsx` itself is one and there is no separate compile step), unlike the previous "neither ships in the deployed image" claim which stopped being true once real images existed. Reviewed migrations/indexes/partition-maintenance procedure while exercising it for real inside Docker — no changes needed, everything ran cleanly. Added a "Backup, restore, and retention" section to the README (`pg_dump`/`pg_restore` procedure, why Redis needs none, the not-yet-built retention job). Updated the README's Implementation status table, top status banner, and API overview table. All 196 tests pass (169 → 196: 27 new); lint/typecheck/format clean. | Claude (agent) |

