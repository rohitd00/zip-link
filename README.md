# URL Shortener with Analytics at Scale

A URL-shortening service built around one core idea: **redirects must stay fast, and
analytics must never slow them down.** Redirect resolution is a cache-first, low-latency
read path. Click analytics are captured asynchronously through a queue and processed by a
separate worker, so a slow database write or GeoIP lookup can never delay a visitor.

> **Project status:** Phases 0–4 of the implementation plan are complete: repository
> foundation, database schema, a fully working database-backed link
> create/list/detail/delete/redirect flow, Redis cache-aside redirects, Redis-backed
> creation rate limiting, and an asynchronous BullMQ click-analytics queue with a
> separate enrichment worker (user-agent parsing, offline GeoIP, HMAC IP hashing,
> idempotent inserts). The analytics query API and the React dashboard are **not
> implemented yet** — see [Implementation status](#implementation-status) below.

Full product/technical documentation lives in [`docs/`](docs/):
[PRD](docs/01-prd.md) · [Technical specification](docs/02-technical-specification.md) ·
[App flow](docs/03-app-flow.md) · [Design specification](docs/04-design-specification.md) ·
[Database schema](docs/05-database-schema.md) ·
[Implementation plan](docs/06-implementation-plan.md) ·
[Agent to-do tracker](docs/07-agent-todo-tracker.md) ·
[Project rules](docs/08-project-rules.md).

## Architecture (target, per the technical specification)

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

Today, every portion of this diagram exists and runs — the API, PostgreSQL, Redis (cache,
rate limiter, and BullMQ), and the analytics worker. Only the analytics _query_ API and
the React dashboard remain unbuilt.

## Implementation status

| Area                                                                                    | Status                                                                                                                               |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Repository layout, TypeScript, lint/format/test tooling                                 | Done                                                                                                                                 |
| Database migrations (`links`, partitioned `click_events`, dedupe, rollups, checkpoints) | Done                                                                                                                                 |
| Base62 short-code encoder/decoder                                                       | Done                                                                                                                                 |
| URL validation/normalization, alias validation, expiry validation                       | Done                                                                                                                                 |
| Owner-context (anonymous signed cookie)                                                 | Done                                                                                                                                 |
| Link create / list / get / delete (PostgreSQL only)                                     | Done                                                                                                                                 |
| Public redirect (`GET /:code`), 404/410 pages                                           | Done                                                                                                                                 |
| Health checks (`/health/live`, `/health/ready`)                                         | Done — reports PostgreSQL and Redis status separately                                                                                |
| Redis cache-aside redirect (read-through + write-through, TTL bounded by expiry)        | Done                                                                                                                                 |
| Redis-backed creation rate limiting (fail-open on Redis outage)                         | Done                                                                                                                                 |
| BullMQ click-event queue (producer, on the redirect path)                               | Done — bounded 500ms publish budget; a queue failure never fails the redirect                                                        |
| Analytics worker (UA parsing, offline GeoIP, HMAC IP hashing, idempotent insert)        | Done                                                                                                                                 |
| Analytics query API + rollups                                                           | Not started                                                                                                                          |
| React/Tailwind dashboard                                                                | Not started                                                                                                                          |
| Docker images for API/worker/web, full container journey                                | `docker-compose.yml` starts Postgres+Redis and is actually used for Redis in local dev (see below); API/worker not yet containerized |
| Load benchmarking                                                                       | Not started                                                                                                                          |

This matches the "foundation first" phased approach in
[the implementation plan](docs/06-implementation-plan.md): Phases 0–4 are complete —
clicks are captured, enriched, and durably stored, without ever slowing down a redirect.
Phase 5 onward (analytics query API, dashboard, hardening, benchmarks) come next.

## Tech stack

- **Language:** TypeScript, strict mode, no `any`.
- **API:** Node.js + Express.
- **Database:** PostgreSQL 16+ (developed and tested against PostgreSQL 18 locally).
- **Cache / rate limiter / queue:** Redis 7, via [`ioredis`](https://github.com/redis/ioredis).
- **Analytics queue:** [BullMQ](https://docs.bullmq.io/) — a versioned job contract
  (`ClickEventJobPayloadV1`), 5 attempts with exponential backoff, and a separate
  `Worker` process (`apps/worker`) so a click-processing backlog can never slow a redirect.
- **User-agent parsing:** [`ua-parser-js`](https://github.com/faisalman/ua-parser-js) for
  device/browser classification; bot detection uses a small local keyword pattern rather
  than the library's own bot-detection submodule, which needs a newer module-resolution
  setting than the rest of this CommonJS project uses (see the comment in
  `apps/worker/src/enrichment/userAgentParser.ts`).
- **GeoIP:** [`geoip-lite`](https://github.com/geoip-lite/node-geoip) — a self-contained,
  offline dataset with no account, license key, or external network call per click.
  Country _names_ (not just codes) come from Node's built-in `Intl.DisplayNames`, so no
  second dataset is needed for that. Because of this choice, the `GEOIP_DATABASE_PATH`
  variable named in the technical specification's configuration contract does not apply
  and is not used.
- **Migrations:** [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate), plain
  SQL inside JS migration files — no ORM.
- **Testing:** [Vitest](https://vitest.dev/) for unit and integration tests,
  [Supertest](https://github.com/ladjs/supertest) for HTTP-level tests against real test
  PostgreSQL, Redis, and BullMQ instances (not mocks) — including a full producer→worker
  round trip through a real queue. Test files run sequentially (not in parallel) — see
  the comment in `vitest.config.ts` for why. `REDIS_TEST_URL` points at a separate
  logical Redis database from `REDIS_URL`, so running tests never touches a locally
  running dev server's cache, rate limits, or queued jobs.
- **Linting/formatting:** ESLint (flat config) + Prettier.

### A note on the repository layout

The technical specification recommends an `apps/` + `packages/` monorepo laid out as npm
**workspaces**. This repository keeps that same folder layout (`apps/api`, `apps/worker`,
`apps/web`, `packages/shared`) for organizational clarity, but does **not** use npm
workspaces' symlinking mechanism — creating those symlinks failed on this development
machine because Windows Developer Mode is off, and turning on an OS-level developer
setting wasn't something to do without asking. Instead there is a single root
`package.json` with one `node_modules`, and shared code in `packages/shared` is imported
through a TypeScript path alias (`@shared/*` → `packages/shared/src/*`), resolved at
runtime by [`tsx`](https://github.com/privatenumber/tsx). Functionally this behaves the
same as a workspace for this project's needs, with one less moving part.

## Local setup

### Prerequisites

- Node.js 20+
- A PostgreSQL 16+ server (this project was built against a **native Windows PostgreSQL
  18 install**, not Docker — see [Using Docker instead](#using-docker-instead))
- A Redis 7 server (this project runs it via **Docker Desktop** — `docker compose up -d
redis` — while PostgreSQL stays native; see below)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

This project was developed against a native PostgreSQL installation rather than Docker,
because Docker Desktop's daemon was not available in the development environment. A
`docker-compose.yml` is included (see [Using Docker instead](#using-docker-instead)) and
is the documented path for anyone who does have Docker running locally.

Whichever PostgreSQL you use, create two databases and a least-privilege application role
(never run the app as the `postgres` superuser):

```sql
CREATE ROLE url_shortener_app LOGIN PASSWORD 'choose-a-real-password';
CREATE DATABASE url_shortener_dev OWNER url_shortener_app;
CREATE DATABASE url_shortener_test OWNER url_shortener_app;
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in real local values — most importantly `DATABASE_URL` (pointing at
`url_shortener_dev`), `DATABASE_TEST_URL` (pointing at `url_shortener_test`, used only by
the automated test suite), `IP_HASH_SECRET`, and `OWNER_COOKIE_SECRET`. Generate random
secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The API validates every required variable at startup and fails fast with a specific,
readable message if one is missing — see `apps/api/src/config/environment.ts`.

### 4. Start Redis

```bash
docker compose up -d redis
```

This starts only the Redis service from `docker-compose.yml` (PostgreSQL stays native, as
set up in step 2). Confirm it's reachable:

```bash
docker exec url-shortener-redis redis-cli ping   # expect PONG
```

If `docker` isn't on your `PATH` even though Docker Desktop is running, it's likely
installed under `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe` rather
than the older `Program Files\Docker\Docker` location — call it by its full path, or add
that folder to `PATH`.

### 5. Run database migrations

```bash
npm run migrate:up
```

This creates the `links` table, the partitioned `click_events` table (with the current
month and two months ahead already created), the analytics event-deduplication table, and
the rollup/checkpoint tables. Run the same command against `DATABASE_TEST_URL` before
running the test suite the first time:

```bash
DATABASE_URL="$DATABASE_TEST_URL" npm run migrate:up
```

(On Windows PowerShell: `$env:DATABASE_URL=$env:DATABASE_TEST_URL; npm run migrate:up`.)

### 6. Run the API and the analytics worker

These are two separate processes; run each in its own terminal:

```bash
npm run dev:api
```

```bash
npm run dev:worker
```

The API listens on `PORT` (default `3000`). Try the whole pipeline:

```bash
curl -i -c cookies.txt -b cookies.txt -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"longUrl":"https://example.com/articles/launch"}'

curl -i http://localhost:3000/<returned-short-code>
```

The redirect responds immediately. A moment later, the worker terminal logs
`"Processed a click-analytics job."`, and a row appears in `click_events`:

```bash
psql -U url_shortener_app -d url_shortener_dev \
  -c "SELECT event_id, short_code, device_type, browser_name, country_code, ip_hash FROM click_events ORDER BY occurred_at DESC LIMIT 5;"
```

Note that `ip_hash` is a hex digest, never the visitor's actual IP address.

### Using Docker for PostgreSQL too

The setup above runs Redis in Docker and PostgreSQL natively — that's what this project
actually runs on locally. If you'd rather run PostgreSQL in Docker as well,
`docker-compose.yml` also defines a `postgres` service:

```bash
docker compose up -d
```

Update `.env` to match the compose file's credentials (`url_shortener_app` /
`local_dev_password_change_me`, database `url_shortener_dev`, host `localhost`) instead of
the native-install credentials from step 2, then run migrations and the API exactly as
above. Either way, the API and worker themselves are not yet containerized (that lands in
a later hardening phase); run them with `npm run dev:api` / `npm run dev:worker` against
whichever Postgres/Redis you chose.

## Running quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test                # Vitest — unit tests plus integration tests against DATABASE_TEST_URL
```

All four must pass before a change is considered complete, per the project rules.
Integration tests require a running, migrated `url_shortener_test` database **and** a
running Redis reachable at `REDIS_TEST_URL` (a separate logical database from
`REDIS_URL`, so tests never touch a dev server's cache, rate limits, or queued jobs).
They truncate/flush that isolated test data between tests — never point
`DATABASE_TEST_URL` or `REDIS_TEST_URL` at data you care about.

### Partition maintenance

`click_events` is partitioned by month. Migrations create the current month plus two
months ahead; run this periodically (for example, monthly, from a scheduled job) to keep
that horizon from running out:

```bash
npm run maintain:partitions
```

It is idempotent — safe to run repeatedly.

## API overview

All management endpoints are under `/api` and require the anonymous owner-context cookie
(set automatically on first request). The public redirect route is registered last, after
every reserved path, so `api`, `health`, and other reserved words can never be interpreted
as a short code.

| Method   | Path               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/links`       | Create a link (generated code or custom alias); returns an existing link instead of a duplicate by default. Rate-limited per owner (`429` + `Retry-After` once exceeded); the public redirect route below is never subject to this limit.                                                                                                                                                                                 |
| `GET`    | `/api/links`       | List the current owner's active links, newest first, with cursor pagination and optional search.                                                                                                                                                                                                                                                                                                                          |
| `GET`    | `/api/links/:code` | Read one owned link's metadata and click count.                                                                                                                                                                                                                                                                                                                                                                           |
| `DELETE` | `/api/links/:code` | Soft-delete an owned link. Idempotent; returns a generic 404 for a link you don't own.                                                                                                                                                                                                                                                                                                                                    |
| `GET`    | `/:code`           | Public redirect. Cache-aside: checks Redis first, falls back to PostgreSQL on a miss or Redis error, and backfills the cache. On success, also publishes a click-analytics job to BullMQ (bounded to a 500ms budget; a queue failure or timeout never blocks the redirect). `302` on success, `404` for unknown/deleted, `410` for expired. Add `Accept: application/json` for a JSON error body instead of an HTML page. |
| `GET`    | `/health/live`     | Liveness — process is responding. Never touches a dependency.                                                                                                                                                                                                                                                                                                                                                             |
| `GET`    | `/health/ready`    | Readiness — `{ "status": "ok" \| "unavailable", "dependencies": { "database": "ok" \| "unavailable", "cache": "ok" \| "degraded" } }`. Only a PostgreSQL failure returns `503`; Redis being down is reported as `"degraded"` but does not fail readiness, since redirects still work (just slower) without it.                                                                                                            |

Every error response has the shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": [{ "field": "longUrl", "message": "..." }],
    "requestId": "req_..."
  }
}
```

## Privacy and security behavior implemented so far

- Only `http:`/`https:` destination URLs are accepted; `javascript:`, `data:`, `file:`,
  and URLs with embedded credentials are rejected server-side.
- The owner-context cookie is `HttpOnly`, signed, `SameSite=Lax`, and `Secure` in
  production; it is never exposed in any API response body.
- Cross-owner management requests (reading or deleting another owner's link) return a
  generic `404`, never revealing that the code belongs to someone else.
- All SQL is parameterized; nothing user-supplied is concatenated into a query.
- Error responses never include stack traces, SQL errors, or internal configuration —
  only a stable error code, a safe message, and a request ID for support correlation.
- Link creation is rate-limited per owner (20 requests / 15 minutes by default, both
  configurable). A Redis outage fails the rate limiter **open** (creation is allowed
  through) rather than blocking the product because an optimization is down — see the
  trade-off comment in `apps/api/src/cache/creationRateLimiter.ts`.
- Redis is never a single point of failure for a redirect: every cache read/write/delete
  catches its own errors and falls back to PostgreSQL, and no cached value ever contains
  an owner ID or other private field (only `linkId`, `shortCode`, `longUrl`, `expiresAt`,
  `redirectStatusCode` — see `RedirectCachePayload`).
- **Raw client IP addresses are never persisted.** The worker computes an HMAC-SHA-256
  hash (`IP_HASH_SECRET`, keyed by `IP_HASH_KEY_VERSION` for future rotation) and stores
  only that hash plus its key version; the raw address is never written to the database
  or to any log line. `click_events` has no column that could even hold one. Verified by
  a dedicated test in `apps/worker/src/enrichment/ipHasher.test.ts` and by inspecting the
  actual row in `apps/worker/src/repositories/clickEventRepository.test.ts`.
- The redirect handler itself never parses a user agent, calls GeoIP, or writes a click
  row — only the worker does. A queue publish failure or timeout (bounded to 500ms) is
  logged and counted but never fails the redirect, and a malformed queued job is
  discarded (BullMQ `UnrecoverableError`, no retry) rather than retried forever or
  silently accepted.

Analytics _retention_ policy (how long raw events, rollups, and dedupe rows are kept) is
documented in the [database schema](docs/05-database-schema.md) but not yet implemented
as an actual cleanup job — see [Implementation status](#implementation-status).

## Known limitations (current state)

- **No analytics query API or dashboard yet.** Clicks are captured, enriched, and stored
  correctly (verified end-to-end, including manually inspecting real rows), but nothing
  yet reads them back out; `totalClicks` in `GET /api/links` will always read `0` until
  the analytics query API is built.
- **No rollups yet.** `click_rollups_*` tables exist but nothing populates them; any
  future analytics endpoint would need to query raw `click_events` directly until the
  rollup scheduler (Phase 5) is built.
- **No retention/cleanup job yet.** Old partitions, dedupe rows, and events are not
  automatically pruned.
- **Rate limiter is a fixed window, not a true sliding window.** A burst spanning two
  windows could briefly exceed the configured limit. Documented and accepted as a
  simplicity trade-off for an abuse control that only needs to be roughly right — see the
  comment in `apps/api/src/cache/creationRateLimiter.ts`.
- **Bot detection is a keyword heuristic, not `ua-parser-js`'s own bot-detection module.**
  See the comment in `apps/worker/src/enrichment/userAgentParser.ts` for why (a package
  subpath import that needs a module-resolution setting this project doesn't use).
- **Dependency audit:** `npm audit` reports vulnerabilities in `esbuild` (Vite/Vitest's
  dev-only dependency) and `glob` (a transitive dependency of `node-pg-migrate`'s CLI).
  Both are development-tooling-only exposure — neither ships in the deployed API/worker
  code — and were left unpatched rather than forcing breaking major-version upgrades
  without testing them. Revisit before a real deployment.

No performance claim is made yet; no benchmark has been run. That happens in a later
phase per the implementation plan, and only measured, reproducible numbers will be
recorded here.
