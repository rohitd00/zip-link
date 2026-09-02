import { MAX_UTM_PARAM_LENGTH_CHARACTERS } from "@shared/constants/validationLimits";

export interface ParsedUtmParameters {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/**
 * Extracts utm_source/utm_medium/utm_campaign from a destination URL's own
 * query string, captured once at link-creation time. This never fails a
 * link creation — a malformed URL cannot reach this function (it always
 * runs after validateAndNormalizeDestinationUrl has already parsed it
 * successfully), and a missing/blank parameter simply yields null.
 */
export function parseUtmParameters(longUrl: string): ParsedUtmParameters {
  const parsedUrl = new URL(longUrl);

  return {
    utmSource: readTrimmedParam(parsedUrl, "utm_source"),
    utmMedium: readTrimmedParam(parsedUrl, "utm_medium"),
    utmCampaign: readTrimmedParam(parsedUrl, "utm_campaign"),
  };
}

function readTrimmedParam(parsedUrl: URL, paramName: string): string | null {
  const rawValue = parsedUrl.searchParams.get(paramName);

  if (rawValue === null) {
    return null;
  }

  const trimmedValue = rawValue.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  return trimmedValue.slice(0, MAX_UTM_PARAM_LENGTH_CHARACTERS);
}
