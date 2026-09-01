import { MAX_LONG_URL_LENGTH_CHARACTERS } from "@shared/constants/validationLimits";
import { ValidationError } from "./applicationErrors";

export interface ValidatedDestinationUrl {
  originalUrl: string;
  normalizedUrl: string;
}

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Validates a destination URL submitted for shortening and produces its
 * normalized form used only for owner-scoped duplicate detection. The
 * original, validated URL is what the redirect actually uses; normalization
 * never changes redirect behavior. See Section 7.3 of the technical
 * specification for the exact normalization rules.
 */
export function validateAndNormalizeDestinationUrl(rawLongUrl: string): ValidatedDestinationUrl {
  const trimmedLongUrl = rawLongUrl.trim();

  if (trimmedLongUrl.length === 0) {
    throw new ValidationError("The destination URL is required.", [
      { field: "longUrl", message: "Enter a destination URL." },
    ]);
  }

  if (trimmedLongUrl.length > MAX_LONG_URL_LENGTH_CHARACTERS) {
    throw new ValidationError("The destination URL is too long.", [
      {
        field: "longUrl",
        message: `Use a URL with at most ${MAX_LONG_URL_LENGTH_CHARACTERS} characters.`,
      },
    ]);
  }

  const parsedUrl = parseUrlOrThrowValidationError(trimmedLongUrl);

  if (!ALLOWED_URL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new ValidationError("The destination URL uses an unsupported protocol.", [
      { field: "longUrl", message: "Use a valid HTTP or HTTPS URL." },
    ]);
  }

  if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
    throw new ValidationError("The destination URL must not contain credentials.", [
      { field: "longUrl", message: "Remove the username and password from the URL." },
    ]);
  }

  if (parsedUrl.hostname.length === 0) {
    throw new ValidationError("The destination URL must include a host name.", [
      { field: "longUrl", message: "Use a valid HTTP or HTTPS URL." },
    ]);
  }

  return {
    originalUrl: trimmedLongUrl,
    normalizedUrl: buildNormalizedUrl(parsedUrl),
  };
}

function parseUrlOrThrowValidationError(candidateUrl: string): URL {
  try {
    return new URL(candidateUrl);
  } catch {
    throw new ValidationError("The destination URL could not be parsed.", [
      { field: "longUrl", message: "Use a valid HTTP or HTTPS URL." },
    ]);
  }
}

function buildNormalizedUrl(parsedUrl: URL): string {
  const normalizedProtocol = parsedUrl.protocol.toLowerCase();
  const normalizedHostname = parsedUrl.hostname.toLowerCase();
  const normalizedPort = getNormalizedPort(normalizedProtocol, parsedUrl.port);
  const normalizedPath = getNormalizedPath(parsedUrl.pathname);

  const hostAndPort =
    normalizedPort === "" ? normalizedHostname : `${normalizedHostname}:${normalizedPort}`;

  return `${normalizedProtocol}//${hostAndPort}${normalizedPath}${parsedUrl.search}`;
}

function getNormalizedPort(normalizedProtocol: string, port: string): string {
  const isDefaultHttpPort = normalizedProtocol === "http:" && port === "80";
  const isDefaultHttpsPort = normalizedProtocol === "https:" && port === "443";

  if (isDefaultHttpPort || isDefaultHttpsPort) {
    return "";
  }

  return port;
}

function getNormalizedPath(pathname: string): string {
  const isBareOriginPath = pathname === "/";

  if (isBareOriginPath) {
    return "";
  }

  return pathname;
}
