// Server-side input limits, matching Section 12.2 of the technical
// specification. These are shared so the API and the web dashboard agree on
// the same boundaries.
export const MAX_LONG_URL_LENGTH_CHARACTERS = 4096;
export const MIN_CUSTOM_ALIAS_LENGTH_CHARACTERS = 3;
export const MAX_CUSTOM_ALIAS_LENGTH_CHARACTERS = 64;
export const MAX_REFERRER_STORED_LENGTH_CHARACTERS = 2048;
export const MAX_USER_AGENT_INPUT_LENGTH_CHARACTERS = 1024;
export const MAX_ANALYTICS_QUERY_RANGE_DAYS = 90;
export const DEFAULT_ANALYTICS_QUERY_RANGE_DAYS = 30;
export const MAX_LINK_LIST_PAGE_SIZE = 100;
export const DEFAULT_LINK_LIST_PAGE_SIZE = 25;

// Below this many events, a city is not shown on its own — it is grouped
// into its country instead. This is a privacy threshold (Rule P-04), not a
// display-space limit: a handful of clicks from one named city could
// otherwise identify a specific small group of visitors.
export const MIN_CITY_EVENT_COUNT_FOR_DISPLAY = 3;

// A range this long or shorter uses hour buckets by default; anything
// longer uses day buckets, matching Section 12.4 of app-flow.md.
export const HOURLY_BUCKET_MAX_RANGE_HOURS = 48;

// A custom alias may only contain letters, numbers, hyphens, and
// underscores, and it must not start with an underscore.
export const CUSTOM_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// Account-related limits. A password minimum of 8 is intentionally modest
// (not a complex-character-class rule) — length matters far more than
// forced character variety, and bcrypt itself makes brute-forcing a short
// hash slow regardless.
export const MAX_EMAIL_LENGTH_CHARACTERS = 320; // the RFC 5321 maximum
export const MIN_PASSWORD_LENGTH_CHARACTERS = 8;
export const MAX_PASSWORD_LENGTH_CHARACTERS = 200;
export const MAX_DISPLAY_NAME_LENGTH_CHARACTERS = 200;
