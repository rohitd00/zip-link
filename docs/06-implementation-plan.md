# Implementation Plan

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | ZipLink |
| Document | Implementation Plan |
| Version | 1.0 |
| Intended cadence | One-week focused build, expandable to two weeks for polish and testing |
| Related documents | `01-prd.md` through `05-database-schema.md` |

## 2. Objective

Build a complete, demonstrable URL shortener with cache-optimized redirects and asynchronous analytics, while maintaining a clean codebase that is understandable to a human reviewer. The plan prioritizes a correct core before performance features, then adds cache, queue, analytics, dashboard, and operational proof in increments.

The project must be usable at the end of every completed phase. Do not wait until the final day to integrate the API, worker, database, and dashboard.

## 3. Delivery Strategy

### 3.1 Build order

```text
Foundation
   ↓
Durable links + base62 redirect
   ↓
Cache-aside redirect optimization
   ↓
Queued click-event processing
   ↓
Analytics API + rollups
   ↓
Minimal dashboard
   ↓
Hardening, containers, benchmarks, README
```

### 3.2 Why this order

- The durable link/redirect path proves the main product works before cache or queue complexity is introduced.
- Redis caching is added only after database fallback behavior can be tested.
- Analytics is introduced as a separate system after redirect correctness is stable, preserving the critical non-blocking boundary.
- The dashboard consumes completed API contracts rather than forcing backend behavior to change around a half-finished UI.
- Benchmarking happens after behavior and observability are in place, ensuring results are defensible.

## 4. Pre-Implementation Decisions

Complete these decisions before the first feature branch/task begins. They are small, but each prevents a later cross-cutting rewrite.

| Decision | Recommended initial choice | Owner / outcome |
| --- | --- | --- |
| Language | TypeScript with strict mode | Shared API/queue contracts and clearer maintenance. |
| Package manager | Choose one and commit its lockfile | Reproducible install. |
| Database access layer | Explicit parameterized SQL or a thin typed query layer | Must support PostgreSQL partitions/migrations cleanly. |
| Owner identity | Signed anonymous-session cookie for Release 1 | Enables ownership without full account system. |
| Generated code policy | Case-sensitive custom base62 | Preserves all 62 alphabet characters. |
| Alias policy | 3–64 chars, `[A-Za-z0-9_-]`, case-sensitive | Simple behavior consistent with generated codes. |
| Redirect default | HTTP 302 | Safer initial behavior. |
| Duplicate default | `return_existing` for same owner + normalized URL | Reduces accidental duplicate creation. |
| Geo database | A licensed offline GeoIP dataset accepted for the project | No per-click external network request. |
| Analytics retention | Raw events 12–13 months; confirm before public use | Creates operational boundary. |

Record final choices in `.env.example`, README, and a short architecture decision log where they differ from these recommendations.

## 5. Phase 0 — Repository and Local Environment Foundation

### 5.1 Goal

Create a reproducible development environment and code skeleton without implementing product behavior yet.

### 5.2 Tasks

1. Initialize the repository and workspace layout from the technical specification.
2. Create the API, worker, web, and shared-package directories.
3. Configure TypeScript strict mode, linting, formatting, and test runner.
4. Add environment validation module and `.env.example` without real credentials.
5. Add Docker Compose services for PostgreSQL and Redis first; API/worker service definitions can follow once their Dockerfiles exist.
6. Add a minimal database migration tool configuration.
7. Add a root README with local prerequisites and a work-in-progress architecture note.
8. Add CI workflow that runs dependency installation, formatting check, lint, type check, and unit tests.
9. Add a `.gitignore` that excludes secrets, local database volumes, logs, and generated artifacts.

### 5.3 Deliverables

- Repository structure exists and is documented.
- A developer can copy `.env.example` to `.env`, start PostgreSQL/Redis, and run a placeholder API and worker process.
- The test command succeeds with one sample unit test.
- CI checks run from a clean checkout.

### 5.4 Verification

- [ ] `docker compose up` starts PostgreSQL and Redis without manual database setup.
- [ ] API startup validates missing required configuration with a safe, readable error.
- [ ] Worker startup validates required configuration independently.
- [ ] No real secret or connection password is committed.
- [ ] Formatting/lint/type-check commands execute successfully.

### 5.5 Humanized-code rule in this phase

Do not create a clever “magic configuration” module. Define one configuration field at a time with an explicit parser, description, and validation error. Use descriptive names such as `postgresConnectionString` and `redirectCacheTtlSeconds`.

## 6. Phase 1 — Database Foundation and Shared Domain Contracts

### 6.1 Goal

Install the authoritative schema and define shared application contracts before controllers or UI make assumptions about data shapes.

### 6.2 Tasks

1. Create migrations for enums, `links`, indexes, trigger, partitioned `click_events`, first/future monthly partitions, dedupe table, rollup tables, and rollup checkpoints.
2. Write a partition-creation utility and test it using a future month.
3. Define shared types/contracts:
   - Link record and public link DTO.
   - Owner context.
   - Link creation request/response.
   - Redirect cache payload.
   - Click-event queue payload, including event version.
   - Analytics response DTOs.
4. Implement the custom base62 encoder and decoder with `bigint` support.
5. Implement URL validation and normalization service.
6. Implement alias validation and reserved-route policy.
7. Implement link-state evaluator (`active`, `expired`, `deleted`) based on timestamps.
8. Add repository test helpers that create isolated owner contexts and link rows.

### 6.3 Deliverables

- A clean database can be migrated from zero state.
- Migration runs are repeatable and inspectable.
- Shared contracts make it clear which fields cross API/worker boundaries.
- Core pure functions are covered by unit tests.

### 6.4 Verification

- [ ] `links.short_code` uniqueness is enforced.
- [ ] A preallocated numeric identifier converts to expected base62 values.
- [ ] Base62 encode/decode round trip works across edge values.
- [ ] Unsupported URL protocols are rejected.
- [ ] Reserved aliases are rejected regardless of case policy selected.
- [ ] A click event inserts into the intended monthly partition.
- [ ] A duplicate `event_id` cannot produce a second raw event through the dedupe transaction.
- [ ] Migration tests run against empty and upgraded databases.

### 6.5 Exit criteria

No API route is built on untested implied database behavior. Link and analytics data shapes are written once in shared contracts and imported by API/worker code rather than copied as ad hoc interfaces.

## 7. Phase 2 — Core Link Management and Database-Backed Redirects

### 7.1 Goal

Make links creatable, listable, deletable, and publicly redirectable using PostgreSQL only. Analytics and Redis are deliberately not required in this phase.

### 7.2 Tasks

1. Implement owner-context middleware using secure signed cookie behavior for local/development and production-safe flags based on environment.
2. Implement rate-limiting abstraction with a temporary in-memory development adapter if Redis is not yet integrated; production adapter follows in Phase 3.
3. Implement `LinkRepository` methods:
   - Find active duplicate by owner + normalized URL.
   - Allocate ID/create generated-code link.
   - Create custom-alias link.
   - List owned active links using cursor pagination.
   - Find public link by short code.
   - Find owned link by short code.
   - Soft delete owned link.
4. Implement `LinkService` business rules:
   - Input validation.
   - Duplicate handling.
   - Expiry validation.
   - Generated versus custom code decision.
   - Ownership behavior.
5. Implement API controllers/routes:
   - `POST /api/links`.
   - `GET /api/links`.
   - `GET /api/links/:code`.
   - `DELETE /api/links/:code`.
6. Implement `GET /:code` public redirect using only PostgreSQL.
7. Implement browser and JSON variants for not-found, expired, and temporary-service errors.
8. Add request ID, safe structured logging, body-size limit, and consistent error middleware.
9. Add API integration tests and basic end-to-end HTTP tests.

### 7.3 Required behavior

| Behavior | Expected result |
| --- | --- |
| Valid generated link | `201`, custom base62 code, correct long URL. |
| Valid custom alias | `201`, exact alias, unique storage. |
| Existing duplicate with reuse policy | `200`, existing link flagged. |
| Invalid destination | `400`, readable field error. |
| Alias collision | `409`, readable field error. |
| Valid active public code | `302` to stored destination. |
| Expired public code | `410`, no redirect. |
| Deleted/unknown public code | `404`, no redirect. |
| Owner delete | soft delete persists and subsequent public request fails. |
| Cross-owner management request | generic `404` response. |

### 7.4 Verification

- [ ] Concurrent generated link creation does not create duplicate codes.
- [ ] A requested custom alias is never changed silently.
- [ ] Deleted link does not appear in active owner list.
- [ ] Destination URL appears only as a safely escaped value in responses/UI templates.
- [ ] Redirect never waits on any analytics code.
- [ ] API errors include request ID but not stack trace/SQL error.

### 7.5 Exit criteria

The product has a correct, database-backed shortener that can be demonstrated without Redis or the worker. This becomes the reliability baseline for all later phases.

## 8. Phase 3 — Redis Cache-Aside and Production Rate Limiting

### 8.1 Goal

Add Redis as an optimization and policy store without turning it into the source of truth.

### 8.2 Tasks

1. Create a Redis connection factory with explicit lifecycle shutdown and error handling.
2. Create `RedirectCacheRepository` with named methods:
   - `getCachedRedirectLink`.
   - `setCachedRedirectLink`.
   - `deleteCachedRedirectLink`.
   - Optional `setNegativeRedirectCacheEntry` only after an explicit policy decision.
3. Implement cache payload serialization/deserialization with schema validation.
4. Add TTL calculation that uses the smaller of default TTL and remaining link lifetime.
5. Update link creation to populate Redis after PostgreSQL commit, as best effort.
6. Update redirect flow to cache-aside:
   - cache lookup;
   - expiry check from payload;
   - PostgreSQL fallback on miss/error;
   - backfill cache for active records.
7. Update delete flow to invalidate cache after successful database soft delete.
8. Replace temporary limiter with Redis-backed creation rate limiting.
9. Add cache metrics and Redis health/readiness behavior.
10. Add integration tests with real local Redis.

### 8.3 Cache correctness rules

- Redis errors never cause the API to redirect to an unverified URL.
- Redis errors never prevent creation or deletion database operations from completing.
- A cache record is checked for expiry on every hit.
- Database deletion is authoritative even if cache invalidation temporarily fails.
- No cache value includes owner/session/private fields.

### 8.4 Verification

- [ ] A warm redirect executes with no PostgreSQL lookup (verify through test spy/log/metric).
- [ ] A cache miss retrieves the correct database record and backfills Redis.
- [ ] TTL for an expiring link never extends past expiry.
- [ ] Deleting a link removes its cache key.
- [ ] Redis outage falls back to PostgreSQL and records a metric.
- [ ] Rate limit rejects only link creation, with `429` and retry guidance.
- [ ] Reserved public routes still cannot become aliases.

### 8.5 Exit criteria

The redirect path is correct when cache is present, missing, stale-at-expiry, and unavailable. Cache behavior is measurable and has no untested invalidation path.

## 9. Phase 4 — Queued Click Event Pipeline

### 9.1 Goal

Capture a click event for each successful redirect without adding parsing or storage latency to the redirect path.

### 9.2 Tasks

1. Configure a BullMQ queue with named queue, retry/backoff, completed/failed job retention, and connection lifecycle.
2. Implement `ClickEventPublisher`:
   - Create UUID event ID.
   - Capture bounded request headers and trusted client IP.
   - Add event version, link ID/code, and UTC occurrence time.
   - Publish using the documented bounded behavior.
3. Add queue publication immediately after valid link resolution in the redirect handler.
4. Ensure queue publishing failure is logged/measured but cannot turn a valid redirect into an error.
5. Implement worker bootstrap and graceful shutdown.
6. Implement worker processor:
   - Validate job payload and version.
   - Normalize referrer.
   - Parse user agent.
   - Read offline GeoIP data.
   - HMAC-hash IP and discard raw value.
   - Execute dedupe claim + raw-event insertion transaction.
7. Implement retry classification and failed-job diagnostics without storing raw sensitive payloads in logs.
8. Add queue depth/age, completed/failed, and worker duration metrics.
9. Add worker integration tests against Redis/PostgreSQL and deterministic parser/geo test doubles.

### 9.3 Implementation boundary

The redirect controller is allowed to construct a small job payload and call the publisher. It is not allowed to import user-agent parser, GeoIP library, click-event repository, or aggregation queries. Enforce this through directory/module boundaries and code review.

### 9.4 Verification

- [ ] A valid redirect sends `302` before analytics worker completion.
- [ ] Pausing/stopping the worker does not change redirect success behavior.
- [ ] A queued job creates exactly one click event after worker processing.
- [ ] Retried job with same event ID creates no duplicate event.
- [ ] Raw IP appears in neither database row nor logs.
- [ ] Unknown UA/geo values still persist a click with safe fallback values.
- [ ] Queue unavailability increments failure metric but does not fail redirect.

### 9.5 Exit criteria

The system has a demonstrable asynchronous pipeline: an active redirect succeeds, a job appears in the queue, a worker enriches it, and the click event is durable in PostgreSQL—without synchronous coupling.

## 10. Phase 5 — Analytics Queries and Rollups

### 10.1 Goal

Provide accurate, owner-authorized link analytics with a time range, timeline, and breakdowns. Make performance scalable through partition-aware raw queries and rebuildable rollups.

### 10.2 Tasks

1. Implement `AnalyticsRepository` query methods:
   - Total clicks in range.
   - Hour/day timeline.
   - Top referrers.
   - Device breakdown.
   - Browser breakdown.
   - Country/city breakdown.
2. Implement `AnalyticsService`:
   - Verify ownership before querying analytics.
   - Validate and cap date range.
   - Choose hour/day bucket based on range.
   - Apply timezone/presentation policy.
   - Apply geographic privacy threshold.
   - Add eventual-consistency freshness metadata.
3. Implement `GET /api/links/:code/analytics`.
4. Add query plan tests/manual checks to confirm link/time range uses partitions/indexes.
5. Implement rollup scheduler using a recent overlap window.
6. Implement hourly/daily time rollup first, then dimension rollups as necessary.
7. Implement upsert/recompute behavior and checkpoint updates.
8. Add an internal/restricted endpoint or command that reports rollup freshness; do not expose operational data publicly.
9. Add integration tests that compare raw event results with rollup results across delayed-event scenarios.

### 10.3 Query rollout policy

Start simple and correct:

- Use raw events for small/recent ranges.
- Enable hourly rollups first once charts need larger/repeated ranges.
- Enable daily/dimension rollups when query plans or benchmark results justify them.
- Never add a rollup that cannot be recomputed from raw events.

### 10.4 Verification

- [ ] Analytics API returns `404` before leaking data for unowned links.
- [ ] A selected range is validated and reflected in response metadata.
- [ ] Zero-event range returns an explicit empty result, not a failure.
- [ ] Timeline includes stable sorted buckets.
- [ ] Direct/unknown referrer is represented consistently.
- [ ] City values below the configured threshold are grouped/suppressed.
- [ ] Rerunning the same rollup interval produces the same final counts.
- [ ] A late queued event is included after overlap recomputation.
- [ ] Large-range queries use rollups or otherwise remain within documented limits.

### 10.5 Exit criteria

An owner can fetch a coherent analytics response for a link, and the response remains correct with worker retries and delayed events. The rollup mechanism has repeatable tests, not just a one-time successful run.

## 11. Phase 6 — Minimal React/Tailwind Dashboard

### 11.1 Goal

Deliver a polished but restrained interface that consumes the stable APIs and makes the product intuitive without hiding important lifecycle/analytics information.

### 11.2 Tasks

1. Install/configure Tailwind design tokens from the design specification.
2. Build application shell/header.
3. Build reusable accessible primitives:
   - Primary/secondary/destructive buttons.
   - Text field, date/time field, field error, and form status.
   - Copy button.
   - Status badge.
   - Empty/error/loading states.
   - Confirmation dialog.
4. Build dashboard home:
   - Create-link form and advanced options disclosure.
   - Creation result/duplicate result panel.
   - Owned links list, search, cursor pagination, copy interactions.
5. Build link details:
   - Link overview and lifecycle state.
   - Range controls.
   - Total metric, chart, and ranked breakdown cards.
   - Empty/partial/loading/failure analytics states.
   - Delete confirmation and completion navigation.
6. Build public 404/410 presentation pages or server-rendered equivalents consistent with design system.
7. Add responsive behavior at specified breakpoints.
8. Add accessible chart table alternative/summary.
9. Add UI tests for create errors, copy feedback, range changes, deletion modal keyboard behavior, and empty states.

### 11.3 UI implementation rules

- Use named components rather than long duplicated Tailwind class strings.
- Keep server/API calls in a small client module with typed responses.
- Keep form state explicit; avoid compressed generic form abstractions that obscure validation flow.
- Do not introduce a global state library unless concrete interaction complexity proves it necessary.
- Do not render untrusted destination URLs as raw HTML.
- Preserve inputs on validation and recoverable network errors.

### 11.4 Verification

- [ ] A new user understands how to create a short link from the home screen.
- [ ] Advanced options remain unobtrusive but accessible.
- [ ] The result can be copied by keyboard and pointer.
- [ ] Long URLs do not break layout on desktop or mobile.
- [ ] Analytics clearly states freshness delay.
- [ ] Chart has readable alternate textual/tabular data.
- [ ] Deletion cannot happen without confirmation.
- [ ] The interface remains usable at 200% zoom and on narrow screens.

### 11.5 Exit criteria

The complete Release 1 user journey works visually and accessibly: create, copy, visit, process click, inspect analytics, and delete.

## 12. Phase 7 — Quality, Security, and Operational Hardening

### 12.1 Goal

Turn a working application into a safe, reproducible, review-ready project with evidence for its architectural claims.

### 12.2 Tasks

1. Review all API input paths for server-side validation and parameterized queries.
2. Verify cookie flags, proxy trust configuration, CSRF strategy, body-size limits, and security headers.
3. Verify raw IP never reaches persistence/logging/analytics API output.
4. Add structured request/worker logging and redaction tests.
5. Finalize health/live, health/ready, and metrics endpoints.
6. Write Dockerfiles for web/API/worker and finish Docker Compose topology.
7. Add graceful shutdown handling for HTTP server, PostgreSQL pool, Redis, BullMQ queue, and worker.
8. Add local seed script with explicitly non-sensitive sample links/events.
9. Add failure-mode tests: Redis unavailable, queue unavailable, worker stopped, cache miss, expired cached entry, DB unavailable after cache miss.
10. Run dependency and license/security checks appropriate to the project environment.
11. Review migrations, indexes, and partition maintenance procedure.
12. Add backup/restore and retention notes to operations README section.

### 12.3 Verification

- [ ] API does not start with invalid/missing required configuration.
- [ ] A Redis outage leaves database-backed redirects functional.
- [ ] Queue outage does not fail valid redirect.
- [ ] A database outage with a cache miss returns controlled `503`, not an unsafe redirect.
- [ ] Health/readiness behavior matches deployment expectations.
- [ ] Graceful shutdown completes/returns in-flight work according to documented behavior.
- [ ] Docker Compose starts all services and supports a complete local journey.
- [ ] Logs can be inspected without exposing secrets or raw IPs.

### 12.4 Exit criteria

The project can be handed to another developer who can start, test, and understand it from the repository documentation without unwritten setup knowledge.

## 13. Phase 8 — Benchmarking, Documentation, and Release Candidate

### 13.1 Goal

Measure redirect performance honestly and document the system in a way that supports a portfolio, resume, demo, or technical interview discussion.

### 13.2 Tasks

1. Add/load a seed link for repeatable redirect testing.
2. Warm the cache and run `autocannon` normal-load scenario.
3. Run burst/concurrency scenario.
4. Run a cache-cold scenario separately.
5. Record throughput, p50, p95, p99, error rate, cache hit ratio, runtime machine details, concurrency, duration, and dataset conditions.
6. Repeat tests enough times to avoid publishing one anomalous run.
7. Add benchmark results to README with date/environment caveat.
8. Document architecture diagrams, setup, API endpoints, privacy behavior, cache strategy, queue strategy, trade-offs, and future scale path.
9. Add screenshots or a short demo flow only after UI is final.
10. Create a release checklist and tag/version only after all automated checks pass.

### 13.3 Benchmark scenario template

| Scenario | Cache state | Concurrency | Duration | Record |
| --- | --- | --- | --- | --- |
| Baseline | warm | chosen low/normal value | fixed duration | RPS, p50/p95/p99, errors, cache ratio. |
| Burst | warm | chosen high value | fixed duration | Same metrics plus CPU/memory. |
| Cold lookup | cleared relevant key | normal value | fixed duration | Miss behavior and first-hit latency. |
| Queue degraded | worker paused / controlled queue issue | normal value | fixed duration | Redirect behavior and enqueue failures. |

Do not copy placeholder numbers into README or a resume. Every numeric claim must cite a recorded run.

### 13.4 Final verification

- [ ] Unit, integration, UI, and end-to-end suites pass.
- [ ] Formatting, lint, and type checks pass.
- [ ] Redirect benchmark report is reproducible.
- [ ] README accurately describes actual, not planned, features.
- [ ] Architecture diagrams match deployed components.
- [ ] Open risks/known limitations are documented honestly.
- [ ] Project-wide humanized-code review is complete.

## 14. One-Week Suggested Schedule

This is a realistic focused schedule, not permission to skip testing or hardening.

| Day | Main outcome | Phases covered |
| --- | --- | --- |
| Day 1 | Workspace, migrations, domain contracts, base62, URL/alias rules | 0–1 |
| Day 2 | Create/list/delete links and database-backed redirects | 2 |
| Day 3 | Redis cache-aside and creation rate limiting | 3 |
| Day 4 | BullMQ publisher, worker, UA/geo/IP privacy, idempotent event writes | 4 |
| Day 5 | Analytics endpoint, raw queries, initial rollups | 5 |
| Day 6 | Minimal accessible dashboard and public error pages | 6 |
| Day 7 | Docker, hardening, load test, README, release candidate | 7–8 |

If a day slips, protect correctness of phases 1–4. A smaller dashboard and raw-event-only short-range analytics are better than a fast-looking interface that synchronously writes analytics on redirect.

## 15. Dependency Map

```text
Phase 0 (environment)
   └─> Phase 1 (schema/contracts)
          ├─> Phase 2 (core API + redirect)
          │      └─> Phase 3 (cache + limiter)
          │              └─> Phase 4 (queue + worker)
          │                      └─> Phase 5 (analytics + rollups)
          │                              └─> Phase 6 (dashboard)
          └──────────────────────────────────────────────> Phase 7 (hardening)
                                                          └─> Phase 8 (benchmarks/release)
```

Parallel work is appropriate only after shared contracts are stable. For example, one contributor can build analytics UI components while another completes worker enrichment, but both must use the agreed analytics response DTO rather than inventing separate shapes.

## 16. Testing Matrix by Layer

| Layer | Primary tests | Essential cases |
| --- | --- | --- |
| Shared domain | Unit | Base62, URL normalization, alias validation, expiry state, TTL. |
| Repositories | Integration | Constraints, cursor list, duplicate lookup, partition insertion, transaction rollback. |
| API service | Integration/HTTP | Auth context, create/list/delete, redirect states, errors, cache fallback. |
| Redis/cache | Integration | Cache hit/miss, expiry bound, invalidation, outage. |
| BullMQ/worker | Integration | Publish, retry, dedupe, enrichment fallback, no raw IP persistence. |
| Analytics | Integration | Range/bucket validation, privacy thresholds, rollup convergence. |
| React UI | Component/E2E | Form errors, copy, empty/loading/error states, delete modal, responsive layouts. |
| Deployment | Smoke | Compose startup, health checks, graceful shutdown. |
| Performance | Load | Warm/cold cache, burst, queue-degraded redirect behavior. |

## 17. Definition of Done by Feature

A feature is not done merely because its happy path works. It is done when:

1. Its requirements and edge cases are identified in the relevant specification.
2. Its server-side validation and authorization rules are implemented.
3. It has unit/integration coverage at the appropriate boundary.
4. It has useful loading, empty, success, and error behavior in the UI if user-facing.
5. It emits appropriate safe logs/metrics if operationally meaningful.
6. It follows naming, module boundaries, and verbose humanized-code conventions.
7. It is documented if it changes setup, API behavior, privacy, architecture, or known limitations.

## 18. Implementation Risks and Decision Gates

| Risk / decision gate | Trigger | Required response |
| --- | --- | --- |
| ORM cannot support partition/migration needs | Before Phase 1 completion | Use explicit parameterized SQL or change tooling before feature code accumulates. |
| Anonymous owner context harms desired UX | During Phase 2 UI review | Decide whether to add auth before building dashboard assumptions. |
| GeoIP package/data licensing is unsuitable | Before Phase 4 | Select compliant offline source or omit city-level data until resolved. |
| Cache stale-after-delete window is unacceptable | Phase 3 test/review | Add stronger invalidation retry/outbox policy before release. |
| Raw-event analytics is slow | Phase 5 query plan/load tests | Enable/extend rollups; do not simply raise time range limits. |
| Queue backlog grows under test | Phase 4/8 | Tune worker concurrency, database inserts, job payload, and scale plan. |
| UI scope threatens core delivery | Day 6 | Keep UI to create/list/detail/analytics; omit cosmetic extras. |
| Benchmark numbers are weak | Phase 8 | Report actual numbers and analyze bottlenecks; do not fabricate claims. |

## 19. Humanized Code Review Checklist

Before merge/release, review code specifically for readability:

- [ ] Names explain purpose without needing a comment.
- [ ] Business policy has named functions rather than scattered inline conditionals.
- [ ] Controllers are thin; services hold decisions; repositories hold SQL/persistence.
- [ ] Error handling has explicit branches for expected conditions.
- [ ] No dense nested ternaries or clever chained expressions obscure behavior.
- [ ] Functions have a single clear responsibility and manageable length.
- [ ] Interfaces clearly distinguish HTTP, cache, queue, and database shapes.
- [ ] Comments explain why a non-obvious choice exists.
- [ ] Tests use descriptive scenario names that explain the behavior being protected.
- [ ] Tailwind/UI code uses reusable components rather than unreadable duplicated class lists.

## 20. Final Release Checklist

- [ ] Database migrations and partition maintenance are verified.
- [ ] Generated base62 links and custom aliases work under concurrent requests.
- [ ] Redirect cache-aside path works with safe PostgreSQL fallback.
- [ ] Redirect does not wait for analytics worker processing.
- [ ] Analytics queue/worker is idempotent and privacy-preserving.
- [ ] Owner-only link management and analytics access are enforced.
- [ ] Dashboard implements the approved minimalist design and accessibility requirements.
- [ ] Docker Compose supports the full local journey.
- [ ] Health, logs, and metrics are present and safe.
- [ ] Load benchmark evidence is recorded.
- [ ] README and all project docs match the implementation.
- [ ] No secrets, raw IP addresses, fabricated benchmark values, or undocumented shortcuts remain.

