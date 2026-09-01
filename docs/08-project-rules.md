# Project Rules and Engineering Standards

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | URL Shortener with Analytics at Scale |
| Document | Project Rules and Engineering Standards |
| Version | 1.0 |
| Applies to | API, worker, web app, database migrations, infrastructure, tests, documentation, and agents |
| Authority | Mandatory unless a documented decision explicitly changes a rule |

## 2. Purpose

This document establishes non-negotiable engineering, product, and delivery rules for the project. It exists to protect the system’s most important properties:

- Redirects stay fast and correct.
- Analytics remains asynchronous and privacy-conscious.
- The codebase stays readable to human maintainers.
- Data and security decisions remain intentional.
- The minimalist UI stays clear and accessible.
- Documentation and benchmark claims remain honest.

When a convenience shortcut conflicts with one of these rules, follow the rule or raise a documented decision for approval.

## 3. Priority Order for Conflicts

When requirements conflict, apply this order:

1. User safety, security, privacy, and legal obligations.
2. Redirect correctness and protection of destination integrity.
3. Public API/data correctness and database integrity.
4. Required product behavior in the PRD.
5. Performance, reliability, and observability.
6. Accessibility and clarity of user experience.
7. Code style, developer convenience, and optional polish.

For example, do not optimize a redirect by serving a cache record known to be expired; correctness outweighs a small latency gain. Do not improve dashboard “real-time” appearance by showing a count that analytics has not yet processed; data honesty outweighs visual polish.

## 4. Core Architecture Rules

### Rule A-01 — Keep the redirect path independent

The public redirect handler may resolve an active link, check cache, read PostgreSQL on cache miss, attempt bounded event publication, and send the redirect response. It must not synchronously:

- Parse a user-agent string.
- Call GeoIP lookup.
- Insert a click event.
- Aggregate analytics.
- Wait for BullMQ worker completion.
- Render/compute dashboard information.
- Perform remote HTTP calls unrelated to resolving the redirect.

Reason: redirects are latency-sensitive; analytics processing is delay-tolerant.

### Rule A-02 — PostgreSQL is authoritative for link metadata

Redis is a cache and queue backend. It is not the permanent source of link truth.

- A Redis cache miss must fall back to PostgreSQL.
- A Redis outage must not cause the application to guess a redirect destination.
- A database write commits before a cache population attempt.
- A database soft delete remains valid even if cache invalidation temporarily fails.
- Cache payloads contain only the fields required for redirects.

### Rule A-03 — Use cache-aside correctly

For an active redirect:

1. Read `redirect:link:{shortCode}` from Redis.
2. Validate cache payload and cached expiry.
3. On cache hit, redirect.
4. On miss/malformed/error, read authoritative PostgreSQL row.
5. If active, calculate bounded TTL and backfill cache.
6. Never cache a deleted link. Do not cache an expired link as active.

Cache invalidation is mandatory after a successful delete and required after any future update that affects destination, expiry, or status.

### Rule A-04 — Analytics is event-driven and eventual

- Every successful redirect attempts to publish a versioned click job.
- Queue publication failure is logged/metricized but does not fail a valid redirect.
- A worker, not the redirect service, enriches and persists clicks.
- Analytics UI/API clearly allows for a short processing delay.
- No screen or documentation claims “real-time analytics” unless the implementation later guarantees it.

### Rule A-05 — Worker events must be idempotent

- The API creates a UUID `eventId` for every click job.
- The worker uses the event deduplication transaction before inserting a click event.
- Retried jobs must result in one stored click, not one row per attempt.
- A job can be acknowledged only after successful transaction completion or recognized prior completion.

### Rule A-06 — Design for scale, implement only evidence-backed complexity

The architecture documents future hot-key, replica, local-cache, and rollup strategies. Do not implement every future-scale idea preemptively.

Add complexity only when:

- It is required for Release 1 correctness/security, or
- Measurement identifies it as a bottleneck, or
- A clear approved requirement demands it.

Any such addition must include a concise rationale, tests, operational behavior, and documentation.

## 5. Code Style: Humanized and Verbose Code

### Rule C-01 — Write for the next human reader

This project requires humanized code. Code must explain itself through names, structure, and explicit behavior.

Required practices:

- Use descriptive variables: `resolvedRedirectLink`, `remainingCacheLifetimeSeconds`, `analyticsJobPayload`.
- Use descriptive function names: `calculateRedirectCacheTtl`, `validateCustomAlias`, `hasLinkReachedExpiry`.
- Use named types/interfaces at HTTP, cache, queue, database, and UI boundaries.
- Separate validation, business decisions, persistence, and response mapping into understandable units.
- Prefer a few clear statements over one clever expression.
- Return/throw explicit application errors with stable meaning.
- Make expected failure branches visible in the code.

### Rule C-02 — Avoid excessive shorthand

Avoid code that is technically shorter but harder to inspect. In particular, do not use:

- Nested ternary expressions.
- Single-letter variable names except a conventional small-scope loop index.
- Long chains of optional access/fallback/array transformations that hide business logic.
- Dense inline callbacks containing validation, side effects, and error behavior together.
- Implicit `any`, broad type assertions, or ignored type errors.
- Abbreviations that a new contributor cannot decode.
- “Smart” generic abstractions that conceal key link/redirect/analytics behavior.

Prefer this:

```ts
const hasLinkReachedExpiry =
  link.expiresAt !== null && link.expiresAt.getTime() <= currentTime.getTime();

if (link.deletedAt !== null) {
  return { state: "deleted" };
}

if (hasLinkReachedExpiry) {
  return { state: "expired" };
}

return { state: "active" };
```

Over this:

```ts
return link.deletedAt ? "deleted" : link.expiresAt && +link.expiresAt <= +now ? "expired" : "active";
```

The first version is preferred because the conditions are readable, debuggable, and easy to test.

### Rule C-03 — Keep responsibilities separated

| Layer | Allowed responsibility | Must not do |
| --- | --- | --- |
| Route/controller | Parse HTTP request, invoke service, map response/error | Contain SQL, cache details, business policy, or enrichment. |
| Service | Apply product rules and coordinate dependencies | Directly know Express request/response details. |
| Repository | Parameterized persistence operations | Decide HTTP status, parse headers, or render UI. |
| Cache adapter | Serialize/cache redirect payloads | Authorize owners or query analytics. |
| Queue publisher | Construct/publish typed job | Enrich UA/geo or write click data. |
| Worker processor | Validate/enrich/persist queued event | Resolve public redirects or render UI. |
| UI component | Present data and collect user input | Reimplement server authorization or validation policy. |

### Rule C-04 — Comment reasons, not syntax

Good comment:

```ts
// Analytics enqueue failure must not fail the redirect because visitor latency
// is more important than capturing every click during a transient queue outage.
```

Unhelpful comment:

```ts
// Set the cache key.
const cacheKey = createRedirectCacheKey(shortCode);
```

Use comments for constraints, trade-offs, surprising behavior, external system quirks, or security rationale. Keep them current when behavior changes.

### Rule C-05 — Be explicit at boundaries

- Validate HTTP input before it reaches the service layer.
- Validate/deserialise Redis payloads before trusting them.
- Validate queue job version and required fields before processing.
- Convert database rows to domain objects or response DTOs deliberately.
- Never return a raw database row directly as a public API response.

## 6. API Rules

### Rule API-01 — Version and stabilize contracts

- All management JSON endpoints use `/api`.
- Every error uses the documented structured error shape.
- Click job payloads include `eventVersion`.
- API changes that affect consumers require updates to contracts, tests, docs, and web client together.
- Do not alter field names or response semantics silently.

### Rule API-02 — Validate on the server

Client validation improves user experience but never replaces server validation.

Server must validate:

- HTTP/HTTPS-only destination protocol.
- URL parseability and configured length limits.
- Custom alias character/length/reserved word policy.
- Future expiry timestamp.
- Pagination limit/cursor syntax.
- Analytics date range, bucket option, and timezone policy.
- Request body size.

### Rule API-03 — Preserve ownership boundaries

- Link list, detail, analytics, and delete operations require a resolved owner context.
- Authorize before expensive analytics queries.
- For unknown or unowned management resources, return the same generic `404` behavior.
- Do not expose whether another owner uses a code, except the public redirect behavior that is intentionally public.

### Rule API-04 — Use safe error semantics

| Condition | Response |
| --- | --- |
| Invalid request data | `400` with actionable field/form error. |
| Alias conflict | `409` with no extra private detail. |
| Creation rate limit | `429` and `Retry-After` where available. |
| Unknown/deleted public link | `404`. |
| Expired public link | `410`. |
| Missing/unowned management resource | generic `404`. |
| Required dependency unavailable | controlled `503` when request cannot be served correctly. |
| Unexpected server failure | `500` generic safe message and request ID. |

Never expose stack traces, SQL errors, dependency URLs, or secret-bearing configuration in a client response.

### Rule API-05 — Protect route order

Register static routes, web routes, `/api`, health, metrics, and other reserved paths before the catch-all public `GET /:code` route. Alias validation must reserve application path words.

## 7. Database Rules

### Rule DB-01 — Migrations are the only schema change mechanism

- Create all schema changes through committed ordered migrations.
- Do not manually change shared/production schema and then attempt to “catch up” source files.
- Do not edit a migration already applied to a shared environment; add a forward migration.
- Test migrations from both empty and upgrade states.
- Use descriptive migration names.

### Rule DB-02 — Preserve link integrity

- PostgreSQL `bigint` identity/sequence allocates generated-link IDs safely.
- The application custom-encodes this ID to base62.
- `short_code` uniqueness must remain a database constraint.
- Custom-alias collision maps to an explicit conflict; never silently mutate the alias.
- Delete links with `deleted_at`; do not hard-delete required history in Release 1.
- Evaluate expiry from `expires_at` at redirect time.

### Rule DB-03 — Use parameterized queries exclusively

No user-controlled value may be concatenated into SQL. This includes URLs, aliases, search terms, date-range values, bucket choices, owner IDs, and pagination values.

For SQL fragments that cannot be parameterized (for example a `date_trunc` unit), choose only from a small internal allowlist and bind all remaining values normally.

### Rule DB-04 — Partition event data intentionally

- `click_events` must be range partitioned by UTC time according to schema specification.
- Create future partitions before the current horizon ends.
- Ensure every partition has required link/time indexes.
- Verify partition pruning for analytics queries.
- Prefer dropping eligible old partitions over large row-by-row delete operations.
- Do not drop a partition until retention, backup, and rollup requirements are met.

### Rule DB-05 — Make analytics writes idempotent

- Use the dedupe-claim and click-event insertion in one transaction.
- Rollback claims on insert failure.
- Upsert rollups using recomputed counts; do not blindly increment values in a retryable job.
- Test duplicate queue delivery and late-event overlap handling.

### Rule DB-06 — Do not hide query cost

- Every analytics query must have link/time range bounds.
- Dashboard list must not execute unbounded `count(*)` per link row at scale.
- Add indexes from observed query patterns and query plans, not speculation.
- Do not raise allowed analytics range merely to hide slow queries.
- Use rollups when measured raw-event scans become unsuitable.

## 8. Privacy and Data Handling Rules

### Rule P-01 — Never persist raw IP addresses

- Raw client IP is used only transiently by the worker for offline GeoIP lookup and HMAC hashing.
- Persist only `ip_hash` and `ip_hash_key_version` when required.
- Do not put raw IP in application, worker, queue-diagnostic, test fixture, trace, or analytics API log output.
- Test this rule with a known sample address and log/database assertions.

### Rule P-02 — Use HMAC, not a plain hash

Compute the pseudonymous IP value with HMAC-SHA-256 and an environment-held secret. A plain SHA hash of an IP is insufficient because potential input values are enumerable. Plan secret rotation with a stored key version.

### Rule P-03 — Minimize analytics data

- Store only fields needed for required analytics: time, referrer, device/browser, approximate geography, privacy-safe hash.
- Bound/truncate headers before queue storage.
- Do not add cookies, destination query parameters, precise GPS coordinates, names, email addresses, or device fingerprints.
- Represent unavailable enrichment with safe unknown/null values rather than collecting more data unnecessarily.

### Rule P-04 — Geography is approximate and thresholded

- Use offline approximate IP-to-geo data.
- Do not describe geographic analytics as exact location.
- Apply configured minimum-count threshold before showing city-level figures.
- Group suppressed/low-volume city data into country-only or `Other` according to documented policy.

### Rule P-05 — Retention is an explicit policy

- Retention periods must be documented before public deployment.
- Raw events, rollups, dedupe IDs, failed jobs, and logs have different retention needs.
- Retention cleanup must be safe, monitored, and tested with non-production data first.
- Do not keep data “just in case.”

## 9. Security Rules

### Rule S-01 — Validate destination URLs rigorously

- Permit only `http:` and `https:` schemes.
- Reject `javascript:`, `data:`, `file:`, malformed URLs, and URL credentials.
- Enforce maximum length.
- Use a standard URL parser, not regex alone.
- Store original validated URL for redirect and a documented normalized form only for duplicate detection.

### Rule S-02 — Configure proxy trust deliberately

Client IP and secure-cookie behavior depend on correct reverse-proxy configuration. Do not set broad trust-proxy behavior without knowing deployment topology. A spoofed forwarding header must not let a user bypass rate limits or corrupt analytics.

### Rule S-03 — Secure owner context

- Owner cookies must be signed and opaque.
- Use `HttpOnly`; use `Secure` in production; choose `SameSite` deliberately.
- Regenerate/fail safely on invalid signature.
- Do not place the owner identifier in page markup, URL, local storage, or public API response.
- Add CSRF protection or an explicitly justified same-origin mitigation for cookie-authenticated state changes.

### Rule S-04 — Protect secrets

- Secrets belong in environment configuration or a secret manager.
- Never commit `.env` files containing values, database exports containing credentials, private keys, or real production connection strings.
- Never print configuration objects wholesale in logs.
- Rotate any secret immediately if it is accidentally exposed.

### Rule S-05 — Apply defensive HTTP settings

- Use TLS in deployed environments.
- Construct public short URLs from configured `PUBLIC_BASE_URL`, not incoming Host header.
- Set body size, request timeout, and safe header limits.
- Add content-security policy and other appropriate security headers for dashboard/error pages.
- Escape untrusted values in all HTML/UI rendering.

### Rule S-06 — Least privilege

- Runtime API/worker database users should have only required permissions.
- Migration permissions are separate from runtime permissions in production where practical.
- Metrics and internal health endpoints are not publicly exposed without deliberate access control.

## 10. Redis and Queue Rules

### Rule R-01 — Namespace keys clearly

Use clear prefixes, for example:

```text
redirect:link:{shortCode}
rate-limit:create:{ownerType}:{ownerId}
```

BullMQ retains its own key pattern. Do not write arbitrary cache keys inside BullMQ’s namespace or use broad database-wide cleanup commands.

### Rule R-02 — Cache values must be validated

Treat Redis contents as untrusted serialized data:

- Parse safely.
- Validate shape/types before use.
- Treat invalid/missing expected fields as cache miss.
- Never redirect based on a partially parsed or malformed payload.

### Rule R-03 — Cache TTLs must respect lifecycle

- Non-expiring active links use configured bounded TTL.
- Expiring links use the smaller of standard TTL and remaining link lifetime.
- Cache entry must not be used after `expires_at` even if Redis TTL has not fired.
- Cache writes/invalidation are best effort but observable.

### Rule R-04 — Queue failure does not fail redirect

The redirect path catches queue publisher failure, records structured error/metric, and sends the valid redirect. Do not add a retry loop that keeps a visitor waiting. Queue retry behavior belongs to BullMQ/worker processing, not browser redirect completion.

### Rule R-05 — Control queue growth

- Set job attempts/backoff/concurrency intentionally.
- Retain completed/failed jobs for a bounded diagnostic period.
- Monitor depth and oldest job age.
- Test worker outage/backlog recovery.
- Do not use unlimited job retention in Redis.

## 11. Testing and Quality Rules

### Rule Q-01 — Test behavior at the correct layer

| Behavior | Minimum test type |
| --- | --- |
| Base62, URL, alias, expiry, TTL | Unit test |
| Database constraints/transactions/partitions | Integration test with PostgreSQL |
| Cache hit/miss/invalidation | Integration test with Redis + PostgreSQL |
| Queue publish/worker/dedupe | Integration test with BullMQ + Redis + PostgreSQL |
| API ownership/status/error behavior | HTTP integration test |
| Create-to-analytics user journey | End-to-end test |
| Dashboard keyboard/responsive states | Component and end-to-end test |
| Redirect capacity/latency | Reproducible load test |

Mocks are useful for deterministic unit tests, but no feature is complete until its actual dependency boundary has been tested where required.

### Rule Q-02 — Protect critical cases with tests

At minimum, maintain regression tests for:

- Generated base62 uniqueness/correctness.
- Custom alias conflict.
- Expired/deleted/unknown redirect status.
- Cache hit avoids database lookup.
- Cache miss backfills correct record.
- Queue failure leaves valid redirect successful.
- Job retry does not double-count click.
- Raw IP does not persist/log.
- Cross-owner analytics/delete denial.
- Rollup recomputation handles late events.
- Creation rate limiting.
- Dashboard form error preservation and delete confirmation.

### Rule Q-03 — Quality checks are required before completion

Before marking a feature or release complete, run relevant formatting, lint, type, unit, integration, and end-to-end checks. Treat skipped checks as an explicit risk, not an invisible omission.

### Rule Q-04 — Benchmark honestly

- Use `autocannon` or another documented tool.
- Separate warm-cache and cold-cache results.
- Record test environment, duration, concurrency, endpoint, cache state, throughput, p50/p95/p99, and errors.
- Repeat tests to identify outliers.
- Never fabricate or extrapolate numbers into README, demo, or resume language.

## 12. Observability and Operations Rules

### Rule O-01 — Use structured, safe logs

Log useful context such as request ID, route, status, duration, cache outcome, safe link/code reference, job ID, retry attempt, and failure category.

Never log:

- Raw IP address.
- Cookie or authorization header.
- Database/Redis connection string.
- HMAC secret.
- Full unbounded user-agent/referrer payload.
- Stack trace in public response.

### Rule O-02 — Instrument the meaningful system boundaries

Required measurements include:

- Redirect request count/outcome/cache hit/miss.
- Redirect duration percentiles.
- Cache errors.
- Click enqueue success/failure.
- Queue depth/oldest job age.
- Worker completion/failure/retry/duration.
- Rate-limit rejections.
- Rollup freshness/failure.

Metrics must make it possible to distinguish “redirect is slow” from “analytics is behind.”

### Rule O-03 — Health checks have narrow meaning

- Liveness asks whether process is responsive; it must not perform expensive dependency work.
- Readiness asks whether required dependencies are available for the service’s declared role.
- Health checks time out quickly.
- Do not expose detailed dependency credentials/status publicly.

### Rule O-04 — Graceful shutdown is required

On shutdown:

- Stop accepting new API requests when appropriate.
- Allow a bounded period for in-flight requests.
- Stop worker job acquisition and complete/return in-flight work according to BullMQ policy.
- Close database/Redis connections.
- Log shutdown start/completion safely.

## 13. UI and Design Rules

### Rule U-01 — Keep it minimalist

- Use neutral surfaces, one restrained accent color, readable type, and generous whitespace.
- Keep navigation limited to what the product needs.
- Use cards only to group meaningful regions.
- No flashy gradient, glass effect, decorative animation, or dense control panels.
- Make the primary action obvious and singular per screen.

### Rule U-02 — State must be clear

Every user-facing async area needs designed loading, empty, success, error, and partial-data states. Do not leave blank chart areas, unexplained disabled buttons, or vanished form values after an error.

### Rule U-03 — Accessibility is functional, not optional

- Visible labels, focus states, semantic controls, keyboard support, and WCAG AA contrast are required.
- Do not use color as the only status indicator.
- Charts require text/table alternative or meaningful summary.
- Modal delete confirmation must manage focus correctly.
- Support mobile view and 200% zoom without breaking key tasks.

### Rule U-04 — Use honest language

- Say “Recent clicks may take a moment to appear,” not “real-time.”
- Say “Location is approximate,” not “visitor location.”
- Say “This link is unavailable” or “This link has expired,” not raw HTTP/database error language.
- Say “That custom alias is already in use,” not “unique constraint violation.”

### Rule U-05 — Destructive actions require confirmation

Deleting a link requires explicit confirmation and plainly states that the short URL will stop redirecting. The final destructive button is visually distinct and not the default focused action.

## 14. Documentation Rules

### Rule D-01 — Keep specifications synchronized

When implementation changes product behavior, architecture, API contract, schema, design, or operational behavior, update the matching document in `docs/url-shortener-analytics/` in the same change set.

### Rule D-02 — Document actual behavior

Documentation must distinguish:

- Implemented behavior.
- Planned behavior.
- Stretch/future scale behavior.
- Known limitation or trade-off.

Do not present an unimplemented local hot cache, distributed ID system, rollup, authentication system, or benchmark as complete.

### Rule D-03 — README is a working handoff

The README must contain:

- Product summary and architecture diagram.
- Setup/configuration instructions.
- Database migration and partition-maintenance instructions.
- How to run API, worker, web, and Docker Compose.
- API overview and example flows.
- Analytics privacy/freshness behavior.
- Load-test commands/results.
- Known limitations and future scale path.

### Rule D-04 — Record decisions and deviations

If a rule or documented choice changes, record:

1. What changed.
2. Why it changed.
3. Alternatives considered.
4. Impact on API/schema/security/performance.
5. Migration/rollback approach where applicable.

## 15. Git and Change-Management Rules

### Rule G-01 — Keep changes focused

- One logical concern per commit/change set where practical.
- Do not combine a dependency upgrade, schema rewrite, UI redesign, and feature behavior change without need.
- Preserve unrelated user/workspace changes.
- Review diffs for generated files, logs, secrets, and accidental formatting churn.

### Rule G-02 — Migrations and code deploy together

For changes requiring schema support, ensure deployment order is safe:

- Additive migration first where possible.
- Deploy code compatible with old/new schema during transition.
- Backfill/verify data if needed.
- Remove obsolete schema only in a later deliberate migration.

### Rule G-03 — Do not use destructive recovery shortcuts

- Do not run broad reset, broad cache flush, or unscoped delete commands to “fix” a test or deployment.
- Resolve exact affected keys/tables/partitions first.
- Prefer recoverable or targeted operations.
- Back up/verify before retention-related partition drops.

## 16. Required Review Questions

Every feature review must answer these questions in plain language:

1. Does this change keep redirect response independent from analytics worker completion?
2. What happens if Redis is unavailable?
3. What happens if PostgreSQL is unavailable?
4. What happens if the queue or worker is unavailable?
5. Does this introduce, persist, or log sensitive data?
6. Does it preserve owner authorization boundaries?
7. Is the code understandable without relying on hidden shorthand or tribal knowledge?
8. What tests prove expected behavior and failure behavior?
9. Does it change any API/schema/documentation contract?
10. Does the UI communicate state/accessibility clearly if user-facing?

If any answer is unknown, the feature remains `In review` or `Blocked`, not `Done`.

## 17. Release Gate

Release is allowed only when all statements are true:

- [ ] Redirect links use custom base62 codes and resolve correctly.
- [ ] PostgreSQL is source of truth; Redis is cache-aside and safely fallible.
- [ ] Deletion/expiry prevent further redirects under documented cache behavior.
- [ ] Analytics runs through queued worker processing and cannot block redirect.
- [ ] Click events are idempotent and no raw IP address is persisted/logged.
- [ ] Link management/analytics are owner-authorized.
- [ ] Rate limiting is active for link creation.
- [ ] Dashboard is minimalist, responsive, and accessibility-tested.
- [ ] Migrations, partitions, Docker setup, health checks, and shutdown behavior are verified.
- [ ] Performance claims are backed by recorded benchmark data.
- [ ] README and detailed documents match shipped behavior.
- [ ] Code review confirms the required humanized, verbose style.

## 18. Quick Reference: Never Do These Things

- Never synchronously insert analytics on the redirect endpoint.
- Never let queue failure prevent a valid redirect.
- Never serve an expired link because a cache record exists.
- Never use Redis as the only copy of a link.
- Never use UUID/Nano ID/random strings for generated short codes instead of custom base62 encoding.
- Never persist or log a raw IP address.
- Never expose another owner’s link/analytics information.
- Never concatenate user input into SQL.
- Never silently alter a requested custom alias.
- Never claim analytics is real time if it is asynchronous.
- Never fabricate benchmark figures.
- Never hide critical logic in terse shorthand.
- Never sacrifice labels, keyboard access, or error clarity for visual minimalism.
- Never commit secrets or make broad destructive infrastructure changes to resolve a local issue.

