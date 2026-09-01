/**
 * Builds the full public short URL shown to an owner, from the configured
 * PUBLIC_BASE_URL rather than any value taken from the incoming request,
 * per Rule S-05.
 */
export function buildShortUrl(publicBaseUrl: string, shortCode: string): string {
  const baseUrlWithoutTrailingSlash = publicBaseUrl.endsWith("/")
    ? publicBaseUrl.slice(0, -1)
    : publicBaseUrl;

  return `${baseUrlWithoutTrailingSlash}/${shortCode}`;
}
