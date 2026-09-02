# Design Specification

## 1. Document Control

| Field | Value |
| --- | --- |
| Product | URL Shortener with Analytics at Scale |
| Document | Design Specification |
| Version | 1.0 |
| Design direction | Modern polished minimal SaaS product UI (Linear-inspired), accessible and quietly professional |
| Related documents | `01-prd.md`, `03-app-flow.md` |

## 2. Design Objective

Create an interface that makes link creation, link management, and analytics easy to understand at a glance. The visual design must support the product’s technical maturity without making the application feel overloaded or “dashboard-heavy.”

The product should feel like a clear desk: plenty of space, a few well-organized tools, readable information, and no decoration that competes with the task.

### 2.1 Desired qualities

- Calm and modern rather than flashy.
- Fast to scan on first use.
- Clear enough that the create-link action needs no tutorial.
- Data-oriented without feeling like an enterprise control panel.
- Trustworthy and privacy-conscious.
- Accessible on a keyboard, small screen, and assistive technology.

### 2.2 Explicitly avoid

- Large gradients, glassmorphism, neon colors, and decorative background artwork.
- Excessive rounded cards nested inside other rounded cards.
- Auto-playing animation, animated counters, and attention-seeking charts.
- Dense tables with tiny text.
- Icon-only controls where the action matters (small supporting icons next to labels are fine, and used throughout, but never replace a text label).
- Multiple competing primary buttons on the same screen.
- Technical implementation language in user-facing copy.

## 3. Design Principles

| Principle | Meaning in this product |
| --- | --- |
| One task at a time | The dashboard leads with creating a link; analytics leads with the selected link’s performance. |
| Quiet hierarchy | Use spacing, typography, and restrained contrast before adding borders, badges, or color. |
| Data with context | Counts always have a label, range, and sensible empty state. |
| Trust through clarity | Explain expiry, deletion, delayed analytics, and errors directly. |
| Accessible by default | Color is never the sole source of meaning; controls are labelled and keyboard reachable. |
| Responsive simplification | Small screens reorder content and reduce density rather than merely shrinking desktop layouts. |
| Honest system state | Show analytics processing delay and request errors plainly; never simulate live data. |

## 4. Information Architecture

### 4.1 Primary navigation

Release 1 uses intentionally limited navigation:

```text
Product mark / name     Links
                         └─ selected link details / analytics
```

The root dashboard is the links home. A separate “Analytics” top-level destination is not needed because analytics are meaningful only in the context of one link. This avoids navigation clutter.

### 4.2 Page hierarchy

```text
Dashboard home (/)
├── Create link panel
├── Recent / owned links list
│   └── Link detail (/links/:code)
│       ├── Link overview
│       ├── Analytics range controls
│       ├── Click total and timeline
│       ├── Breakdown cards
│       └── Delete action + confirmation
└── Empty, loading, and error variants

Public redirect pages
├── Link unavailable (404)
└── Link expired (410)
```

## 5. Visual Foundation

### 5.1 Color system

Use a cool neutral base with one confident violet accent, in the vein of Linear/Vercel/Stripe-style SaaS products. The named tokens below are a starting point, not a requirement to hard-code raw values in components; they are implemented as CSS-native `@theme` tokens in `apps/web/src/styles/global.css`.

| Token | Value | Usage |
| --- | --- | --- |
| `color.canvas` | `#FBFBFC` | Cool off-white page background. |
| `color.surface` | `#FFFFFF` | Cards, inputs, modal surfaces. |
| `color.surfaceSubtle` | `#F4F4F6` | Quiet input/container fill, segmented-control tracks. |
| `color.text` | `#0F0F13` | Primary text. |
| `color.textMuted` | `#6B6B76` | Supporting labels and metadata. |
| `color.border` | `#E6E6EA` | Light dividers and form borders. |
| `color.borderStrong` | `#D4D4DA` | Hover state for bordered surfaces. |
| `color.accent` | `#5B57E0` | Primary actions, focused links, active states. |
| `color.accentHover` | `#4B47CC` | Hover/pressed primary action. |
| `color.accentSoft` | `#F0EFFF` | Subtle selected/focus background. |
| `color.success` | `#17803D` | Confirmed/success state. |
| `color.warning` | `#B45309` | Expiring soon / caution state. |
| `color.danger` | `#C0281C` | Delete action, destructive alert. |
| `color.info` | `#0369A1` | Eventual-consistency information. |

Each status color also has a paired `*Soft` background token (for example `color.dangerSoft`) used behind badges, alerts, and dot indicators so the saturated color is reserved for text/icons only.

Rules:

- Primary body text must meet WCAG AA contrast against its surface.
- Do not color all metrics. Most values should use normal text; use accent only to guide attention.
- Error/success/warning status must pair color with text and, where useful, an icon.
- The public error pages use the same palette with no alarming red full-page treatment.

### 5.2 Typography

Use Inter (with the system UI stack as fallback) as the single sans-serif family across the product, matching the reference product direction. Body text uses slightly tightened letter-spacing (`-0.011em`) for a denser, more polished feel typical of modern SaaS dashboards.

| Role | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Display title | 30–36 px / 1.15 | 650–700 | Page titles only. |
| Section heading | 20–24 px / 1.25 | 600–650 | Major areas. |
| Card heading | 15–16 px / 1.4 | 600 | Metric/card labels. |
| Body | 14–16 px / 1.5 | 400–450 | Descriptions and form text. |
| Meta | 12–13 px / 1.4 | 450–500 | Dates, labels, minor status. |
| Numeric metric | 28–32 px / 1.1 | 650–700 | Key analytics total. |
| URL/code | 13–15 px / 1.4 | 500; monospace optional | Short links when distinction helps copying. |

Do not use all-caps labels except where an established accessibility/brand reason exists. Sentence case is clearer and friendlier.

### 5.3 Spacing and layout tokens

Use a four-pixel base grid:

| Token | Value | Typical use |
| --- | --- | --- |
| `space.1` | 4 px | Icon/label or micro separation. |
| `space.2` | 8 px | Input internal gaps. |
| `space.3` | 12 px | Related controls. |
| `space.4` | 16 px | Standard card padding on mobile. |
| `space.5` | 20 px | Form field separation. |
| `space.6` | 24 px | Card padding / section inner spacing. |
| `space.8` | 32 px | Major section separation. |
| `space.10` | 40 px | Page-level separation. |
| `space.12` | 48 px | Large desktop separation. |

Desktop content uses a maximum width of 1,152–1,200 px and centered page gutters. A narrow analytics reading width must not stretch tables or charts edge-to-edge on very wide screens.

### 5.4 Shape, border, shadow, and motion

| Element | Rule |
| --- | --- |
| Card radius | 16 px (`radius.card`). |
| Input/button radius | 10 px (`radius.control`). |
| Border | 1 px `color.border`; paired with a very light shadow rather than relying on the border alone. |
| Shadow | A restrained two-layer `shadow.card` sits under every card, input, and button by default (not only modals); it deepens slightly to `shadow.cardHover` on hover and to `shadow.dialog` for the confirmation modal. Shadows must stay subtle enough to read as "quiet elevation," never a heavy drop shadow. |
| Buttons | Solid primary uses the near-black text color at rest and shifts to the accent color on hover; secondary is a bordered white surface; destructive stays outlined everywhere except the single solid button inside the delete-confirmation dialog. |
| Focus ring | Text inputs use a 3 px accent-soft ring plus an accent border on focus instead of the browser's default outline; buttons and other controls keep a 2 px offset accent outline. Focus must never be removed without a replacement. |
| Motion | 120–180 ms ease-out for opacity/background/shadow/transform changes (for example the advanced-options chevron rotation). Respect `prefers-reduced-motion`. |

## 6. Responsive Layout Rules

| Breakpoint | Range | Behavior |
| --- | --- | --- |
| Small | under 640 px | Single column, 16 px page gutter, full-width primary actions. |
| Medium | 640–1023 px | Two-column metric grids; create form may use a two-part row. |
| Large | 1024 px and above | Centered content; dashboard links list and create card may use full width; analytics breakdowns use 2–3 columns. |

Rules for small screens:

- Never require horizontal scrolling for links lists. Long destinations are truncated to two lines with a visible full-value tooltip/title or expandable detail view.
- Convert table-like link rows to stacked cards if columns no longer fit.
- Keep “Copy” and primary actions easy to tap (minimum 44×44 px target).
- Charts occupy full container width, use fewer x-axis labels, and keep a text alternative.
- The delete action remains visible but visually separate from primary tasks.

## 7. Core Components

### 7.1 Application shell

```text
┌────────────────────────────────────────────────────────────────┐
│  ↗ Shortlink                                      Links          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                     centered page content                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- Header height: 64 px desktop, 56–64 px mobile.
- The header stays sticky at the top of the viewport with a translucent, blurred background (`backdrop-blur`) over the scrolling page content, a common modern-SaaS convention that keeps navigation reachable without feeling heavy.
- Product mark pairs a small solid dark square logo tile containing a link glyph with the wordmark text, instead of a bare text wordmark.
- Header has a bottom border, no large hero area.
- “Links” is the only nav item in Release 1 and is visually quiet when already on the dashboard.

### 7.2 Button system

| Variant | Purpose | Style |
| --- | --- | --- |
| Primary | Main action: “Shorten link,” “Save,” confirmation submit | Accent fill, white text, clear hover/focus. |
| Secondary | Non-destructive supporting action: “Copy link,” “Load more” | White surface, border, dark text. |
| Tertiary/text | Low-emphasis navigation/action: “Advanced options,” “Cancel” | Text-only, accent or muted text. |
| Destructive | “Delete link” and delete confirmation | Danger text or outlined action; solid danger only in final confirmation. |
| Icon with label | Copy/refresh where space permits | Icon supplements text, never replaces important label. |

Button content rules:

- Use a clear verb: “Shorten link,” not “Submit.”
- Disable only while the immediate action is pending; show the action state (“Creating…”, “Deleting…”).
- Do not use a spinner alone without a textual label for a primary action.

### 7.3 Form fields

Each field includes a persistent visible label, input, optional helper text, and inline error placement.

```text
Destination URL
[ https://example.com/your-long-link                         ]
Paste a public HTTP or HTTPS URL.

! Use a valid HTTP or HTTPS URL.
```

Rules:

- Labels stay visible; placeholder text is not a label.
- Inputs are 44 px minimum height.
- Use visible focus state.
- Server errors appear beside the relevant field whenever possible.
- Form-level errors appear above the primary action and use `role="alert"`.

### 7.4 Copy control

The short URL needs an obvious copy affordance.

```text
https://sho.rt/w7e                         [ Copy ]
```

After success, change the button label to “Copied” briefly; do not show a disruptive toast alone. Copy failures show “Couldn’t copy—select the link to copy it.”

### 7.5 Status badge

Badges are used sparingly for link lifecycle status:

| State | Label | Style |
| --- | --- | --- |
| Active | Active | Small colored dot indicator + label inside a bordered white pill. |
| Expiring soon | Expires soon | Amber dot indicator, only when within configured period. |
| Expired | Expired | Neutral/amber dot indicator. |
| Deleted | Deleted | Neutral gray dot indicator, in administrative/history context only. |

The badge uses a small colored dot (not a filled background) next to the label inside a bordered pill on the surface color, a common modern-SaaS convention for lightweight status. Do not use badges for every metadata value. Creation date and click count should be plain text.

### 7.6 Metric card

```text
┌─────────────────────────┐
│ ⊙ Total clicks          │
│                         │
│ 1,248                   │
│ Last 30 days            │
└─────────────────────────┘
```

- One key number per card.
- A small muted icon sits beside the label for quick visual scanning, matching the reference product's convention; it is decorative (`aria-hidden`) and never a substitute for the text label.
- Label above, supporting range/context below.
- No decorative mini charts in the metric card for Release 1.
- Use a single metric card for total clicks at the top; do not manufacture extra vanity metrics.

### 7.7 Chart container

```text
┌──────────────────────────────────────────────────────────┐
│ Clicks over time                         [Last 30 days ▾] │
│                                                          │
│     ╭─╮                                                  │
│  ╭──╯ ╰──╮     ╭──╮                                      │
│──╯       ╰─────╯  ╰────                                │
│                                                          │
│ Aug 03       Aug 17       Aug 31                         │
└──────────────────────────────────────────────────────────┘
```

- Use one line/area chart with a restrained accent stroke and very light fill, or line only if fill reduces clarity.
- Keep grid lines subtle.
- Tooltip appears on hover/focus and includes bucket start, timezone, and click count.
- Provide a visually hidden or collapsible tabular equivalent of the timeline data.
- Never draw a deceptive continuous line across large periods with no data; use accurate zero/empty values according to the API result.

### 7.8 Breakdown card

```text
┌─────────────────────────┐
│ ⊙ Top referrers          │
│                           │
│ news.example        400  │
│ direct              286  │
│ search.example      175  │
│                           │
│ [View all]                │
└─────────────────────────┘
```

- Use a simple ranked list before considering pie charts.
- A small muted icon labels the card title, consistent with the metric card.
- Right-align counts for scanability.
- Each row may show a light proportional background bar sized to that row's share of the top value, layered behind the text so it never reduces contrast (see Section 12.2).
- Long referrer names are ellipsized but available on hover/focus.
- Show `Direct / unknown` as a user-friendly normalized label rather than a blank value.

## 8. Screen Specification: Dashboard Home

### 8.1 Content order

```text
Header
  ↓
Page title + short description
  ↓
Create link card
  ↓
Owned links section title + filter
  ↓
Links list / empty state
```

### 8.2 Desktop wireframe

```text
┌────────────────────────────────────────────────────────────────────┐
│ ↗ Shortlink                                             Links        │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ Your links                                                         │
│ Create a short link and see how people use it.                     │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ Shorten a link                                                │   │
│ │ Destination URL                                               │   │
│ │ [https://example.com/your-long-link                       ]  │   │
│ │ [Advanced options]                  [ Shorten link ]          │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ Your links                                      [Search links    ] │
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ sho.rt/w7e  [Copy]  example.com/article...  1,248 clicks  ›   │   │
│ ├──────────────────────────────────────────────────────────────┤   │
│ │ sho.rt/a2B  [Copy]  example.com/signup...       84 clicks  ›  │   │
│ └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 8.3 Create link card

The create card is the dominant interactive element but should not feel oversized.

Fields:

1. **Destination URL** — required, full width.
2. **Advanced options** — a text disclosure, collapsed by default.
3. **Custom alias** — optional, shown only when expanded.
4. **Expiry** — optional toggle and date/time input, shown only when expanded.
5. **Shorten link** — primary action, aligned right on desktop and full width on mobile.

Copy:

- Title: “Shorten a link”
- Helper: “Paste a public HTTP or HTTPS URL.”
- Advanced trigger: “Advanced options”
- Optional alias helper: “Use letters, numbers, hyphens, or underscores.”
- Expiry helper: “The link will stop working after this time.”

### 8.4 Creation success panel

Replace or appear directly below the form after success:

```text
┌──────────────────────────────────────────────────────────────┐
│ Link created                                                   │
│ https://sho.rt/w7e                                  [Copied] │
│ Opens example.com/your-long-link                               │
│ [View analytics]                                               │
└──────────────────────────────────────────────────────────────┘
```

For a duplicate response, title copy becomes “Existing link found.” The panel must say it returned a previously created link, avoiding the impression that a new link was made.

### 8.5 Links list

On desktop, display each link as a roomy row rather than a dense spreadsheet. Columns are visually organized but do not require heavy table borders.

| Content | Desktop placement | Mobile placement |
| --- | --- | --- |
| Short URL + copy | Left, strongest text | First row. |
| Destination | Middle, truncated | Second row, up to two lines. |
| Status/expiry | Middle or metadata line | Metadata line. |
| Click count | Right aligned | Third row or beside short URL. |
| Details affordance | Far right chevron/text | Entire card is selectable, with accessible label. |

The short URL is more visually prominent than the long destination because it is the product object the owner manages. The destination remains readable enough to prevent accidental confusion.

### 8.6 Empty state

```text
No links yet
Create your first short link above. You’ll see its clicks here after people open it.
```

No illustration is needed. A small link glyph is optional but should not dominate.

## 9. Screen Specification: Link Details and Analytics

### 9.1 Content order

```text
Back to links
  ↓
Short URL + copy + lifecycle status
Destination + created/expiry metadata
  ↓
Analytics heading + date range control
  ↓
Total clicks metric
  ↓
Clicks-over-time chart
  ↓
Referrers, devices, browsers, geography breakdown cards
  ↓
Danger zone / delete link
```

### 9.2 Desktop wireframe

```text
┌────────────────────────────────────────────────────────────────────┐
│ ← All links                                                        │
│                                                                    │
│ sho.rt/w7e                                      [Copy] [Active]    │
│ https://example.com/interesting-article                            │
│ Created Sep 1, 2026 · No expiry                                    │
│                                                                    │
│ Analytics                                      [ Last 30 days ▾ ] │
│ Recent clicks may take a moment to appear.                         │
│                                                                    │
│ ┌────────────────┐  ┌──────────────────────────────────────────┐  │
│ │ Total clicks   │  │ Clicks over time                           │  │
│ │                │  │             chart                          │  │
│ │ 1,248          │  │                                            │  │
│ │ Last 30 days   │  │                                            │  │
│ └────────────────┘  └──────────────────────────────────────────┘  │
│                                                                    │
│ ┌────────────────┐ ┌────────────────┐ ┌─────────────────────────┐ │
│ │ Top referrers  │ │ Devices        │ │ Geography               │ │
│ │ ranked list    │ │ ranked list    │ │ ranked list             │ │
│ └────────────────┘ └────────────────┘ └─────────────────────────┘ │
│                                                                    │
│ ──────────────────────────────────────────────────────────────── │
│ Delete link                                                        │
│ This stops the short URL from redirecting.        [Delete link]   │
└────────────────────────────────────────────────────────────────────┘
```

### 9.3 Link overview

- “Back to links” is a simple text link with left arrow, not a large button.
- The short URL is the title and has an adjacent copy button.
- Destination appears as a clickable external link with an external-link indicator, but must be escaped and safely rendered.
- Metadata follows in muted text: creation date, expiry date or “No expiry.”
- An active/expired badge appears only as lifecycle context.

### 9.4 Analytics controls

Use compact segmented range shortcuts and a custom date-range popover or simple date inputs.

```text
[24 hours] [7 days] [30 days] [Custom range]
```

The active range gets a subtle accent-soft background and accent text, not a large filled button. The UI shows timezone in a small supporting label: “Times shown in UTC” or the selected IANA timezone.

### 9.5 Analytics hierarchy

1. Total clicks answers “How much activity?”
2. Timeline answers “When did activity happen?”
3. Breakdowns answer “Where and how did it happen?”

This order prevents the page from becoming a collection of equally loud visual cards.

### 9.6 Empty analytics state

```text
No clicks in this period
When someone opens this short link, their visit will appear here shortly.
```

Show the link overview and range controls normally. Do not display decorative empty chart axes or empty pie charts.

### 9.7 Partial analytics state

If click count exists but a dimension is unavailable (for example, GeoIP lookup unavailable), show:

```text
Location data is not available for this period.
```

Do not hide the entire analytics page or substitute a misleading zero.

### 9.8 Privacy copy

Use a small optional info tooltip or disclosure near geography, not a persistent warning banner:

```text
Location is approximate. We do not display individual visitor identities.
```

## 10. Screen Specification: Delete Confirmation

Use a modal only for the irreversible/delete confirmation; avoid modals for routine form editing.

```text
┌─────────────────────────────────────────┐
│ Delete this link?                        │
│                                         │
│ sho.rt/w7e will stop redirecting.        │
│ Historical analytics may remain private. │
│                                         │
│                    [Cancel] [Delete link]│
└─────────────────────────────────────────┘
```

Behavior:

- Focus moves into the modal when opened and returns to the delete trigger when closed.
- Escape closes without deletion.
- The destructive action is the only solid danger button.
- The dialog has `role="dialog"`, an accessible title, description, and focus trap.
- During deletion, show “Deleting…” and prevent accidental duplicate submission.

## 11. Screen Specification: Public Error Pages

### 11.1 Link unavailable (404)

```text
↗ Shortlink

This link is unavailable
It may have been removed, or the address may be incorrect.

[Go to home]
```

### 11.2 Link expired (410)

```text
↗ Shortlink

This link has expired
The person who created it set an end time for this link.

[Go to home]
```

Rules:

- Center a narrow text block vertically with generous whitespace; no full-screen illustration.
- Use status code only in technical JSON responses, not as the main human-facing visual message.
- Do not reveal the original URL, link owner, deletion rationale, or any analytics information.

## 12. Data Visualization Guidelines

### 12.1 Timeline chart

- Use a single-series line or subtle area chart for click count by time bucket.
- `color.accent` is the only strong series color.
- Zero is always visibly anchored on the y-axis.
- Show a maximum of 5–7 x-axis labels on mobile and 7–10 on desktop.
- Tooltips must be keyboard reachable if the charting library supports it; otherwise provide a table alternative.
- Date bucket labels include timezone in accessible descriptions.

### 12.2 Ranked lists vs. charts

Use ranked lists for referrers, browsers, devices, and geography in Release 1. They are more readable, space-efficient, and accessible than several small pie charts.

Each row uses a light accent-soft horizontal bar behind the row, proportional to that row's count relative to the highest count in the same card. The bar is a decorative layer only; the numeric count text is always present and must never rely on the bar's width to convey the value.

### 12.3 Number formatting

- Use locale-aware separators: `1,248` rather than `1248`.
- For values under 10,000, display the full number.
- Abbreviations (`1.2k`) may appear only in visually constrained secondary contexts and must have an accessible full value.
- Click count always includes the word “clicks” somewhere near it.

## 13. Content and Voice Guidelines

The product voice is direct, calm, and non-technical.

| Situation | Preferred copy | Avoid |
| --- | --- | --- |
| Create action | “Shorten link” | “Execute” / “Generate resource” |
| Success | “Link created” | “Operation completed successfully” |
| Duplicate | “Existing link found” | “Duplicate entity returned” |
| Processing delay | “Recent clicks may take a moment to appear.” | “Eventual consistency pending.” |
| Invalid URL | “Use a valid HTTP or HTTPS URL.” | “Malformed URI.” |
| Alias conflict | “That custom alias is already in use.” | “Unique constraint violation.” |
| Rate limit | “You’ve created several links recently. Try again shortly.” | “429 Too Many Requests.” |
| Delete | “This stops the short URL from redirecting.” | “Soft-delete link record.” |

Avoid promises such as “real-time analytics” unless a later architecture guarantees that behavior.

## 14. Accessibility Requirements

### 14.1 Semantic structure

- One `h1` per page; heading levels must follow a logical sequence.
- Use native `button`, `input`, `label`, `select`, `dialog` where possible.
- Use a real table only when the links list remains tabular at large desktop widths; otherwise use semantic lists/articles with clear labels.
- Announce creation success, form failures, copy result, and load errors through an appropriate live region.

### 14.2 Keyboard behavior

- Tab order follows visual/reading order.
- All interactive actions are reachable and have visible focus.
- Escape closes advanced popovers/modals where applicable.
- Enter submits the create form when focus is in a form field, unless a combobox/date picker has a documented alternate behavior.
- Copy, range shortcuts, date controls, and delete confirmation work without a pointer.

### 14.3 Color and contrast

- Text and controls meet WCAG AA contrast minimums.
- Statuses pair written label with color.
- Focus ring is not replaced by subtle color-only styling.
- Chart data must have textual labels/alternatives.

### 14.4 Responsive accessibility

- Zoom at 200% without losing actions or forcing horizontal page scrolling.
- Maintain touch target size on mobile.
- Do not rely solely on hover to reveal vital information or actions.

## 15. Loading, Empty, Success, and Error Patterns

| State | Pattern |
| --- | --- |
| Initial dashboard load | Skeleton list rows; create form remains active. |
| Form submit | Button label changes; inputs may stay visible but prevent duplicate submit. |
| New-link success | Inline success panel with copy and analytics action. |
| Duplicate success | Same panel with transparent “existing link” wording. |
| Analytics loading | Preserve link header; skeleton for only the analytics region. |
| Analytics no data | Clear empty state and recent-processing note. |
| Network failure | Contextual error plus retry; do not discard existing content. |
| Server validation | Field-level message; retain values. |
| Deletion | Confirmation modal; then navigation and one-time success message. |

Toast messages may supplement an inline result but must not be the only way to learn about an action outcome.

## 16. Interaction Details

### 16.1 Advanced-options disclosure

- Closed by default.
- Uses a text button with a chevron that rotates only if motion is enabled.
- Has `aria-expanded` and `aria-controls`.
- Opening it moves no focus automatically; the user remains in control.
- Closing it does not erase entered optional values without warning.

### 16.2 Long URL display

- In input fields, show full editable value.
- In lists, display hostname plus enough path context; truncate gracefully.
- In link details, display destination as a wrapped, safe external link.
- Use `overflow-wrap: anywhere` for unusually long strings in detail views to avoid layout breakage.

### 16.3 Search/filter

- Place a compact “Search links” input above the list.
- Start filtering after user input rather than showing a large search mode.
- Clear button appears only when a query is entered.
- On mobile, it stays full width above link cards.

### 16.4 Date range

- Range selections update only analytics, not the whole page.
- Canceling a custom range preserves the previously active range.
- Invalid `from > to` produces an inline range error.
- A spinner is not needed for very quick requests; use it only after a short delay to avoid flicker.

## 17. Tailwind Implementation Guidance

Use Tailwind as a design-token and composition tool, not as a way to create unreadable class strings.

1. Define shared colors, type scale, spacing, radii, and shadows in the Tailwind theme or CSS variables.
2. Extract repeated visual patterns into named components: `PrimaryButton`, `TextField`, `StatusBadge`, `MetricCard`, `BreakdownCard`, `EmptyState`.
3. Avoid individual JSX elements with long, unstructured class lists that are difficult to review.
4. Use semantic component props (`variant="danger"`, `isLoading`, `status="active"`) rather than scattered conditional class expressions.
5. Keep responsive behavior explicit and readable in each component.
6. Do not use arbitrary pixel values repeatedly when a design token exists.

Example of desired component intent:

```tsx
<PrimaryButton isLoading={isCreatingLink} type="submit">
  Shorten link
</PrimaryButton>
```

The implementation should keep the underlying code verbose and human-readable, consistent with the project-wide coding rule.

## 18. Design Acceptance Checklist

### Visual quality

- [ ] The interface uses one restrained accent color and neutral surfaces.
- [ ] Layout has generous but purposeful whitespace.
- [ ] Cards are used for clear grouping, not every element.
- [ ] There are no decorative gradients, noisy backgrounds, or unnecessary animation.
- [ ] A single primary action is obvious on each screen.

### Dashboard

- [ ] The create form is immediately visible and understandable.
- [ ] Advanced options do not distract from the default flow.
- [ ] Success, duplicate, validation, and rate-limit states have clear copy.
- [ ] Links remain readable with long destinations and on mobile.

### Analytics

- [ ] Link identity and total clicks appear before detailed breakdowns.
- [ ] Timeline uses honest data and includes accessible alternative information.
- [ ] Breakdowns use readable ranked lists.
- [ ] Empty and delayed-processing states are deliberate and reassuring.
- [ ] Geography is presented as approximate and privacy-aware.

### Accessibility and interaction

- [ ] Visible labels and focus states exist for all controls.
- [ ] Color does not carry meaning alone.
- [ ] Keyboard navigation and deletion-modal focus behavior are tested.
- [ ] Loading/error updates are announced accessibly.
- [ ] Mobile touch targets and 200% zoom remain usable.

