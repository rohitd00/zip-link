# Technical Specification

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | ZipLink |
| Document | Technical Specification |
| Version | 1.0 |
| Status | Implementation-ready draft |
| Related document | `01-prd.md` |

## 2. Purpose and Scope

This document defines the first-release technical architecture for a URL-shortening service with asynchronous click analytics. It turns the product requirements into concrete component boundaries, persistence behavior, API contracts, failure handling, security controls, and coding conventions.

The fundamental technical rule is:

> Redirect delivery is a latency-sensitive read path. Analytics enrichment and storage are an eventually consistent, background write path. The redirect must not wait for the analytics worker.

The initial stack is Node.js, Express, PostgreSQL, Redis, BullMQ, React, Tailwind, and a charting library. PostgreSQL is the durable source of truth for links. Redis improves read performance and backs the analytics queue. The system is designed so that individual API and worker instances can scale independently.

## 3. Architectural Decisions

| ID | Decision | Choice | Reason |
| --- | --- | --- | --- |
| ADR-001 | Link identifiers | PostgreSQL `bigint` sequence + custom base62 encoding | The database safely allocates IDs under concurrency, while the application demonstrates deterministic URL-safe encoding. |
| ADR-002 | Link source of truth | PostgreSQL | A cache must never be the only copy of redirect metadata. |
| ADR-003 | Redirect caching | Redis cache-aside, populated on creation and on cache miss | Optimizes frequent reads while preserving a correct database fallback. |
| ADR-004 | Cache records | Serialized redirect payload, not just destination URL | Enables expiry checks and allows the hot path to avoid unnecessary database reads. |
| ADR-005 | Analytics transport | BullMQ queue backed by Redis | Decouples redirect latency from parsing, geo lookup, and database writes. |
| ADR-006 | Analytics persistence | Separate time-partitioned PostgreSQL events table | Separates event-heavy data from link metadata and supports time-range queries. |
| ADR-007 | Analytics summaries | Raw events first, hourly/daily rollups via scheduled job when needed | Retains detail while preventing dashboard scans from becoming unbounded. |
| ADR-008 | IP privacy | HMAC-SHA-256 hash with a server secret; raw IP discarded | Supports limited pseudonymous analysis without persisting raw IP addresses. |
| ADR-009 | Redirect status | HTTP 302 as Release 1 default | Allows flexibility and avoids browsers permanently caching early destination mistakes. |
| ADR-010 | Owner identity | Owner-context abstraction | Supports a session-based anonymous Release 1 and later authentication without rewriting link services. |

## 4. System Context

```text
                       +--------------------+
                       |  React Dashboard   |
                       +----------+---------+
                                  |
                                  | HTTPS JSON API
                                  v
+----------+    GET /:code   +----------------------+       +-------------+
| Visitor  | --------------> | Express API service  | <-->  | PostgreSQL  |
+----------+                 | - redirect handler   |       | links/events|
                             | - management API     |       +-------------+
                             | - queue producer     |
                             +----+------------+----+
                                  |            |
                          cache lookup      enqueue event
                                  |            |
                                  v            v
                              +-------------------+
                              |       Redis       |
                              | cache + BullMQ    |
                              +---------+---------+
                                        |
                                        | consume
                                        v
                              +-------------------+
                              | Analytics worker  |
                              | UA + geo enrich   |
                              +---------+---------+
                                        |
                                        v
                                  +-------------+
                                  | PostgreSQL  |
                                  | click data  |
                                  +-------------+
```

## 5. Components and Responsibilities

### 5.1 Express API service

The API service is stateless. Multiple instances may run behind a reverse proxy or load balancer.

Responsibilities:

- Validate incoming link-management requests.
- Resolve owner context and enforce ownership authorization.
- Create, list, retrieve, and delete link metadata.
- Handle the public redirect route.
- Read and populate Redis redirect cache records.
- Publish a minimal click event to BullMQ after resolving a successful redirect.
- Serve analytics query endpoints by reading rollups/raw events.
- Expose health and metrics endpoints.

The API service must not parse user agents, call geo lookup services, write click rows, run aggregation work, or wait for these operations in the redirect handler.

### 5.2 Analytics worker

The worker is a separate executable/process. It can scale separately from the API.

Responsibilities:

- Consume click-event jobs from BullMQ.
- Validate and normalize queue payloads defensively.
- Parse user-agent information.
- Resolve approximate country/city through an offline GeoIP dataset.
- derive and persist a one-way IP hash; discard raw IP data after processing.
- Insert raw click events idempotently.
- Record structured failures, retry temporary failures, and send exhausted jobs to BullMQ’s failed-job handling.

### 5.3 Scheduled aggregation worker

This can initially be a scheduled mode within the analytics worker. It should later become a separate deployment if data volume requires it.

Responsibilities:

- Aggregate eligible raw events into hourly and daily bucket tables.
- Recompute a recent overlap period to absorb late-arriving jobs safely.
- Use upserts that make re-runs correct and repeatable.
- Track last successful aggregation time.

### 5.4 PostgreSQL

PostgreSQL stores durable link records, persisted click events, and analytics rollups. The relational database owns uniqueness constraints, link lifecycle state, and referential integrity.

### 5.5 Redis

Redis is used for two independent purposes:

- Redirect cache entries, which are disposable derived data.
- BullMQ queue state and job payloads, which require Redis persistence appropriate for the deployment.

Cache key prefixes and queue keyspaces must not overlap. A Redis flush destroys cache entries and may affect queue data; production configuration must treat this as a destructive operational event.

### 5.6 React dashboard

The dashboard is a minimal single-page application. It talks only to the `/api` endpoints and never directly to Redis, PostgreSQL, or BullMQ.

Primary views:

- Create link.
- Owned links list.
- Per-link analytics.

The dashboard must represent asynchronously processed data honestly: a small message such as “recent clicks may take a moment to appear” is sufficient.

## 6. Recommended Repository Layout

```text
ziplink/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── app.ts
│   │       ├── server.ts
│   │       ├── config/
│   │       ├── middleware/
│   │       ├── routes/
│   │       ├── controllers/
│   │       ├── services/
│   │       ├── repositories/
│   │       ├── cache/
│   │       ├── queue/
│   │       ├── validation/
│   │       ├── domain/
│   │       └── observability/
│   ├── worker/
│   │   └── src/
│   │       ├── worker.ts
│   │       ├── processors/
│   │       ├── enrichment/
│   │       ├── repositories/
│   │       └── jobs/
│   └── web/
│       └── src/
│           ├── pages/
│           ├── components/
│           ├── features/
│           ├── api/
│           └── styles/
├── packages/
│   └── shared/
│       └── src/
│           ├── contracts/
│           ├── constants/
│           └── base62/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── queries/
├── docker/
├── scripts/
├── tests/
├── docker-compose.yml
└── README.md
```

The final implementation may use JavaScript with JSDoc instead of TypeScript, but API and queue contracts must remain explicit and shared. For a project of this scope, TypeScript with strict compiler settings is recommended.

## 7. Domain Model

### 7.1 Link lifecycle

A link has one of these derived states:

| State | Definition | Redirect result |
| --- | --- | --- |
| Active | Not deleted and no expiry, or expiry is in the future | 302 redirect and event enqueue attempt |
| Expired | `expires_at` is at or before current UTC time | Expired-link response; no successful click event |
| Deleted | `deleted_at` has a value | Not-found/deleted response; no event |
| Unknown | No matching short code | Not-found response; no event |

Do not store a manually maintained `status` field for these states unless a future feature needs an explicit disable state. Deriving state from timestamps avoids inconsistent status transitions.

### 7.2 Owner context

Every management request resolves an `OwnerContext`:

```ts
interface OwnerContext {
  ownerType: "anonymous_session" | "authenticated_user";
  ownerId: string;
}
```

In Release 1, `anonymous_session` can be a signed, HTTP-only, secure cookie with a random server-generated identifier. The database stores an owner type and owner ID without coupling link records to a particular auth library. This allows later authenticated accounts to use the same authorization service.

Public redirect requests do not require an owner context.

### 7.3 URL normalization

The system stores both `long_url` and `normalized_long_url`.

Normalization is used only for duplicate detection; the redirect uses the original validated URL as submitted unless a documented product policy says otherwise.

Normalization rules:

1. Parse with the standard URL parser.
2. Permit only `http:` and `https:` protocols.
3. Lowercase protocol and hostname.
4. Remove the default port (`80` for HTTP, `443` for HTTPS).
5. Preserve path and query string.
6. Remove a trailing slash only for a bare origin path if this policy is explicitly accepted.
7. Do not reorder query parameters in Release 1, because their order may carry meaning.
8. Reject URL credentials, malformed hosts, and URLs beyond the configured maximum length.

## 8. Base62 Short-Code Algorithm

### 8.1 Alphabet

Use this fixed alphabet so the result is deterministic and testable:

```text
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
```

The alphabet has 62 symbols. Numeric identifier `0` encodes to `0`. All generated link IDs use positive database sequence values.

### 8.2 Encoding requirements

The encoder must:

- Accept a non-negative safe integer or `bigint`.
- Repeatedly divide by 62 and prepend the matching remainder symbol.
- Return `0` for input `0`.
- Reject negative values and non-integer values.
- Be covered by known-value unit tests and encode/decode round-trip tests.

Illustrative verbose implementation style:

```ts
export function encodeBase62(numericIdentifier: bigint): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const base = BigInt(alphabet.length);

  if (numericIdentifier < 0n) {
    throw new Error("A base62 identifier cannot be negative.");
  }

  if (numericIdentifier === 0n) {
    return "0";
  }

  let remainingValue = numericIdentifier;
  let encodedValue = "";

  while (remainingValue > 0n) {
    const remainder = remainingValue % base;
    const alphabetIndex = Number(remainder);
    encodedValue = alphabet[alphabetIndex] + encodedValue;
    remainingValue = remainingValue / base;
  }

  return encodedValue;
}
```

This style is intentional: descriptive variable names and explicit branches are preferred over compressed expressions.

### 8.3 Collision behavior

Generated codes do not use probability for uniqueness. The database assigns a unique numeric primary key, and the encoder is one-to-one for non-negative integers. A database unique constraint on `short_code` remains mandatory as a final correctness guard.

Custom aliases are subject to a separate unique constraint. If insertion collides, the API must return a conflict response rather than retrying with a different value without user consent.

## 9. Redirect Path Design

### 9.1 Sequence

```text
1. Visitor requests GET /:code.
2. Middleware validates code shape and creates a request ID.
3. Redirect service asks Redis for redirect:link:{code}.
4. On a valid cache hit: evaluate cached expiry and redirect target.
5. On cache miss or cache failure: query PostgreSQL for a non-deleted link.
6. Evaluate expiry from authoritative metadata.
7. If active: populate Redis cache with a bounded TTL.
8. Start queue publication of a minimal click event; do not await worker processing.
9. Send HTTP 302 with Location header.
```

### 9.2 Redirect cache payload

```json
{
  "linkId": "123456",
  "shortCode": "w7e",
  "longUrl": "https://example.com/campaign",
  "expiresAt": "2026-10-01T00:00:00.000Z",
  "redirectStatusCode": 302
}
```

`expiresAt` is `null` when no expiry exists. The payload must not include owner IDs, raw analytics data, or secrets.

### 9.3 Cache keys and TTL

| Key / setting | Value | Notes |
| --- | --- | --- |
| Redirect record | `redirect:link:{shortCode}` | JSON payload for a public link. |
| Negative record (optional) | `redirect:missing:{shortCode}` | Short TTL only; use carefully to avoid hiding a newly created alias. |
| Standard TTL | 24 hours | Default for non-expiring active links. |
| Expiring-link TTL | Minimum of 24 hours and remaining lifetime | Cache must not outlive link expiry. |
| Delete invalidation | `DEL redirect:link:{shortCode}` | Required after successful soft deletion. |

Redis availability is an optimization, not a redirect correctness dependency. On Redis read/write errors, log a structured error, increment an internal metric, and continue with the PostgreSQL path if possible.

### 9.4 Queue publication behavior

Queue publication should begin after an active link is resolved and before the redirect response is finalized, but the redirect service must use a strict, short operational budget. The API must not await worker completion, enrichment, or database storage.

Recommended approach:

- Construct the event synchronously from request headers and connection information.
- Attempt `queue.add` with a small timeout budget.
- On successful enqueue, continue redirecting.
- On enqueue failure or timeout, record an error/metric and continue redirecting.

Whether the queue enqueue itself is awaited briefly is an implementation choice; user-facing latency remains the priority. A production-grade durability enhancement may later use an outbox table, but it is not required for Release 1.

### 9.5 Hot keys and scale-out path

A viral code can be requested disproportionately. Release 1 relies on Redis to reduce database load. If a single Redis key becomes a bottleneck, the scale-out sequence is:

1. Measure hot-key traffic and cache command latency.
2. Add a small bounded in-process LRU cache with a very short TTL to API instances.
3. Add Redis replicas or cluster topology appropriate to the provider.
4. Deploy redirect service instances nearer to traffic sources.
5. Consider edge caching only after carefully defining expiry and deletion invalidation guarantees.

## 10. Analytics Pipeline Design

### 10.1 Job contract

The API publishes a versioned payload. It contains only the data needed by the worker.

```ts
interface ClickEventJobPayload {
  eventVersion: 1;
  eventId: string;
  linkId: string;
  shortCode: string;
  occurredAt: string;
  referrer: string | null;
  userAgent: string | null;
  clientIpAddress: string | null;
}
```

`eventId` is a UUID created by the API for idempotency. It is not a short-code generator and does not violate the custom base62 requirement.

The payload has no cookie identifiers, credentials, query-string copies from the destination URL, or raw request body.

### 10.2 BullMQ configuration

| Setting | Initial value | Rationale |
| --- | --- | --- |
| Queue name | `click-analytics` | Stable, descriptive name. |
| Attempts | 5 | Allows recovery from transient database/Redis issues. |
| Backoff | Exponential, starting at 1 second | Avoids retry storms. |
| Concurrency | Configurable, initial 10 | Tune based on CPU, GeoIP lookup cost, and database capacity. |
| Remove completed jobs | Retain a bounded recent count/age | Supports diagnosis without unlimited Redis use. |
| Remove failed jobs | Retain longer, bounded history | Enables operator investigation. |

The worker must classify errors. Validation errors or permanently malformed job payloads should fail without repeated retries. Transient database connection errors should retry.

### 10.3 Enrichment rules

User-agent parsing produces normalized categories such as:

- Device type: `desktop`, `mobile`, `tablet`, `bot`, `unknown`.
- Browser: canonical family name or `Unknown`.
- Operating system: optional Release 1 field, retained only if dashboard scope includes it.

GeoIP processing produces:

- Country code/name when lookup succeeds.
- City when supplied by the local database and safe to present under privacy thresholds.
- `Unknown`/`null` when no lookup is available.

The worker must not call a third-party HTTP API on every click. An offline lookup removes external latency, dependency, and rate-limit risk.

### 10.4 Privacy transformation

The worker computes:

```text
ip_hash = HMAC-SHA-256(IP_HASH_SECRET, canonical-client-IP)
```

Use an HMAC, not an unsalted plain hash: IP address spaces are small enough for precomputation attacks. Store the resulting encoded digest, not the raw input. The secret is an environment variable and must support planned rotation. When rotating, include a `ip_hash_key_version` field so old and new values are understandable without exposing IPs.

Do not use the IP hash as the first-release definition of a unique visitor. NAT, VPNs, mobile networks, and privacy tools make it unsuitable for precise identity claims.

### 10.5 Idempotency

The raw event table has a unique constraint on `event_id`. The worker inserts with conflict handling that treats an existing event as already completed. This protects counts when BullMQ retries after a process crash between a database commit and job acknowledgment.

### 10.6 Event freshness

Expected analytic sequence:

```text
redirect -> queued -> worker enrichment -> raw-event insert -> optional rollup -> dashboard query
```

The dashboard is eventually consistent. It should not display fabricated real-time counts. For the current day, the analytics endpoint may combine recent raw events with older rollups or simply query raw events for the selected small range. The exact query strategy is in the schema and implementation-plan documents.

## 11. API Specification

All JSON endpoints use the prefix `/api`. Error responses use this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The destination URL must use HTTP or HTTPS.",
    "details": [
      { "field": "longUrl", "message": "Use a valid HTTP or HTTPS URL." }
    ],
    "requestId": "req_..."
  }
}
```

No response must leak stack traces, database errors, internal hostnames, or secrets.

### 11.1 POST `/api/links`

Creates a link or returns an existing duplicate when allowed.

Request:

```json
{
  "longUrl": "https://example.com/articles/launch",
  "customAlias": "launch-2026",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "duplicateHandling": "return_existing"
}
```

Rules:

- `longUrl`: required, HTTP/HTTPS, maximum length configured server-side.
- `customAlias`: optional. Suggested policy: 3–64 characters, `[A-Za-z0-9_-]`; must not start with `_`; must not be reserved.
- `expiresAt`: optional ISO-8601 UTC timestamp in the future.
- `duplicateHandling`: `return_existing` or `create_new`; default determined by product configuration.
- Creation limit applies before expensive storage actions.

Successful response: `201 Created` for a new link, `200 OK` when an existing duplicate is returned.

```json
{
  "data": {
    "id": "123456",
    "shortCode": "w7e",
    "shortUrl": "https://sho.rt/w7e",
    "longUrl": "https://example.com/articles/launch",
    "createdAt": "2026-09-01T10:15:00.000Z",
    "expiresAt": "2026-12-31T23:59:59.000Z",
    "wasExistingDuplicate": false
  }
}
```

Errors: `400` validation, `409` alias conflict, `429` rate limited.

### 11.2 GET `/api/links`

Lists links owned by the current owner context.

Query parameters:

- `cursor`: opaque pagination cursor, optional.
- `limit`: 1–100, default 25.
- `query`: optional short-code or destination-text filter.
- `includeDeleted`: default false; initially admin-only or omitted.

Response:

```json
{
  "data": [
    {
      "shortCode": "w7e",
      "shortUrl": "https://sho.rt/w7e",
      "longUrl": "https://example.com/articles/launch",
      "createdAt": "2026-09-01T10:15:00.000Z",
      "expiresAt": null,
      "state": "active",
      "totalClicks": 42
    }
  ],
  "page": {
    "nextCursor": null,
    "limit": 25
  }
}
```

### 11.3 GET `/api/links/:code`

Returns management metadata for one link when owned by the requester. This endpoint must not be confused with the public redirect route.

Errors: `404` for a nonexistent or unowned link, avoiding cross-owner information disclosure.

### 11.4 DELETE `/api/links/:code`

Soft-deletes an owned link and invalidates its redirect cache entry.

Success: `204 No Content`.

The operation must be idempotent for an already deleted owned link, returning `204`; however, it must not reveal whether a code belongs to another owner.

### 11.5 GET `/api/links/:code/analytics`

Returns analytics for an owned link.

Query parameters:

- `from`: ISO-8601 timestamp, optional; default 30 days before `to`.
- `to`: ISO-8601 timestamp, optional; default current UTC time.
- `bucket`: `hour` or `day`; default selected based on date range.
- `timezone`: IANA zone used for presentation, default `UTC`.

Response:

```json
{
  "data": {
    "link": {
      "shortCode": "w7e",
      "shortUrl": "https://sho.rt/w7e",
      "longUrl": "https://example.com/articles/launch"
    },
    "range": {
      "from": "2026-08-01T00:00:00.000Z",
      "to": "2026-09-01T23:59:59.999Z",
      "timezone": "UTC",
      "bucket": "day"
    },
    "totalClicks": 1200,
    "timeline": [
      { "bucketStart": "2026-09-01T00:00:00.000Z", "clickCount": 84 }
    ],
    "referrers": [
      { "name": "https://news.example", "clickCount": 400 }
    ],
    "devices": [
      { "name": "mobile", "clickCount": 700 }
    ],
    "browsers": [
      { "name": "Chrome", "clickCount": 600 }
    ],
    "geography": [
      { "country": "India", "city": "Kolkata", "clickCount": 120 }
    ],
    "freshness": {
      "isEventuallyConsistent": true,
      "lastRollupAt": "2026-09-01T12:00:00.000Z"
    }
  }
}
```

The API must enforce a maximum analytics range in Release 1 to avoid accidental expensive scans. A reasonable initial maximum is 90 days unless backed by rollups.

### 11.6 GET `/:code`

Public redirect endpoint.

- Valid active link: `302` plus `Location`.
- Unknown or deleted link: `404` HTML error page, or JSON if requested.
- Expired link: `410 Gone` HTML error page, or JSON if requested.
- No JSON body is required on a successful redirect.

This route must be registered after static/API routes so reserved paths cannot be interpreted as short codes.

### 11.7 Operational endpoints

| Endpoint | Purpose | Exposure |
| --- | --- | --- |
| `GET /health/live` | Process is running | Load balancer/internal |
| `GET /health/ready` | Database and Redis dependency readiness | Load balancer/internal |
| `GET /metrics` | Prometheus-compatible or structured metrics | Protected/internal |

## 12. Validation and Reserved Routes

### 12.1 Reserved words

At minimum, aliases must reserve:

```text
api, health, metrics, assets, favicon.ico, robots.txt, admin,
login, logout, signup, register, links, analytics, docs
```

The exact list lives in shared constants and is checked case-insensitively. The database stores aliases in a normalized comparison form or uses a case-insensitive unique index according to the selected PostgreSQL approach.

### 12.2 Input limits

Initial server-side limits:

| Field | Proposed limit |
| --- | --- |
| Long URL length | 4,096 characters |
| Custom alias length | 3–64 characters |
| Referrer stored length | 2,048 characters |
| User-Agent input length | 1,024 characters |
| Analytics query range | 90 days |
| Link-list page size | 100 |

All limits are implementation configuration values and must be tested at their boundaries.

## 13. Rate Limiting

Link creation uses a Redis-backed sliding-window or token-bucket limiter. Use a stable key such as:

```text
rate-limit:create:{ownerType}:{ownerId}
```

For anonymous requests where no owner cookie exists, use a trusted client IP-derived key. Reverse-proxy settings must be configured so `req.ip` cannot be spoofed through arbitrary forwarded headers.

Initial product policy (configurable): 20 creation requests per 15 minutes per owner/IP. The API responds with `429 Too Many Requests` and `Retry-After` when known.

Redirect requests are not constrained by this creation limit. DDoS mitigation is deployment-layer infrastructure work and should be documented separately.

## 14. Database and Query Strategy

The detailed DDL is defined in the schema document. This section establishes the behavioral requirements.

- `links` is a small metadata table with unique short-code and owner-aware duplicate lookup indexes.
- `click_events` is separate and partitioned by month on `occurred_at`.
- `click_rollups` stores time bucket, link, dimensions, and counts using upsert-friendly uniqueness constraints.
- Link deletion is a soft delete (`deleted_at`) to preserve auditability and ownership behavior.
- Analytics queries select only the requested time range and use link/time indexes.
- For short recent ranges, raw click events may serve detailed analytics.
- For larger historical ranges, rollups are preferred once implemented.

## 15. Error Handling and Failure Modes

| Failure | API/worker behavior | User impact |
| --- | --- | --- |
| Redis cache unavailable | Log/measure; query PostgreSQL; do not populate cache | Redirect may be slower but works if database works. |
| PostgreSQL unavailable during redirect | Return controlled `503` error; do not redirect | Link temporarily unavailable; never guess a destination. |
| Queue unavailable | Log/measure; redirect still succeeds | Click may be absent from analytics. |
| Worker unavailable | Queue accumulates jobs | Analytics delayed; redirects unaffected. |
| GeoIP lookup failure | Persist click with null/unknown geography | Partial analytics only. |
| UA parser failure | Persist click with `unknown` classifications | Partial analytics only. |
| Duplicate queue job | Unique `event_id` prevents double insert | No double count. |
| Expired cache record | Check cached `expiresAt` against UTC now before redirecting | Prevents redirect after expiry. |
| Cache invalidation failure on delete | Database soft delete blocks fallback; cache TTL is backstop | Must alert/retry invalidation to minimize stale redirect window. |

## 16. Observability

### 16.1 Structured logging

Every API request has a `requestId`. Logs are JSON-like structured records and include only necessary fields:

- Request ID, route, response status, duration, cache result, and safe link ID/code.
- Queue job/event ID, attempt number, worker duration, and failure classification.
- Never raw IP address, authorization value, cookie, database password, or full sensitive payload.

### 16.2 Metrics

Required counters/histograms include:

- `redirect_requests_total` by outcome and cache result.
- `redirect_duration_seconds` histogram.
- `redirect_cache_hits_total` and `redirect_cache_misses_total`.
- `analytics_jobs_enqueued_total`, `analytics_jobs_enqueue_failures_total`.
- `analytics_jobs_completed_total`, `analytics_jobs_failed_total`, `analytics_job_duration_seconds`.
- Queue depth and oldest queued job age.
- `link_creation_requests_total` and `link_creation_rate_limited_total`.

### 16.3 Health checks

- Liveness: API/worker event loop is responsive. It must not query dependencies.
- Readiness: API validates PostgreSQL connectivity and Redis accessibility according to deployment policy. The worker validates Redis and PostgreSQL.
- Health checks must time out quickly and avoid load-amplifying work.

## 17. Security Requirements

1. Use TLS in deployed environments; construct public short URLs from a trusted configured base URL, not the incoming Host header.
2. Validate all destination URLs server-side and allow only HTTP/HTTPS.
3. Use parameterized database queries or a safe query builder/ORM; never concatenate user input into SQL.
4. Mark owner cookies `HttpOnly`, `Secure` in production, and an appropriate `SameSite` setting.
5. Apply CSRF protection to cookie-authenticated state-changing dashboard requests, or use a carefully designed same-origin strategy with explicit justification.
6. Enforce ownership checks in services/repositories, never only by hiding UI actions.
7. Implement a content security policy for dashboard and error pages.
8. Apply body-size limits and request timeouts.
9. Keep secrets in environment variables or a production secret manager, never in version control.
10. Treat user-controlled destination URLs as untrusted in all admin/dashboard rendering; escape text output.

## 18. Configuration Contract

| Variable | Required | Example purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Runtime environment. |
| `PORT` | Yes | API listener port. |
| `PUBLIC_BASE_URL` | Yes | Canonical URL used to generate short URLs. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `REDIS_URL` | Yes | Redis connection string. |
| `IP_HASH_SECRET` | Yes | HMAC secret for IP pseudonymization. |
| `IP_HASH_KEY_VERSION` | Yes | Marks hash-secret rotation generation. |
| `REDIRECT_CACHE_TTL_SECONDS` | Yes | Default cache TTL. |
| `CREATE_RATE_LIMIT_MAX_REQUESTS` | Yes | Creation quota. |
| `CREATE_RATE_LIMIT_WINDOW_SECONDS` | Yes | Creation quota window. |
| `ANALYTICS_WORKER_CONCURRENCY` | Yes | Worker concurrency. |
| `GEOIP_DATABASE_PATH` | Yes | Offline GeoIP database location. |
| `LOG_LEVEL` | Yes | Structured log filtering. |

Startup must validate configuration and fail fast with safe messages if required values are absent or malformed.

## 19. Testing Strategy

### 19.1 Unit tests

- Base62 encode/decode known values and invalid input.
- URL validation/normalization edge cases.
- Alias validation and reserved-word checks.
- Expiry-state calculation at boundary times.
- Cache TTL calculation.
- IP HMAC generation and key-version handling.
- Analytics classification fallbacks.

### 19.2 Integration tests

- Create generated/custom links against PostgreSQL.
- Database uniqueness under concurrent creation attempts.
- Cache-aside redirect behavior with Redis.
- Deletion and expiry cache invalidation.
- BullMQ producer/worker round trip and idempotent event insert.
- Ownership authorization and no cross-owner data disclosure.
- Analytics aggregation/rollup correctness.

### 19.3 End-to-end tests

- Create link from dashboard, open redirect, wait for event processing, view analytics.
- Invalid/expired/deleted browser behavior.
- Mobile and desktop dashboard paths.
- Rate limit feedback.

### 19.4 Load tests

Use `autocannon` against `GET /:code` with an existing active link. Record:

- Normal and burst scenario requests/second.
- p50, p95, p99 latency.
- Cache hit ratio.
- API CPU/memory and database/Redis observations.
- Cache-warm and cache-cold results separately.

No performance claim is published until it is measured in a documented environment.

## 20. Coding Standards for This Project

The project has an explicit humanized-code requirement.

1. Prefer descriptive nouns and verbs: `resolvedRedirectLink`, not `result`; `hasReachedExpiry`, not `expired` where the boolean’s meaning could be unclear.
2. Prefer clear multi-step control flow to dense chained expressions.
3. Do not use terse single-letter variables except conventional loop indices in a very small scope.
4. Avoid nested ternaries, overly compact callbacks, implicit `any`, and clever shorthand that obscures failure handling.
5. Extract policy decisions—TTL selection, alias validation, expiry evaluation, queue retry classification—into named functions with tests.
6. Use explicit interfaces/types at application boundaries: HTTP DTOs, database rows, cache payloads, and queue jobs.
7. Return typed/structured errors from services; controllers map them to HTTP responses.
8. Write comments for non-obvious reasons, such as why analytics enqueue failure cannot fail redirect. Do not comment obvious syntax.
9. Keep controllers thin, repositories persistence-focused, and services responsible for business decisions.
10. Run formatting, linting, type checks, and tests in continuous integration before merge.

## 21. Deployment Topology for Release 1

Docker Compose runs the following services locally:

```text
web -> api -> postgres
           -> redis <- worker -> postgres
```

Production deployment splits at least these process types:

- One or more API instances.
- One or more analytics worker instances.
- Managed PostgreSQL with backups and migration process.
- Managed Redis configured for cache and BullMQ persistence needs.

The API and worker must have independent autoscaling/resource settings. A sudden click burst should mainly affect queue depth and workers, not redirect request completion.

## 22. Open Implementation Decisions

These decisions must be settled before writing the affected feature, but do not block project planning:

1. Choose query layer: a typed SQL builder/ORM that supports PostgreSQL partitioning cleanly, or explicit parameterized SQL.
2. Finalize session-only owner context versus full authentication in Release 1.
3. Choose GeoIP dataset and licensing/distribution approach.
4. Set cache TTL and negative-cache policy after local load tests.
5. Decide whether soft-deleted custom aliases can ever be reclaimed; default recommendation is no reclaim in Release 1 to avoid surprising historical links.
6. Define analytics data retention and city-level minimum-count threshold before public deployment.

## 23. Definition of Done for the Technical Foundation

The technical foundation is complete when:

- [ ] The API, worker, PostgreSQL, and Redis start together from documented configuration.
- [ ] Generated short codes use tested custom base62 conversion.
- [ ] Link metadata is durable in PostgreSQL and cache entries are safely disposable.
- [ ] A redirect cache hit avoids a primary database read.
- [ ] An analytics worker failure or backlog does not block redirects.
- [ ] Persisted click events are idempotent and contain no raw IP address.
- [ ] Deletion and expiry cannot cause an active cached redirect beyond the documented invalidation/TTL behavior.
- [ ] Authorization prevents cross-owner link and analytics access.
- [ ] Core logging, metrics, health checks, tests, and benchmark procedure are present.
- [ ] Implementation follows the humanized, verbose code standards in this document.

