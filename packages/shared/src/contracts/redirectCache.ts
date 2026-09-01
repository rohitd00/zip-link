// This is the exact JSON shape stored in Redis under the key
// `redirect:link:{shortCode}`. It intentionally excludes owner IDs, raw
// analytics data, and any secret so that a cache read can never leak
// private information. See Section 9.2 of the technical specification.
export interface RedirectCachePayload {
  linkId: string;
  shortCode: string;
  longUrl: string;
  expiresAt: string | null;
  redirectStatusCode: number;
}
