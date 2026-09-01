// Server-side input limits, matching Section 12.2 of the technical
// specification. These are shared so the API and the web dashboard agree on
// the same boundaries.
export const MAX_LONG_URL_LENGTH_CHARACTERS = 4096;
export const MIN_CUSTOM_ALIAS_LENGTH_CHARACTERS = 3;
export const MAX_CUSTOM_ALIAS_LENGTH_CHARACTERS = 64;
export const MAX_REFERRER_STORED_LENGTH_CHARACTERS = 2048;
export const MAX_USER_AGENT_INPUT_LENGTH_CHARACTERS = 1024;
export const MAX_ANALYTICS_QUERY_RANGE_DAYS = 90;
export const MAX_LINK_LIST_PAGE_SIZE = 100;
export const DEFAULT_LINK_LIST_PAGE_SIZE = 25;

// A custom alias may only contain letters, numbers, hyphens, and
// underscores, and it must not start with an underscore.
export const CUSTOM_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
