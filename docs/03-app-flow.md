# Application Flow Document

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | URL Shortener with Analytics at Scale |
| Document | Application Flow |
| Version | 1.0 |
| Related documents | `01-prd.md`, `02-technical-specification.md` |
| Purpose | Define user journeys, screen transitions, API interactions, and background processing behavior. |

## 2. Flow Principles

The application must feel simple even though its internals are designed for scale. These principles apply to every flow:

1. One clear primary action per screen.
2. Redirect visitors must reach a valid destination before analytics work is completed.
3. The application must be truthful about delayed analytics instead of implying live data when processing is asynchronous.
4. Errors must be specific and actionable, with no internal technical detail exposed to users.
5. Links and analytics are only visible/manageable within the current owner context.
6. Destructive actions require an explicit confirmation.
7. The dashboard should preserve form entries when validation fails, so users do not need to retype data.

## 3. Actors

| Actor | Description | Main flows |
| --- | --- | --- |
| Link owner | Person who creates and manages links in the dashboard or API. | Create, list, inspect analytics, delete. |
| Link visitor | Person who opens a short URL. | Redirect, invalid/expired link response. |
| API service | Stateless HTTP application. | Validates, authorizes, resolves links, reads cache, publishes events. |
| Redis | Cache and BullMQ backing store. | Serves redirect cache entries and retains jobs. |
| PostgreSQL | Durable data store. | Stores links, click events, and rollups. |
| Analytics worker | Background process. | Enriches and persists queued click events. |
| Aggregation job | Scheduled worker responsibility. | Produces analytics rollups. |

## 4. App Map

```text
Public visitor paths
────────────────────
/:code
 ├── valid active link ───────> external destination URL
 ├── unknown/deleted link ────> minimal 404 page
 └── expired link ────────────> minimal 410 page

Owner dashboard paths
─────────────────────
/                       Dashboard / owned links list
├── create link panel
├── /links/:code          Link details + analytics
└── delete confirmation   Modal / inline confirmation state

API paths
─────────
/api/links                Create and list
/api/links/:code          Read owned metadata; delete
/api/links/:code/analytics  Read owned analytics
```

The public route must be registered after all dashboard/static/API routes. This prevents a code such as `api` or `health` from accidentally consuming application routes.

## 5. Owner Context Initialization Flow

Release 1 can operate without full sign-up by giving each dashboard visitor a secure owner-context cookie. The exact implementation may later switch to authentication, but the app behavior remains the same.

```text
Owner opens dashboard
        |
        v
Browser sends existing signed owner cookie?
        |
   +----+----+
   |         |
 yes        no
   |         |
   v         v
Validate   Generate random owner identifier
cookie             |
   |               v
   |        Sign/set secure HTTP-only cookie
   |               |
   +-------+-------+
           |
           v
Load owned-links list
```

Rules:

- The cookie must not be readable by dashboard JavaScript when an HTTP-only design is used.
- A missing or invalid cookie results in a new anonymous owner context, not an application error.
- The owner identifier is never displayed in the interface.
- Clearing browser data may remove the user’s ability to manage anonymous links; this limitation should be communicated subtly in the UI or avoided by adding accounts later.

## 6. Flow A — Load Dashboard and Link List

### 6.1 User journey

1. The owner opens the dashboard root.
2. The page shows a concise heading, a create-link form, and a links list area.
3. The dashboard requests the first page of owned links.
4. A loading state appears only in the list area; the create form stays usable.
5. The list shows active links in reverse creation order, with destination, short URL, state, date, and click count.
6. The owner can copy a short URL or select a link to view details.

### 6.2 System sequence

```text
Browser                  API                  PostgreSQL
   | GET /api/links        |                       |
   |---------------------->| resolve owner context |
   |                       |---------------------->|
   |                       |   owned links + counts |
   |                       |<----------------------|
   | 200 list + cursor     |                       |
   |<----------------------|                       |
```

### 6.3 UI states

| State | Dashboard behavior |
| --- | --- |
| Initial loading | Show 3–5 simple skeleton rows or a quiet loading label in the list only. |
| Empty | Show “No links yet” and direct attention to the create form. |
| Populated | Show concise rows/cards with copy and details actions. |
| Pagination loading | Keep current items visible and show progress near “Load more.” |
| Request failure | Show a retry action and retain any already loaded rows. |

### 6.4 Filtering and pagination

The first release supports cursor pagination. If a text filter is present, it searches the owner’s codes/destinations only. The UI must debounce typing modestly (for example, 250–350 ms), cancel stale requests when possible, and clearly indicate when no links match.

## 7. Flow B — Create a Generated Short Link

### 7.1 User journey

1. The owner pastes a destination URL into the prominent URL field.
2. The owner may open an “Advanced options” disclosure to enter a custom alias or expiry date.
3. The owner selects **Shorten link**.
4. The interface validates obvious errors immediately, then sends the creation request.
5. On success, a result area shows the short URL, a copy action, destination, and link to analytics.
6. The new or returned-existing link appears at the top of the owned-links list.

### 7.2 User interface flow

```text
Create form
  |
  | enter long URL
  v
Client validation
  |-- invalid --> field error, preserve values
  |
  v
Submit button shows “Creating…” and is disabled
  |
  v
POST /api/links
  |-- validation error --> map server field errors to form
  |-- rate limited -----> show wait guidance
  |-- conflict ---------> highlight custom alias
  |-- network failure --> show retry message; preserve values
  |
  v
Success result + update owned link list
```

### 7.3 API request example

```json
{
  "longUrl": "https://example.com/interesting-article",
  "duplicateHandling": "return_existing"
}
```

The browser uses same-origin credentials so the API receives the owner-context cookie. No owner identifier is sent in a visible JSON body.

### 7.4 Server-side sequence

```text
Browser             API             Rate limiter     PostgreSQL        Redis
  | POST /api/links  |                    |              |               |
  |----------------->| validate owner     |              |               |
  |                  |------------------->|              |               |
  |                  | allowed            |              |               |
  |                  |<-------------------|              |               |
  |                  | validate URL/alias |              |               |
  |                  |---------------------------------->| allocate ID    |
  |                  |                                   | insert link    |
  |                  |<----------------------------------| row            |
  |                  |--------------------------------------------------->|
  |                  | cache redirect mapping (best effort)             |
  |                  |<---------------------------------------------------|
  | 201 Created      |                    |              |               |
  |<-----------------|                    |              |               |
```

### 7.5 Generated-code decision flow

```text
Custom alias supplied?
       |
  +----+----+
  |         |
 yes        no
  |         |
  v         v
Validate    Allocate PostgreSQL numeric link ID
alias           |
  |              v
  |           Encode ID with custom base62 encoder
  v              |
Attempt         v
insert ------> Insert link with generated short code
  |
  +-- unique conflict --> return alias unavailable
  +-- success ---------> create response
```

### 7.6 Duplicate detection flow

```text
Valid creation request
        |
        v
Duplicate handling is return_existing?
        |
   +----+----+
   |         |
 yes        no
   |         |
   v         v
Find active owned link       Always create new link
with same normalized URL             |
   |                                  |
existing?                             |
   |                                  |
 +--+---+                             |
 |      |                             |
yes     no                            |
 |       \____________________________/
 v                    |
Return 200            v
with existing       normal insert flow
link, unless
custom alias
was supplied
```

If `customAlias` is provided, the server must not return some other duplicate generated link. It either creates the requested alias or returns an alias/validation conflict.

### 7.7 Success states

| Outcome | HTTP | UI response |
| --- | --- | --- |
| New link created | 201 | Success card; copy action; prepend link row. |
| Existing duplicate returned | 200 | Success card explains that the existing link was reused. |
| Invalid URL | 400 | URL field error. |
| Alias unavailable | 409 | Alias field error; retain URL and expiry. |
| Creation limit exceeded | 429 | Non-alarming message with wait time when available. |
| Unexpected server error | 5xx | Form-level error and retry button; retain all values. |

## 8. Flow C — Create a Custom Alias and/or Expiring Link

### 8.1 Custom alias interaction

The alias field is optional and hidden inside Advanced options by default. This keeps the primary experience uncluttered.

```text
Owner opens Advanced options
        |
        v
Enters alias
        |
        v
Client checks character/length format
        |
        +-- invalid --> inline advice; submission remains blocked or server validates
        |
        v
Server checks reserved names and uniqueness during POST
        |
        +-- unavailable --> inline error, no link created
        |
        +-- available ---> link created with exact approved alias
```

Do not rely on a separate “availability check” endpoint in Release 1. It can introduce race conditions and unnecessary API calls. The final creation request is authoritative.

### 8.2 Expiry interaction

1. Owner opens Advanced options.
2. Owner enables “Set expiry.”
3. A date/time input appears with local timezone guidance.
4. The client rejects clearly past values.
5. The server converts the submitted ISO timestamp to UTC, confirms it is future-dated, and stores it.
6. The resulting link row shows its expiry date and an active/unexpired state.

The dashboard should state that expiry uses a specific timezone in the creation UI. Internally, timestamps are stored and compared in UTC.

## 9. Flow D — Public Redirect (Hot Path)

This is the most performance-sensitive application flow.

### 9.1 Success path: cache hit

```text
Visitor             API                  Redis                 BullMQ
  | GET /summer       |                     |                     |
  |------------------>| validate code       |                     |
  |                   | GET redirect:link:summer                |
  |                   |-------------------->|                     |
  |                   | cache payload       |                     |
  |                   |<--------------------|                     |
  |                   | validate expiry     |                     |
  |                   | queue click job ------------------------>|
  | 302 Location      |                     |                     |
  |<------------------|                     |                     |
```

The browser begins loading the destination after receiving `302`. The API does not wait for the worker, GeoIP lookup, user-agent parsing, click table insertion, or rollup computation.

### 9.2 Success path: cache miss

```text
Visitor          API                Redis            PostgreSQL         BullMQ
  | GET /summer   |                   |                  |                 |
  |-------------->| GET cache entry   |                  |                 |
  |               |------------------>|                  |                 |
  |               | miss              |                  |                 |
  |               |<------------------|                  |                 |
  |               | SELECT active link by code           |                 |
  |               |------------------------------------->|                 |
  |               | link record                           |                 |
  |               |<-------------------------------------|                 |
  |               | SET redirect cache                    |                 |
  |               |------------------>|                  |                 |
  |               | queue click event ------------------------------------>|
  | 302 Location  |                   |                  |                 |
  |<--------------|                   |                  |                 |
```

The API caches only an active, non-deleted record. It calculates a TTL that cannot outlive an expiry timestamp.

### 9.3 Redirect decision table

| Condition | Cache behavior | Database behavior | Visitor response | Analytics job |
| --- | --- | --- | --- | --- |
| Valid active cache record | Use it | No query | 302 | Publish best-effort job. |
| Cache miss, valid active DB row | Populate cache | Lookup by code | 302 | Publish best-effort job. |
| Cached record now expired | Delete/bypass it | Optional confirm depending on policy | 410 | Do not publish. |
| DB record expired | Do not cache | Authoritative lookup | 410 | Do not publish. |
| Deleted or unknown | Optional short negative cache | Lookup if needed | 404 | Do not publish. |
| Redis unavailable | Skip cache | Lookup by code | 302/404/410 based on DB | Publish only if queue usable; never block redirect. |
| Database unavailable after cache miss | Cache unavailable/miss | Cannot resolve | 503 | Do not publish. |
| Queue unavailable | Normal resolution | No effect | 302 | Log/metric failure only. |

### 9.4 Click event capture details

For a successful redirect, the API constructs a minimal event from:

- Server-generated `eventId`.
- Link ID and short code from resolved link metadata.
- Current UTC time.
- Referrer header, bounded and normalized later.
- User-Agent header, bounded.
- Trusted client IP obtained through correctly configured proxy settings.

The API does not perform enrichment. It attempts to enqueue this payload and records success/failure metrics. Analytics loss is preferable to slowing or failing a legitimate redirect.

### 9.5 Timing budget guidance

The redirect handler has a strict purpose: resolve then redirect. Its main operations are cache read, occasional database lookup, optional cache write, and a bounded event-publish attempt. Application code must not add dashboard permission checks, ORM relation loading, full analytics queries, remote HTTP calls, or verbose synchronous logging to this path.

## 10. Flow E — Analytics Worker Processing

### 10.1 Normal processing flow

```text
BullMQ queue
     |
     v
Worker receives job
     |
     v
Validate event version and required values
     |
     +-- invalid --> mark permanent failure; record safely
     |
     v
Normalize referrer and bound fields
     |
     v
Parse user agent -> device/browser
     |
     v
Offline GeoIP lookup -> country/city (or unknown)
     |
     v
HMAC-hash IP -> discard raw IP value
     |
     v
Insert event using unique eventId
     |
     +-- existing eventId --> treat as already processed
     |
     +-- transient DB error --> retry with configured backoff
     |
     v
Mark job complete
```

### 10.2 Worker outcomes

| Outcome | Worker action | Analytics result |
| --- | --- | --- |
| Valid event | Insert raw click event | Full/partial analytics available. |
| Unknown user agent | Store `unknown` categories | Click still counted. |
| Unknown geo location | Store null/unknown location | Click still counted. |
| Duplicate event ID | Do not insert another row | No double count. |
| Temporary DB/Redis failure | Retry with exponential backoff | Delayed analytics. |
| Permanently malformed job | Fail without repeated retry | Click omitted; operator can inspect. |
| Retries exhausted | Retain failed job record and alert/metric | Click may be omitted. |

### 10.3 Privacy flow

```text
Trusted client IP (in job payload)
        |
        v
Canonicalize address format
        |
        v
HMAC with IP_HASH_SECRET and key version
        |
        v
Persist hash + key version only
        |
        v
Release raw IP variable from memory / never log it
```

Neither the dashboard nor analytics API ever returns the hash.

## 11. Flow F — Scheduled Rollup Processing

Rollups become important when raw click events are too large to query efficiently for common dashboard ranges.

```text
Scheduled trigger (e.g., every 5 minutes)
        |
        v
Read last successful rollup checkpoint
        |
        v
Choose overlap window (e.g., prior 2 hours)
        |
        v
Aggregate raw events by link, bucket, and dimension
        |
        v
Upsert rollup rows
        |
        v
Save successful checkpoint + completion metric
```

The overlap window is intentional: queue retries and delayed workers can deliver events after their ideal time bucket. Recalculating a small recent period and using idempotent upserts makes results converge correctly.

If a rollup fails, raw event storage remains the source for rebuilding. The job must not delete raw events during Release 1.

## 12. Flow G — View Link Details and Analytics

### 12.1 User journey

1. Owner selects a link from the dashboard list or opens its details route.
2. The screen shows the short URL, copy action, destination, created/expiry status, and delete action.
3. The page requests analytics for the default date range (last 30 days).
4. While loading, summary-card and chart skeletons appear.
5. On success, the owner sees total clicks, trend line, referrers, devices/browsers, and geography.
6. Owner changes date range; the page requests analytics again using the selected range.

### 12.2 Sequence

```text
Browser                      API                     PostgreSQL
  | GET /api/links/:code      |                          |
  |-------------------------->| verify owner            |
  |                           |------------------------->|
  |                           | owned link metadata      |
  |                           |<-------------------------|
  | 200 link metadata         |                          |
  |<--------------------------|                          |
  | GET /api/links/:code/analytics?from=...&to=...       |
  |-------------------------->| verify owner/range       |
  |                           |------------------------->|
  |                           | raw/rollup query result  |
  |                           |<-------------------------|
  | 200 analytics summary     |                          |
  |<--------------------------|                          |
```

The API must verify ownership before running potentially expensive analytics queries.

### 12.3 Analytics display state model

| Data condition | UI behavior |
| --- | --- |
| Loading | Keep link metadata visible; show quiet chart/summaries placeholders. |
| Data present | Render KPI total, timeline, and compact breakdown lists/charts. |
| No clicks | Show zero total and friendly empty state; do not render misleading zero-filled charts. |
| Recent event delay | Show non-intrusive eventual-consistency note. |
| Invalid date range | Keep last valid data visible; show range control error. |
| Request failure | Show retry action; do not clear link metadata. |
| Access denied/not found | Navigate to a generic unavailable page; do not reveal whether another owner has the code. |

### 12.4 Date range behavior

The selected range has a single source of truth in the page state and is sent to every analytics query. The default is the previous 30 complete/partial days ending at the present time. Available shortcuts:

- Last 24 hours.
- Last 7 days.
- Last 30 days (default).
- Custom range.

For a range up to 48 hours, hourly buckets are preferred. For larger ranges, daily buckets are preferred. The API makes the final bucket decision if a requested bucket would create too many points.

### 12.5 Privacy-aware geography display

If a city has fewer events than the configured privacy threshold, the API groups it into country-only or `Other`. The dashboard never exposes individual-IP or “unique visitor” claims.

## 13. Flow H — Delete a Link

### 13.1 User journey

1. Owner opens link details.
2. Owner selects **Delete link**.
3. The interface presents a clear confirmation describing the result: the short URL will stop redirecting.
4. Owner cancels or confirms.
5. On confirmation, the API deletes the link.
6. On success, the UI navigates to the list and shows a one-time success message.

### 13.2 System sequence

```text
Browser                  API                    PostgreSQL         Redis
  | DELETE /api/links/x  |                         |                |
  |--------------------->| resolve/verify owner    |                |
  |                      |------------------------>| soft delete    |
  |                      |                         |                |
  |                      |<------------------------| updated row    |
  |                      | DEL redirect:link:x ------------------->|
  |                      |                              success/fail |
  |                      |<-----------------------------------------|
  | 204 No Content       |                         |                |
  |<---------------------|                         |                |
```

The database update is authoritative. Cache invalidation is required and should be retried/alerted when it fails. If Redis is unavailable, the short TTL and database fallback protect correctness, but stale cached redirection is a known temporary risk that must be minimized.

### 13.3 Delete outcome table

| Condition | API outcome | UI behavior |
| --- | --- | --- |
| Owner confirms valid active link | 204 | Navigate to list; show “Link deleted.” |
| Owner cancels | No request | Keep details page unchanged. |
| Already deleted owned link | 204 idempotent | Show it is no longer active; return to list. |
| Unowned or unknown code | 404 generic | Show unavailable page; no ownership signal. |
| Database failure | 5xx | Keep details page and confirmation context; offer retry. |

## 14. Flow I — Invalid, Expired, and Deleted Public Links

### 14.1 Unknown/deleted link

```text
Visitor opens /not-a-link
      |
      v
No active record found
      |
      v
Return HTTP 404
      |
      v
Render minimal “This link is unavailable” page
```

### 14.2 Expired link

```text
Visitor opens expired code
      |
      v
Link exists but expiresAt <= current UTC time
      |
      v
Return HTTP 410 Gone
      |
      v
Render minimal “This link has expired” page
```

### 14.3 Error-page requirements

- Use the same restrained visual language as the dashboard.
- State the outcome in plain language.
- Do not reveal the original destination, owner identity, reason for deletion, internal link ID, or backend errors.
- Offer only a simple route back to the product home page if appropriate.
- Respond with structured JSON when `Accept: application/json` is explicitly requested.

## 15. State Transition Model

```text
                    create
  [does not exist] ---------> [active]
                                |  |
                       expires  |  | delete
                                |  |
                                v  v
                           [expired] [deleted]
```

State is derived:

- `active`: `deleted_at IS NULL` and (`expires_at IS NULL` or `expires_at > now`).
- `expired`: `deleted_at IS NULL` and `expires_at <= now`.
- `deleted`: `deleted_at IS NOT NULL`.

Deletion takes precedence in external responses even if the link would also be expired. No transition returns to active in Release 1.

## 16. Cross-Flow Error and Recovery Rules

| Scenario | Required behavior |
| --- | --- |
| Browser loses network during form submit | Keep entered values; allow owner to retry; avoid assuming failure equals non-creation. |
| Creation request succeeds but browser misses response | Owner can find the link in the list; duplicate behavior reduces accidental duplicates. |
| Queue fails during redirect | Redirect remains successful; log and measure lost enqueue. |
| Worker is down | Redis retains jobs within configured capacity; dashboard may lag. |
| Cache is down | Redirect falls back to database; monitor higher latency. |
| Database is down and no valid cache record exists | Return controlled 503; never redirect to an unverified destination. |
| API rate limit hit | Limit only creation; provide a clear retry timeframe where possible. |
| Owner accesses a stale/deleted dashboard URL | Return generic unavailable state and guide back to the links list. |

## 17. Flow-Level Acceptance Checklist

### Dashboard and creation

- [ ] Opening the dashboard resolves/creates an owner context safely.
- [ ] The create form supports generated code, optional alias, and optional expiry.
- [ ] Validation errors preserve form state.
- [ ] A successful result is easy to copy and immediately appears in the list.
- [ ] Duplicate responses are clearly identified.

### Public redirects

- [ ] Cache-hit redirects avoid a primary database read.
- [ ] Cache-miss redirects load, validate, and cache an active record.
- [ ] Queue/worker trouble cannot prevent a valid redirect.
- [ ] Unknown/deleted links return 404; expired links return 410.
- [ ] Public links never reveal owner or analytics information.

### Analytics

- [ ] Successful redirects create a best-effort queue event.
- [ ] The worker enriches and persists events independently.
- [ ] The analytics view accurately communicates delayed processing.
- [ ] Every breakdown corresponds to the selected date range.
- [ ] Empty, loading, failure, and low-volume privacy states are designed.

### Lifecycle and safety

- [ ] Delete requires confirmation and immediately removes the link from active dashboard state.
- [ ] Delete invalidates the redirect cache.
- [ ] Expiry is enforced at redirect time even when a cache record exists.
- [ ] Owner authorization occurs before management/analytics data is returned.

