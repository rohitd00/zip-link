# URL Shortener with Analytics at Scale

A URL-shortening service built around one core idea: **redirects must stay fast, and
analytics must never slow them down.** Redirect resolution is a cache-first, low-latency
read path. Click analytics are captured asynchronously through a queue and processed by a
separate worker, so a slow database write or GeoIP lookup can never delay a visitor.

> **Project status:** Phase 0–2 of the implementation plan are complete: repository
> foundation, database schema, and a fully working database-backed link
> create/list/detail/delete/redirect flow. Redis caching, the analytics queue/worker, the
> analytics API, and the React dashboard are **not implemented yet** — see
> [Implementation status](#implementation-status) below.

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

Today, only the API + PostgreSQL portion of this diagram exists. The Redis, BullMQ, and
analytics-worker portions are designed (see the schema and technical spec) but not yet
built.

## Implementation status

| Area                                                                                    | Status                                                                                  |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Repository layout, TypeScript, lint/format/test tooling                                 | Done                                                                                    |
| Database migrations (`links`, partitioned `click_events`, dedupe, rollups, checkpoints) | Done                                                                                    |
| Base62 short-code encoder/decoder                                                       | Done                                                                                    |
| URL validation/normalization, alias validation, expiry validation                       | Done                                                                                    |
| Owner-context (anonymous signed cookie)                                                 | Done                                                                                    |
| Link create / list / get / delete (PostgreSQL only, no cache)                           | Done                                                                                    |
| Public redirect (`GET /:code`), 404/410 pages                                           | Done                                                                                    |
| Health checks (`/health/live`, `/health/ready`)                                         | Done                                                                                    |
| Redis cache-aside redirect + production rate limiting                                   | Not started                                                                             |
| BullMQ click-event queue + analytics worker (UA/GeoIP/IP-hash)                          | Not started                                                                             |
| Analytics API + rollups                                                                 | Not started                                                                             |
| React/Tailwind dashboard                                                                | Not started                                                                             |
| Docker images for API/worker/web, full container journey                                | `docker-compose.yml` written for Postgres+Redis; not yet wired to API/worker containers |
| Load benchmarking                                                                       | Not started                                                                             |

This matches the "foundation first" phased approach in
[the implementation plan](docs/06-implementation-plan.md): Phases 0–2 are complete: a
correct, database-backed shortener that can be demonstrated without Redis or the worker.
Phases 3 onward (cache, queue, analytics, dashboard, hardening, benchmarks) come next.

## Tech stack

- **Language:** TypeScript, strict mode, no `any`.
- **API:** Node.js + Express.
- **Database:** PostgreSQL 16+ (developed and tested against PostgreSQL 18 locally).
- **Migrations:** [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate), plain
  SQL inside JS migration files — no ORM.
- **Testing:** [Vitest](https://vitest.dev/) for unit and integration tests,
  [Supertest](https://github.com/ladjs/supertest) for HTTP-level tests against a real test
  database.
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
  18 install**, not Docker — see below)
- Redis (only needed starting in Phase 3; not required yet)

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

### 4. Run database migrations

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

### 5. Run the API

```bash
npm run dev:api
```

The API listens on `PORT` (default `3000`). Try it:

```bash
curl -i -c cookies.txt -b cookies.txt -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"longUrl":"https://example.com/articles/launch"}'

curl -i http://localhost:3000/<returned-short-code>
```

### Using Docker instead

If you have Docker Desktop running, `docker-compose.yml` starts PostgreSQL and Redis:

```bash
docker compose up -d
```

Update `.env` to match the compose file's credentials (`url_shortener_app` /
`local_dev_password_change_me`, database `url_shortener_dev`, host `localhost`), then run
migrations and the API exactly as above. The API and worker are not yet containerized
(that lands in a later hardening phase); run them with `npm run dev:api` / `npm run
dev:worker` against the containerized Postgres/Redis.

## Running quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test                # Vitest — unit tests plus integration tests against DATABASE_TEST_URL
```

All four must pass before a change is considered complete, per the project rules.
Integration tests (`apps/api/src/repositories/linkRepository.test.ts`,
`apps/api/src/app.test.ts`) require a running, migrated `url_shortener_test` database and
truncate its tables between tests — never point `DATABASE_TEST_URL` at a database with
data you care about.

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

| Method   | Path               | Purpose                                                                                                                                                        |
| -------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/links`       | Create a link (generated code or custom alias); returns an existing link instead of a duplicate by default.                                                    |
| `GET`    | `/api/links`       | List the current owner's active links, newest first, with cursor pagination and optional search.                                                               |
| `GET`    | `/api/links/:code` | Read one owned link's metadata and click count.                                                                                                                |
| `DELETE` | `/api/links/:code` | Soft-delete an owned link. Idempotent; returns a generic 404 for a link you don't own.                                                                         |
| `GET`    | `/:code`           | Public redirect. `302` on success, `404` for unknown/deleted, `410` for expired. Add `Accept: application/json` for a JSON error body instead of an HTML page. |
| `GET`    | `/health/live`     | Liveness — process is responding. Never touches a dependency.                                                                                                  |
| `GET`    | `/health/ready`    | Readiness — confirms PostgreSQL is reachable, with a short timeout.                                                                                            |

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

Analytics-specific privacy behavior (IP hashing, GeoIP, retention) is documented in the
[technical specification](docs/02-technical-specification.md) and
[database schema](docs/05-database-schema.md) but not yet implemented — see
[Implementation status](#implementation-status).

## Known limitations (current state)

- **No caching yet.** Every redirect and list query hits PostgreSQL directly. Redis
  cache-aside is designed (see the technical spec) but not implemented.
- **No click analytics captured yet.** Clicks are not recorded anywhere; `totalClicks`
  will always read `0` until the queue/worker pipeline is built.
- **No rate limiting yet.** Link creation is not currently throttled.
- **No dashboard UI.** Everything above is exercised through the JSON API only.
- **Dependency audit:** `npm audit` reports vulnerabilities in `esbuild` (Vite/Vitest's
  dev-only dependency) and `glob` (a transitive dependency of `node-pg-migrate`'s CLI).
  Both are development-tooling-only exposure — neither ships in the deployed API/worker
  code — and were left unpatched rather than forcing breaking major-version upgrades
  without testing them. Revisit before a real deployment.

No performance claim is made yet; no benchmark has been run. That happens in a later
phase per the implementation plan, and only measured, reproducible numbers will be
recorded here.
