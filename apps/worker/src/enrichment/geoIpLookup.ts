import geoip from "geoip-lite";

export interface GeoLookupResult {
  countryCode: string | null;
  countryName: string | null;
  cityName: string | null;
}

// geoip-lite only returns a country code, not a full country name. Node's
// built-in Intl.DisplayNames turns that code into a readable name without
// needing a second dataset or dependency.
const countryNameFormatter = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * Looks up approximate country/city for an IP address using an offline
 * dataset bundled with geoip-lite — no external network call, matching
 * Rule P-04. Any failure (private/reserved IP, unrecognized address,
 * lookup error) produces null fields rather than throwing, since a click
 * must still be counted even when its geography cannot be determined.
 */
export function lookupGeography(ipAddress: string | null): GeoLookupResult {
  if (ipAddress === null || ipAddress.trim().length === 0) {
    return { countryCode: null, countryName: null, cityName: null };
  }

  try {
    const lookupResult = geoip.lookup(ipAddress);

    if (lookupResult === null) {
      return { countryCode: null, countryName: null, cityName: null };
    }

    const countryCode = normalizeCountryCode(lookupResult.country);
    const countryName = countryCode === null ? null : safeCountryName(countryCode);
    const cityName = lookupResult.city.trim().length > 0 ? lookupResult.city : null;

    return { countryCode, countryName, cityName };
  } catch {
    return { countryCode: null, countryName: null, cityName: null };
  }
}

function normalizeCountryCode(rawCountryCode: string): string | null {
  const upperCaseCode = rawCountryCode.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upperCaseCode) ? upperCaseCode : null;
}

function safeCountryName(countryCode: string): string | null {
  try {
    return countryNameFormatter.of(countryCode) ?? null;
  } catch {
    return null;
  }
}
