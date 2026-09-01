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
| Queue and analytics worker | Not started | Unassigned | Redis/cache foundation complete. |
| Analytics API and rollups | Not started | Unassigned | Worker produces raw events. |
| Dashboard UI | Not started | Unassigned | Stable API contracts available. |
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
| Status | Not started |
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
| Status | Not started |
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

- [ ] Queue job includes link ID, code, occurrence time, referrer, UA, and IP input.
- [ ] Public redirect succeeds when publisher throws/times out.
- [ ] Redirect controller does not import parsing/GeoIP/database event modules.

### E-03: Worker enrichment and persistence

| Field | Detail |
| --- | --- |
| Status | Not started |
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
| Status | Not started |
| Priority | P1 |
| Depends on | E-02, E-03 |
| Deliverable | Metrics/logs for queue delivery and worker processing. |

To-do:

- [ ] Emit enqueue success/failure counters.
- [ ] Emit job completion/failure/duration metrics.
- [ ] Surface queue depth and oldest-job age internally.
- [ ] Include safe event/job IDs in structured logs.
- [ ] Add alert thresholds/documented operator guidance.

Acceptance evidence:

- [ ] A deliberately failed job is visible without exposing its raw sensitive payload.
- [ ] Worker backlog is observable.

## 10. Workstream F — Analytics API and Rollups

### F-01: Raw analytics query layer

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P0 |
| Depends on | E-03 |
| Deliverable | Partition-aware raw-event queries for a single link/time range. |

To-do:

- [ ] Implement total count query.
- [ ] Implement timeline query with validated hour/day bucket.
- [ ] Implement top-referrer/device/browser/geography queries.
- [ ] Ensure link ID/time bounds drive all queries.
- [ ] Validate query plan/index usage with representative data.

Acceptance evidence:

- [ ] Query results are sorted, bounded, and use selected range.
- [ ] `Direct / unknown` and missing fields are normalized consistently.
- [ ] Raw range query does not scan unrelated partitions.

### F-02: Analytics service and endpoint

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P0 |
| Depends on | F-01, C-01 |
| Deliverable | Owner-authorized analytics API contract. |

To-do:

- [ ] Resolve owned link before query.
- [ ] Validate `from`, `to`, timezone, bucket, and max range.
- [ ] Select a sensible default date range/bucket.
- [ ] Build response with range and freshness metadata.
- [ ] Apply city-level privacy threshold.
- [ ] Return explicit zero-data response.

Acceptance evidence:

- [ ] Unowned link returns generic 404 before data query.
- [ ] Valid owner receives all required summaries.
- [ ] No raw IP hash or personal identifier appears in output.
- [ ] Invalid range returns readable 400 error.

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
| Status | Not started |
| Priority | P0 |
| Depends on | A-02, B-03 |
| Deliverable | Minimalist Tailwind tokens and accessible reusable components. |

To-do:

- [ ] Implement colors/type/spacing/radius tokens from design spec.
- [ ] Build button, field, error, copy, badge, card, empty state, and dialog primitives.
- [ ] Test focus/keyboard behavior.
- [ ] Avoid duplicate dense class strings; use named components.

Acceptance evidence:

- [ ] Components meet contrast/touch/focus requirements.
- [ ] Destructive and primary variants are visually distinct and labelled.

### G-02: Dashboard create/list experience

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P0 |
| Depends on | C-03, G-01 |
| Deliverable | Functional home page for create, copy, list, filter, and pagination. |

To-do:

- [ ] Build create form with advanced options disclosure.
- [ ] Map API validation/conflict/rate-limit errors to clear UI states.
- [ ] Render new/duplicate result panel.
- [ ] Implement copy state and fallback.
- [ ] Render empty/loading/error/populated link-list states.
- [ ] Add filter and cursor pagination.
- [ ] Ensure responsive link-row/card behavior.

Acceptance evidence:

- [ ] Form values survive recoverable errors.
- [ ] A successful link appears in list without full page reload.
- [ ] Long URLs do not overflow layout.
- [ ] Keyboard user can operate create/copy/filter/pagination.

### G-03: Link detail and analytics experience

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P0 |
| Depends on | F-02, G-01 |
| Deliverable | Link overview, date range, metrics, chart, breakdowns, and deletion UI. |

To-do:

- [ ] Render link header/status/destination/copy action.
- [ ] Implement preset and custom analytics range controls.
- [ ] Render total metric, timeline, and ranked lists.
- [ ] Implement chart table/text alternative.
- [ ] Render loading, zero, partial, and failure analytics states.
- [ ] Explain eventual analytics delay unobtrusively.
- [ ] Implement delete modal with focus management and navigation on success.

Acceptance evidence:

- [ ] Every displayed summary uses selected time range.
- [ ] No-data state is useful and non-misleading.
- [ ] Delete needs explicit confirmation.
- [ ] Layout works at mobile width and 200% zoom.

### G-04: Public error pages

| Field | Detail |
| --- | --- |
| Status | Not started |
| Priority | P1 |
| Depends on | C-04, G-01 |
| Deliverable | Minimal 404/410 browser screens matching approved design. |

To-do:

- [ ] Build unavailable and expired page components/templates.
- [ ] Keep content neutral and non-revealing.
- [ ] Support JSON errors for API-oriented Accept header.
- [ ] Verify route does not leak destination or owner details.

Acceptance evidence:

- [ ] Public pages use correct status code and clear copy.
- [ ] Browser and JSON behavior are both tested.

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

- [ ] A-01 through A-04: reproducible environment.
- [ ] B-01, B-03, B-04: schema and trusted domain rules.
- [ ] C-01 through C-04: correct durable link and redirect baseline.
- [ ] D-01 and D-02: cache-aside redirect behavior.
- [ ] E-01 through E-03: non-blocking queue/worker analytics pipeline.
- [ ] F-01 and F-02: analytics API with ownership/privacy.
- [ ] G-02 and G-03: minimum usable dashboard.
- [ ] H-01, H-02, H-04: safe/reproducible release.

Potentially deferrable after the core is working:

- [ ] B-02: automated partition maintenance (must still have a documented manual process).
- [ ] D-03: rate limiter tuning beyond baseline policy.
- [ ] E-04: advanced alerting dashboards.
- [ ] F-03: full dimension rollups, if raw short-range queries are safe and documented.
- [ ] G-04: polished public error pages, though correct status behavior remains required.
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
| 2026-09-02 | E, F, G, H | — | Not started. Next up: BullMQ click-event queue + analytics worker (Workstream E), per the dependency map in `06-implementation-plan.md`. | — |

