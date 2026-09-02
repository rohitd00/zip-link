# ZipLink

**A URL shortener built to prove one specific engineering claim: redirects and analytics
don't have to trade off against each other.** Every click resolves through a cache-first
path in milliseconds; every click is also analyzed — device, browser, referrer,
approximate geography — without ever making a visitor wait for that work to happen.

![Dashboard home, showing the create-link form and three sample links](docs/screenshots/dashboard-home.png)

## What it is

ZipLink is a full-stack URL shortener with a real analytics pipeline behind it, not a toy
redirect endpoint. Create a link (a generated code or a custom alias), share it, and watch
who clicks it — a live timeline, top referrers, device/browser split, and approximate
geography — from a dashboard that supports both light and dark themes.

The system is built around a cache-aside redirect path backed by PostgreSQL, with click
analytics captured asynchronously through a Redis-backed queue and processed by a separate
worker process. That separation is the whole point: a slow database write, a GeoIP lookup,
or even the entire analytics worker being down can never delay a visitor's redirect. This
isn't a claim left untested — it's [measured below](#benchmarks).

## Key features

- **Fast, cache-first redirects.** Redis-backed cache-aside reads with a safe PostgreSQL
  fallback on a miss or cache outage — a redirect is never wrong, only occasionally slower.
- **Generated codes or custom aliases**, with duplicate-link detection (creating the same
  destination twice returns the existing link instead of a new one) and optional expiry.
- **Real click analytics**, not a single counter: total clicks, a time-bucketed timeline
  chart, top referrers, a combined devices/browsers breakdown, and approximate
  country/city geography — all queryable over any date range.
- **Analytics can never slow a redirect.** Click processing happens on a separate queue and
  worker; a redirect response goes out before any enrichment work even starts. Proven, not
  assumed — [see the benchmark](#benchmarks).
- **Privacy-conscious by construction.** Raw visitor IP addresses are never persisted
  (only an HMAC hash); city-level geography is suppressed below a small event threshold so
  a handful of clicks can't identify a specific person's location.
- **A modern, accessible dashboard** — React 19 + Tailwind, first-class light and dark
  themes (not a filter over one default), keyboard-operable throughout, no sign-up
  required (link ownership uses a signed anonymous session).
- **Production-hardening that's actually there**: structured logs with automatic
  redaction of anything secret-shaped, a `/metrics` endpoint, layered health checks, rate
  limiting, and a fully containerized deployment (API, worker, dashboard, Postgres, Redis)
  verified end to end.
- **Hourly/daily analytics rollups**, checkpointed and idempotent, ready to back a faster
  read path the moment real traffic justifies it.

## Screenshots

A link's detail page — total clicks, a live chart, and referrer/device/browser/geography
breakdowns, shown here in dark theme:

![Link detail and analytics page, showing a clicks-over-time chart and breakdown cards](docs/screenshots/link-detail-analytics.png)

## Architecture

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

The redirect handler and the analytics worker are two separate processes that only
communicate through a queue — the redirect path has no code path that can call into UA
parsing, GeoIP lookup, or the analytics write path at all, so a slow or failing worker is
structurally incapable of slowing a redirect. See the [technical
reference](docs/09-technical-reference.md#architecture-target-per-the-technical-specification)
for the full request-path breakdown, and the [PRD](docs/01-prd.md) /
[technical specification](docs/02-technical-specification.md) for the original design
reasoning.

## Tech stack

**Backend:** TypeScript (strict, no `any`) · Node.js + Express · PostgreSQL 16+
(partitioned tables for click events) · Redis 7 (cache, rate limiter, BullMQ queue) ·
`node-pg-migrate` (plain SQL migrations, no ORM)

**Analytics worker:** BullMQ (versioned job contract, retry with backoff) ·
`ua-parser-js` · `geoip-lite` (offline, no external API calls) · HMAC-SHA-256 IP hashing

**Dashboard:** React 19 · Vite · React Router · Tailwind CSS v4 · Recharts · no global
state library — small custom hooks per page

**Testing:** Vitest + Supertest, against real PostgreSQL/Redis/BullMQ instances (not
mocks) · Testing Library for dashboard components

**Ops:** Docker Compose (all five services, health-check-gated startup) · structured
JSON logging with redaction · `/health/live`, `/health/ready`, `/metrics`

Full rationale for each choice — including the trade-offs — is in the
[technical reference](docs/09-technical-reference.md#tech-stack).

## Benchmarks

Recorded with real `autocannon` load tests against the actual running API, each scenario
repeated multiple times rather than publishing a single run. Full methodology, every
repeated run, and the environment caveat are in the
[technical reference's benchmark section](docs/09-technical-reference.md#redirect-performance-benchmark) —
the highlights:

| Scenario                                 | Result                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline** (50 concurrent connections) | ~1,700 requests/sec sustained, **28ms p50 latency**, zero errors across every run                                                                                                                                                                                               |
| **Burst** (300 concurrent connections)   | Throughput holds (~1,800 RPS) — the single Node process's event loop is the bottleneck, not the database or Redis. p50 rises to ~160ms under that load, still zero errors                                                                                                       |
| **Cache miss → PostgreSQL fallback**     | As low as 7–8ms once the process is warm; the redirect is never wrong, only occasionally not cached                                                                                                                                                                             |
| **Analytics worker stopped entirely**    | **2,578 requests/sec, zero errors — redirects got _faster_**, since the worker wasn't competing for database connections. `GET /metrics` confirmed all 25,773 clicks queued correctly with zero enqueue failures. Restarting the worker drained that backlog in ~20–25 seconds. |

That last row is the actual point of this project's architecture, measured rather than
assumed: **a completely stopped analytics pipeline has zero effect on redirect
availability or latency.**

Benchmarking also surfaced a real, documented gap rather than hiding it: under a
cache-miss "thundering herd" (many concurrent requests for a just-evicted key), every
request still succeeds, but tail latency degrades because there's no single-flight
request coalescing yet — see [Known limitations](#known-limitations).

## Test coverage

```bash
npm test
```

**220 automated tests across 39 files, all passing** — unit tests for pure logic (URL
validation, base62 encoding, rate-limit windows, analytics bucket selection) and
integration tests that run against **real** PostgreSQL, Redis, and BullMQ instances, not
mocks — including a full producer → queue → worker → database round trip, and dashboard
component tests with Testing Library. The suite also caught two genuine bugs during
development that are worth naming because they show what the integration-first approach
was for: a timezone bug in analytics bucket truncation, and a logger bug where a field
named `message` silently overwrote the actual log message. Both are fixed and now have
regression tests.

Every change is required to pass, together: `npm run format:check`, `npm run lint`,
`npm run typecheck`, and `npm test`.

## Known limitations

Documented honestly, not glossed over — full detail and reasoning for each is in the
[technical reference](docs/09-technical-reference.md#known-limitations-current-state):

- **No single-flight cache-miss coalescing.** A stampede of concurrent requests for the
  same just-evicted cache key each independently hit PostgreSQL instead of one request
  doing the work while the rest wait — correct answers, just not the most efficient path
  under that specific condition.
- **Dimension analytics rollups aren't built yet** (referrer/device/browser/geography) —
  the time rollup is, and is fully tested; the dimension rollups are deliberately deferred
  until a real query actually needs them, per this project's own "don't build it until the
  evidence says to" policy.
- **No automated data-retention job.** Old click-event partitions and dedupe rows aren't
  pruned automatically yet; the procedure is documented, just not scheduled.
- **Single Node process, no clustering** — the benchmark above shows this is the actual
  bottleneck at high concurrency, and it's also the first thing to fix (see [Future
  improvements](#future-improvements)).
- **A handful of dev-tooling dependency advisories** (`esbuild`, `glob`) — neither is
  reachable through the running application, both are pinned pending safe upgrade paths.

## Future improvements

Roughly in the order they'd matter for handling real traffic:

1. **Horizontal scaling** — run multiple API instances behind a load balancer. The
   redirect path already has no per-instance state (signed stateless cookie, Redis-backed
   cache), so this is a deployment change, not a rewrite.
2. **Single-flight cache-miss coalescing** — close the thundering-herd gap the benchmark
   found, via request coalescing or a short-lived distributed lock.
3. **Dimension rollups + a hybrid raw/rollup analytics read path**, once real usage shows
   a large or repeated-range query is actually slow.
4. **Automated retention/cleanup job** for old partitions and dedupe rows.
5. **Real authentication**, as an alternative to anonymous-session link ownership, for
   anyone who wants links to survive across devices/browsers.
6. **Product features beyond the MVP scope**: custom domains, QR codes, link tagging/
   folders, bulk operations.

## Quick start

```bash
npm install
docker compose up -d redis        # PostgreSQL is expected to run natively — see the full setup guide
cp .env.example .env               # fill in DATABASE_URL, secrets, etc.
npm run migrate:up
npm run dev:api                    # terminal 1 — http://localhost:3000
npm run dev:worker                 # terminal 2
npm run dev:web                    # terminal 3 — http://localhost:5173
npm run seed                       # optional: populate a few sample links with click data
```

Or run the entire stack — API, worker, dashboard, PostgreSQL, and Redis — in Docker with
one command:

```bash
docker compose up -d --build
```

Full setup instructions (native vs. Docker PostgreSQL, environment variables, first-run
migrations, verifying the pipeline end to end) are in the
**[technical reference](docs/09-technical-reference.md#local-setup)**.

## Documentation

| Doc                                                           | What's in it                                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **[Technical reference](docs/09-technical-reference.md)**     | Full setup guide, complete API reference, security/privacy behavior, backup & retention, and the full benchmark tables |
| [Product requirements](docs/01-prd.md)                        | What ZipLink is for and who it's for                                                                                   |
| [Technical specification](docs/02-technical-specification.md) | System design and API contracts                                                                                        |
| [App flow](docs/03-app-flow.md)                               | User-facing flows through the product                                                                                  |
| [Design specification](docs/04-design-specification.md)       | The dashboard's visual/UX design system, light and dark                                                                |
| [Database schema](docs/05-database-schema.md)                 | Table design, partitioning, and rollup strategy                                                                        |
| [Implementation plan](docs/06-implementation-plan.md)         | The phased build plan this project followed                                                                            |
| [Agent to-do tracker](docs/07-agent-todo-tracker.md)          | A running log of every phase, what was verified, and how                                                               |
| [Project rules](docs/08-project-rules.md)                     | The engineering rules this codebase is held to                                                                         |
