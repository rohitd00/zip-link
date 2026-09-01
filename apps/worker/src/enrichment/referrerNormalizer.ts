const MAX_REFERRER_STORED_LENGTH_CHARACTERS = 2048;

export interface NormalizedReferrer {
  referrer: string | null;
  referrerHost: string | null;
}

/**
 * Normalizes the raw referrer value from a click event job into the two
 * fields click_events actually stores: the bounded original value, and its
 * parsed hostname for grouping. An unparsable or missing referrer is
 * represented as "direct/unknown" (both fields null), never as an error.
 */
export function normalizeReferrer(rawReferrer: string | null): NormalizedReferrer {
  if (rawReferrer === null || rawReferrer.trim().length === 0) {
    return { referrer: null, referrerHost: null };
  }

  const boundedReferrer = rawReferrer.slice(0, MAX_REFERRER_STORED_LENGTH_CHARACTERS);

  try {
    const parsedReferrerUrl = new URL(boundedReferrer);
    return { referrer: boundedReferrer, referrerHost: parsedReferrerUrl.hostname.toLowerCase() };
  } catch {
    return { referrer: boundedReferrer, referrerHost: null };
  }
}
