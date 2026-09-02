# Product Requirements Document (PRD)

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | ZipLink |
| Document | Product Requirements Document |
| Version | 1.0 |
| Status | Draft for implementation |
| Primary audience | Product owner, engineering team, designer, QA, and implementation agents |
| Product type | Web application and HTTP API |

## 2. Product Summary

This product is a URL-shortening service that creates compact, shareable links and provides privacy-conscious click analytics. It is deliberately designed as more than a basic redirect application: redirects must remain low-latency as traffic grows, while analytics capture and processing must not delay the user’s redirect.

The product will provide a minimal web dashboard and a JSON API. A user can create, view, and delete short links; optionally select a custom alias and expiry date; and inspect analytics for each link. When a visitor opens a short link, the system resolves the destination and redirects the visitor immediately. Click information is captured asynchronously for later analytics.

## 3. Problem Statement

Existing tutorial URL shorteners usually combine link lookup, redirecting, and analytics writes in one synchronous request. This works at tiny volume but creates an avoidable performance problem: a redirect is latency-sensitive, whereas analytics writes are write-heavy and can tolerate a small delay. A slow database, geo lookup, or analytics write must never hold a visitor on the redirect path.

The product solves this by treating link metadata and click events as separate workloads:

- Link metadata is durable, small, and frequently read.
- Redirect resolution is the critical hot path and should be cache-first.
- Click events are immutable, high-volume, and processed asynchronously.
- Dashboard queries should use time-bucketed aggregates where appropriate instead of repeatedly scanning every raw event.

## 4. Goals

### 4.1 Primary goals

1. Create short, URL-safe links from valid destination URLs.
2. Redirect visitors to the intended destination with minimal added latency.
3. Capture meaningful click analytics without blocking redirects.
4. Present understandable analytics for a link: volume over time, referrers, device/browser, and approximate geography.
5. Make the system credible as a scalable backend project through custom base62 encoding, caching, queued analytics, benchmark measurements, and clear operational behavior.
6. Provide a calm, minimalist dashboard that makes essential actions and information easy to find.

### 4.2 Success criteria

The first release is successful when all of the following are true:

- A valid long URL can be shortened and the resulting code redirects correctly.
- Automatic short codes use a custom, deterministic base62 encoder backed by collision-safe numeric identifiers.
- A custom alias is accepted only when it is valid and available.
- Expired or deleted links never redirect.
- Redirects attempt a cache lookup before querying the primary database.
- Analytics event submission does not wait for analytics storage or enrichment to finish.
- Analytics for an active link can be viewed in the dashboard and retrieved through the API.
- Link creation is rate-limited to reduce abuse.
- The dashboard remains usable on desktop and mobile with a simple visual hierarchy.
- Redirect performance is benchmarked and reported with requests per second, cache-hit ratio, and p50/p95/p99 latency.

## 5. Non-Goals

The following are intentionally outside the required first release unless separately approved:

- Building a globally distributed, multi-region redirect network.
- Full account management, billing, team workspaces, and subscription plans.
- Guaranteed real-time analytics; a short processing delay is acceptable.
- Precise geolocation, user tracking, or storage of raw IP addresses.
- A complete anti-malware or URL reputation scanning service.
- A/B destination routing, QR-code generation, API-key management, and CAPTCHA flows. These are stretch features.
- Solving every possible Redis hot-key problem in code. The initial release documents the scaling strategy and has an architecture that can evolve toward local caching or replicas.

## 6. Users and Key Needs

### 6.1 Link owner

A link owner creates and manages short links for sharing and needs to know whether a link is being used and where engagement originates.

Needs:

- Fast link creation.
- A memorable custom alias when needed.
- Optional link expiry.
- Clear access to each link’s destination, creation date, and click count.
- Easy-to-read analytics without requiring spreadsheet work.

### 6.2 Link visitor

A link visitor opens a shortened URL and expects to reach the destination immediately and safely.

Needs:

- Reliable redirect behavior.
- A comprehensible error page when the link is invalid, deleted, or expired.
- No avoidable delay caused by analytics collection.

### 6.3 Operator or developer

The operator runs the service and needs confidence that it remains responsive and observable under load.

Needs:

- Clear separation between redirect delivery and analytics processing.
- Metrics that expose cache performance and redirect latency.
- Reproducible local setup and load testing.
- Sensible privacy controls and predictable retention decisions.

## 7. Product Scope and Release Model

### 7.1 Release 1: required product scope

Release 1 includes the following capabilities.

| Area | Requirement |
| --- | --- |
| Link creation | Create a short link from an HTTP or HTTPS URL. |
| Generated codes | Produce a unique base62 short code from a numeric identifier. |
| Custom aliases | Permit a validated, unique user-selected alias. |
| Duplicate handling | For the same owner context and destination URL, return an existing active link when duplicate detection is enabled. |
| Expiry | Allow an optional expiry date/time. |
| Redirect | Resolve a valid active code and issue the configured HTTP redirect response. |
| Link management | List links and delete a link. |
| Analytics capture | Queue a click event after redirect resolution without waiting for the worker. |
| Analytics views | Show total clicks, timeline, top referrers, device/browser, and country/city summaries. |
| Abuse controls | Rate-limit link creation by user when authenticated or by IP when anonymous. |
| Dashboard | Provide a minimalist create form, link list, and per-link analytics page. |
| Operations | Provide containerized local startup, health checks, logging, and a repeatable benchmark procedure. |

### 7.2 Identity assumption for Release 1

The application must support an owner context for link listing and duplicate detection. The implementation may start with anonymous ownership represented by a securely generated browser/session identity, or add a small authentication layer if chosen before implementation. All links created without an authenticated account remain manageable only within that owner context. This decision must be finalized in the technical specification before API implementation, because it affects authorization and data ownership.

### 7.3 Stretch scope

The following may be planned after Release 1:

- QR-code generation per link.
- API keys for programmatic creation.
- CAPTCHA for anonymous creation.
- A/B destination routing by configurable traffic percentage.
- Local in-process cache for exceptionally hot links.
- Redis read replicas and regional deployment.
- More advanced time-series storage such as TimescaleDB.

## 8. Functional Requirements

### 8.1 Link creation

**FR-001 — Create a generated short link**

The system shall accept a long URL and create a unique short link.

- The destination URL must parse successfully and use `http` or `https`.
- The response must include the short code, complete short URL, destination URL, creation time, and optional expiry time.
- The system must use its own base62 conversion logic for generated codes. It must not delegate code generation to UUID, Nano ID, or equivalent random ID libraries.
- Numeric identifiers must be allocated safely under concurrent requests; database sequences are an acceptable first-release mechanism.

**FR-002 — Create a custom alias**

The system shall allow an optional custom alias.

- An alias must be URL-safe, use the documented character set, and satisfy a defined length range.
- Reserved routes and system words must not be usable as aliases.
- The alias must be unique among active and retained links according to the selected deletion policy.
- If the alias is unavailable or invalid, the system must return a helpful validation error and must not create a link.

**FR-003 — Expire a link**

The system shall accept an optional future expiry timestamp.

- An expiry timestamp in the past is invalid.
- After expiry, redirect attempts must stop and return the expired-link experience.
- Expiration must invalidate or bypass any cached redirect mapping.

**FR-004 — Detect duplicates**

When duplicate detection is enabled, the system shall identify an existing active link with the same normalized destination URL and owner context.

- The API must state whether it created a new link or returned an existing one.
- A custom alias request must not silently return a differently named existing link.
- Duplicate detection must be configurable so the product can later support multiple links to the same destination for campaign tracking.

### 8.2 Redirect behavior

**FR-005 — Resolve and redirect**

The system shall resolve `GET /:code` requests for active links.

- It must first check the cache for the mapping.
- On a cache miss, it must fetch the link from the primary database and backfill the cache when eligible.
- It must return the selected redirect status code (initial default: HTTP 302, configurable to 301 for permanent links) with the destination in the `Location` header.
- It must never redirect an expired, deleted, malformed, or unknown code.
- The redirect handler must avoid synchronous geo lookup, user-agent parsing, analytics-table writes, and aggregation work.

**FR-006 — Invalid-link experience**

The system shall return a concise, branded-but-minimal HTML error page for browser requests to invalid, expired, or deleted links.

- The page must state the relevant condition without exposing sensitive internal details.
- API-like requests may receive a structured JSON error when their `Accept` header requests JSON.

### 8.3 Analytics capture and processing

**FR-007 — Publish click events asynchronously**

For each successful redirect, the application shall create a click event and publish it to a durable queue without waiting for background processing to finish.

- Queue-publish failure must not prevent the redirect from completing.
- Queue failures must be logged and counted for operational follow-up.
- The event payload must include the code/link identifier, event time, referrer, user-agent, and a privacy-preserving IP-derived value sufficient for worker enrichment.

**FR-008 — Enrich and persist click events**

A separate analytics worker shall consume queued events.

- It must parse the user agent for device type and browser.
- It must perform approximate offline IP-to-geo enrichment.
- It must hash or anonymize the IP before persistence; raw IP addresses must not be stored in the analytics database.
- It must write the enriched event to the analytics event store and support safe retries without unintended duplicate counts.

**FR-009 — Provide analytics summaries**

The system shall return analytics for an authorized link owner.

Required summaries:

- Total click count for a selected time range.
- Click counts grouped into hourly or daily time buckets.
- Top referrers.
- Device type and browser counts.
- Country and city counts, subject to minimum privacy thresholds defined in the technical specification.

The response must identify its aggregation range and timezone. A small processing delay is acceptable and should be communicated in the UI as “recent activity may take a moment to appear.”

### 8.4 Link management and dashboard

**FR-010 — List owned links**

The system shall show the current owner’s links in reverse creation order.

Each item must display the short URL, destination URL in a safely truncated form, creation date, expiry state, and a click summary when available.

**FR-011 — Delete a link**

The system shall allow an owner to delete a link.

- Deletion must immediately prevent further redirects.
- The associated redirect cache entry must be invalidated.
- Historical analytics may remain for reporting, but must no longer be publicly reachable through the deleted link.
- The product must confirm the destructive action before completing it in the dashboard.

**FR-012 — Minimal dashboard**

The dashboard shall provide three primary surfaces:

1. A create-link view.
2. A links list with search or filtering when the list becomes long.
3. A per-link analytics view.

The design must prioritize whitespace, readable typography, one primary action per view, accessible contrast, restrained color, and straightforward charts. Decorative animation, dense control panels, and unnecessary visual effects are out of scope.

### 8.5 Abuse prevention

**FR-013 — Rate-limit link creation**

The system shall rate-limit creation attempts using the owner context when available and IP address otherwise.

- Limits must be configurable without code changes.
- A limited request must return a clear response explaining when creation can resume, if that information is available.
- The redirect endpoint must not share the restrictive creation limit because visitors must be able to access legitimate popular links.

## 9. User Stories and Acceptance Criteria

### US-001: Create a shareable link

As a link owner, I want to paste a long URL and receive a short URL so I can share it easily.

Acceptance criteria:

- Given a valid HTTPS destination, when I submit the create form, then I receive a new short URL or an explicitly identified existing duplicate.
- Given an invalid or unsupported destination, when I submit it, then I see a field-level error and no short link is created.
- Given a successful creation, when I copy the returned short URL, then it can be pasted and used without modification.

### US-002: Use a memorable alias

As a link owner, I want to choose a custom alias so the short URL is recognizable.

Acceptance criteria:

- Given an available valid alias, when I create the link, then that alias appears in the short URL.
- Given a reserved, malformed, or occupied alias, when I submit, then the application explains why it cannot be used.

### US-003: Make a link temporary

As a link owner, I want a link to expire so it no longer works after a campaign ends.

Acceptance criteria:

- Given a future expiry time, when that time passes, then visitors no longer reach the destination.
- Given an expired link, when it is opened, then the visitor sees an expired-link response and no click event is recorded as a successful redirect.

### US-004: Visit a short link quickly

As a visitor, I want a short link to take me to its destination with minimal delay.

Acceptance criteria:

- Given a cached active link, when I open it, then the service redirects without querying the primary database.
- Given an uncached active link, when I open it, then the service looks it up, caches it where appropriate, and redirects.
- Given analytics processing is slow or unavailable, when I open a valid link, then I still receive the redirect.

### US-005: Understand link performance

As a link owner, I want to see engagement patterns so I can assess whether a shared link is effective.

Acceptance criteria:

- Given recorded clicks, when I open a link’s analytics view, then I see total clicks, a time-based chart, and referrer, device/browser, and geographic breakdowns.
- Given no clicks, when I open analytics, then I see a useful empty state rather than empty or broken charts.
- Given a selected date range, when analytics are displayed, then all summaries use that same range.

### US-006: Remove a link

As a link owner, I want to delete a link I no longer want public.

Acceptance criteria:

- Given I confirm deletion, when I delete my link, then it no longer redirects and disappears from my active list.
- Given I attempt to delete a link I do not own, then the system denies the request without revealing link details.

## 10. Non-Functional Requirements

### 10.1 Performance

- Redirect resolution is the highest-priority path and must be benchmarked independently from dashboard traffic.
- The system must aim for a cache-first redirect flow; final numeric targets will be measured in the deployment environment rather than invented in advance.
- The analytics worker must be independently scalable from the API process.
- Dashboard queries should use bounded time ranges and pre-aggregated rollups when raw-event scans become costly.

### 10.2 Reliability and data behavior

- PostgreSQL is the source of truth for link metadata.
- Redis is a cache and queue backing service, not the sole durable source for links.
- A cache miss must be correct, only slower.
- An analytics event may appear after a short delay; the UX must not promise synchronous counts.
- The system must make duplicate event handling explicit through an idempotency strategy in the worker.

### 10.3 Security and privacy

- Only HTTP and HTTPS destinations are accepted; dangerous schemes such as `javascript:`, `data:`, and `file:` are rejected.
- Input must be validated on the server, even when the UI validates it first.
- Link-management and analytics operations require ownership authorization.
- Raw IP addresses must never be written to persistent analytics storage.
- Logs must avoid retaining full sensitive analytics payloads where not required for debugging.
- Secrets, database credentials, and signing keys must be environment configuration rather than source-controlled values.

### 10.4 Accessibility and usability

- Core keyboard navigation must work for forms, menus, confirmations, and chart alternatives.
- Text, status messages, and controls must meet accessible contrast expectations.
- Charts must have textual summaries or data tables for users who cannot interpret the visual alone.
- Error messages must be specific, brief, and actionable.

### 10.5 Maintainability

- Code must be humanized and verbose: use descriptive names, explicit control flow, clear types/contracts, and small focused functions.
- Avoid excessive shorthand syntax, compressed expressions, unclear one-line conditionals, and implicit behavior that hinders maintenance.
- Comments should explain non-obvious decisions and trade-offs, not restate obvious code.
- Architecture boundaries must keep redirect handling, queue publishing, analytics processing, persistence, and presentation independently testable.

## 11. Product Metrics

The implementation must make the following metrics observable.

| Metric | Why it matters |
| --- | --- |
| Links created | Measures product usage and detects creation spikes. |
| Redirect requests | Measures core service traffic. |
| Redirect success/error rate | Establishes availability and detects broken links or dependencies. |
| Cache hit ratio | Shows whether the cache-aside layer is benefiting the hot path. |
| Redirect p50/p95/p99 latency | Demonstrates user-facing performance under realistic load. |
| Queue depth and event age | Reveals analytics processing delay or worker backlog. |
| Worker failure/retry count | Detects enrichment or persistence problems. |
| Analytics event processing rate | Confirms the worker keeps up with traffic. |
| Rate-limit rejections | Helps identify spam or overly strict policy. |

Benchmarks must record test conditions, duration, concurrency, cache warmness, machine/runtime characteristics, and measured values. Resume claims must use measured results only.

## 12. Key Product Decisions

| Decision | Initial choice | Rationale |
| --- | --- | --- |
| Code strategy | Numeric database identifier encoded in custom base62 | Compact, URL-safe, deterministic, and collision-safe with database allocation. |
| Redirect cache | Redis cache-aside with write-through creation | Keeps common reads fast while retaining PostgreSQL as truth. |
| Redirect status | 302 by default | Allows destination updates and safer early behavior; 301 can be introduced per link or by policy. |
| Analytics delivery | BullMQ queue and separate worker | Keeps expensive enrichment and writes off the redirect path. |
| Analytics store | Separate time-partitioned PostgreSQL table initially | Uses familiar infrastructure while matching time-series access patterns. |
| Location data | Offline approximate geo lookup | Avoids external request latency and third-party API dependency. |
| UI character | Minimalist React dashboard with restrained Tailwind styling | Focuses attention on creating links and understanding analytics. |

## 13. Risks and Mitigations

| Risk | Product impact | Mitigation |
| --- | --- | --- |
| Cache outage or stale entry | Redirects become slow or incorrect | Fall back to PostgreSQL on cache failure; use TTL and invalidate on delete/update/expiry. |
| Queue backlog | Analytics become delayed | Track queue depth and age; scale workers; communicate eventual consistency. |
| Queue publish failure | Click data may be missing | Preserve redirect success, log/count failures, and alert when loss exceeds threshold. |
| Viral link / hot key | Cache or API contention | Cache normally first; document local cache and read-replica evolution for later scale. |
| Abuse and spam | Storage/cost/reputation exposure | Apply configurable creation limits; reserve CAPTCHA/auth for an approved next phase. |
| Privacy concerns | Compliance and user trust risk | Hash/anonymize IP before storage, minimize retention, and document data behavior. |
| Unbounded raw-event queries | Slow analytics dashboard | Partition events and add hourly/daily rollups when data volume warrants it. |
| URL-based security issues | Redirect to unsafe or malformed target | Strict protocol validation, normalization, and server-side ownership checks. |

## 14. Dependencies

- Node.js and Express API runtime.
- PostgreSQL for durable metadata and analytics data.
- Redis for the redirect cache and BullMQ queue.
- BullMQ worker process.
- Offline geo-IP database and user-agent parsing library.
- React, Tailwind, and a charting library for the dashboard.
- Docker and Docker Compose for reproducible local setup.
- Autocannon for load testing.

## 15. Release Readiness Checklist

Before Release 1 is considered ready:

- [ ] All required link creation, redirect, management, and analytics user stories pass.
- [ ] Invalid, expired, and deleted links return safe responses.
- [ ] Redirects continue when analytics storage is slow or offline.
- [ ] Cache invalidation has automated coverage for link deletion and expiry behavior.
- [ ] No raw IP address is persisted in analytics storage.
- [ ] Owner authorization prevents cross-owner management and analytics access.
- [ ] Rate-limit behavior is tested and configurable.
- [ ] Dashboard works on common mobile and desktop viewport sizes.
- [ ] Accessibility checks cover keyboard operation, error messaging, and chart summaries.
- [ ] Docker Compose starts the API, worker, PostgreSQL, and Redis consistently.
- [ ] A load-test report records redirect throughput, latency percentiles, and cache-hit ratio.
- [ ] README explains architecture, setup, known trade-offs, and measured benchmark results.

## 16. Future PRD Decisions Needing Confirmation

The following product choices affect implementation details and should be finalized in the corresponding technical specification before work begins:

1. Owner identity approach for Release 1: session-based anonymous owner context or account authentication.
2. Exact custom-alias character and length policy, plus the full reserved-word list.
3. Whether a link’s redirect status can be selected by its owner, or remains a service-level default.
4. Analytics retention duration and privacy thresholds for low-volume city-level results.
5. Default duplicate-detection behavior and whether a user can opt out per creation.
6. Criteria for adding rollup tables and the allowed analytics freshness delay.

## 17. Requirement Traceability

| Product outcome | Main requirements |
| --- | --- |
| Fast, reliable sharing | FR-001 through FR-006 |
| Non-blocking analytics | FR-007 and FR-008 |
| Useful owner insights | FR-009 and FR-012 |
| Safe link lifecycle | FR-003, FR-011, FR-013 |
| Production-minded quality | Non-functional requirements, product metrics, and release checklist |

