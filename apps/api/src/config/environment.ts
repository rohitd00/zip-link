import path from "node:path";
import dotenv from "dotenv";

// Load variables from the repository-root .env file before we read
// anything from process.env. This only affects local development; in a
// real deployment the platform sets process.env directly and this call is
// a harmless no-op if no .env file is present.
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

// This is the fully validated shape of runtime configuration that the rest
// of the API is allowed to depend on. Nothing outside this file should read
// process.env directly, so every required setting is checked in one place.
export interface ApiEnvironmentConfig {
  nodeEnvironment: string;
  port: number;
  publicBaseUrl: string;
  databaseConnectionString: string;
  redisConnectionString: string;
  ownerCookieSecret: string;
  redirectCacheTtlSeconds: number;
  createRateLimitMaxRequests: number;
  createRateLimitWindowSeconds: number;
  authRateLimitMaxRequests: number;
  authRateLimitWindowSeconds: number;
  logLevel: string;
  trustProxyHops: number;
  // Where the dashboard (apps/web) is actually served from — used only to
  // build links that point *at* the dashboard from outside it, such as a
  // password-reset email. This is deliberately separate from
  // publicBaseUrl, which is the API's own base URL (used to build short
  // links) — in production these are two different domains (the dashboard
  // on Vercel, the API on Render), so conflating them would build broken
  // email links.
  dashboardBaseUrl: string;
  // Google OAuth ("Sign in with Google") is optional: unset in local
  // development, this simply means that one sign-in method is
  // unavailable, not that the app fails to start — see
  // authController.ts's handling of a missing client ID/secret.
  googleOAuthClientId: string | null;
  googleOAuthClientSecret: string | null;
  // Outgoing transactional email (welcome messages, password resets) is
  // also optional — see EmailService's own comment for what happens
  // locally without it configured.
  resendApiKey: string | null;
  emailFromAddress: string;
}

class MissingEnvironmentVariableError extends Error {
  constructor(variableName: string, explanation: string) {
    super(`Missing or invalid required environment variable "${variableName}". ${explanation}`);
    this.name = "MissingEnvironmentVariableError";
  }
}

// Each of these small functions reads exactly one environment variable and
// explains, in its own error message, what a developer needs to fix. This
// is deliberately verbose instead of one generic schema object, so a
// missing variable produces an obvious, specific startup failure.

function readRequiredStringVariable(variableName: string, explanation: string): string {
  const rawValue = process.env[variableName];

  if (rawValue === undefined || rawValue.trim().length === 0) {
    throw new MissingEnvironmentVariableError(variableName, explanation);
  }

  return rawValue;
}

function readOptionalStringVariable(variableName: string, defaultValue: string): string {
  const rawValue = process.env[variableName];

  if (rawValue === undefined || rawValue.trim().length === 0) {
    return defaultValue;
  }

  return rawValue;
}

// Unlike readOptionalStringVariable, this has no default — an unset value
// means "this optional feature is turned off," which the caller checks
// for explicitly (rather than silently falling back to some placeholder
// string that would look configured but isn't).
function readOptionalNullableStringVariable(variableName: string): string | null {
  const rawValue = process.env[variableName];

  if (rawValue === undefined || rawValue.trim().length === 0) {
    return null;
  }

  return rawValue;
}

function readRequiredPositiveIntegerVariable(variableName: string, explanation: string): number {
  const rawValue = readRequiredStringVariable(variableName, explanation);
  const parsedValue = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    throw new MissingEnvironmentVariableError(
      variableName,
      `${explanation} It must be a positive whole number, but received "${rawValue}".`,
    );
  }

  return parsedValue;
}

// Unlike the other numeric settings, this one is optional and defaults to
// 0 (meaning: trust no proxy, use the raw socket address). It is only ever
// non-zero in a real deployment behind a reverse proxy/load balancer — see
// the long comment on trustProxyHops's usage in app.ts for why this must
// never be turned on somewhere requests arrive directly.
function readOptionalNonNegativeIntegerVariable(
  variableName: string,
  defaultValue: number,
  explanation: string,
): number {
  const rawValue = process.env[variableName];

  if (rawValue === undefined || rawValue.trim().length === 0) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsedValue) || parsedValue < 0) {
    throw new MissingEnvironmentVariableError(
      variableName,
      `${explanation} It must be zero or a positive whole number, but received "${rawValue}".`,
    );
  }

  return parsedValue;
}

/**
 * Reads and validates every required setting from process.env. This is
 * called once at process startup. If a required value is missing or
 * malformed, the process must fail immediately with a clear message rather
 * than starting in a partially configured state.
 */
export function loadApiEnvironmentConfig(): ApiEnvironmentConfig {
  const nodeEnvironment = readOptionalStringVariable("NODE_ENV", "development");

  const port = readRequiredPositiveIntegerVariable(
    "PORT",
    "Set PORT to the TCP port the API should listen on, for example 3000.",
  );

  const publicBaseUrl = readRequiredStringVariable(
    "PUBLIC_BASE_URL",
    "Set PUBLIC_BASE_URL to the canonical URL used to build short links, for example http://localhost:3000.",
  );

  const databaseConnectionString = readRequiredStringVariable(
    "DATABASE_URL",
    "Set DATABASE_URL to a valid PostgreSQL connection string.",
  );

  const redisConnectionString = readRequiredStringVariable(
    "REDIS_URL",
    "Set REDIS_URL to a valid Redis connection string, for example redis://127.0.0.1:6379.",
  );

  const ownerCookieSecret = readRequiredStringVariable(
    "OWNER_COOKIE_SECRET",
    "Set OWNER_COOKIE_SECRET to a long random value used to sign the anonymous owner cookie.",
  );

  const redirectCacheTtlSeconds = readRequiredPositiveIntegerVariable(
    "REDIRECT_CACHE_TTL_SECONDS",
    "Set REDIRECT_CACHE_TTL_SECONDS to the default number of seconds a redirect cache entry should live.",
  );

  const createRateLimitMaxRequests = readRequiredPositiveIntegerVariable(
    "CREATE_RATE_LIMIT_MAX_REQUESTS",
    "Set CREATE_RATE_LIMIT_MAX_REQUESTS to the number of link-creation requests allowed per window.",
  );

  const createRateLimitWindowSeconds = readRequiredPositiveIntegerVariable(
    "CREATE_RATE_LIMIT_WINDOW_SECONDS",
    "Set CREATE_RATE_LIMIT_WINDOW_SECONDS to the length, in seconds, of the creation rate-limit window.",
  );

  const authRateLimitMaxRequests = readOptionalNonNegativeIntegerVariable(
    "AUTH_RATE_LIMIT_MAX_REQUESTS",
    10,
    "Set AUTH_RATE_LIMIT_MAX_REQUESTS to the number of login/signup/password-reset attempts " +
      "allowed per window (a separate limit from link creation).",
  );

  const authRateLimitWindowSeconds = readOptionalNonNegativeIntegerVariable(
    "AUTH_RATE_LIMIT_WINDOW_SECONDS",
    900,
    "Set AUTH_RATE_LIMIT_WINDOW_SECONDS to the length, in seconds, of the auth rate-limit window.",
  );

  const logLevel = readOptionalStringVariable("LOG_LEVEL", "info");

  const trustProxyHops = readOptionalNonNegativeIntegerVariable(
    "TRUST_PROXY_HOPS",
    0,
    "Set TRUST_PROXY_HOPS to the number of reverse proxies/load balancers in front of this API " +
      "(for example 1 on most platform-as-a-service hosts), so request.ip reads the real visitor " +
      "address from X-Forwarded-For instead of the proxy's own address. Leave unset (0) when " +
      "nothing sits in front of this process, such as local development.",
  );

  const dashboardBaseUrl = readOptionalStringVariable(
    "DASHBOARD_BASE_URL",
    "http://localhost:5173",
  );

  const googleOAuthClientId = readOptionalNullableStringVariable("GOOGLE_OAUTH_CLIENT_ID");
  const googleOAuthClientSecret = readOptionalNullableStringVariable("GOOGLE_OAUTH_CLIENT_SECRET");

  const resendApiKey = readOptionalNullableStringVariable("RESEND_API_KEY");
  const emailFromAddress = readOptionalStringVariable(
    "EMAIL_FROM_ADDRESS",
    "ZipLink <onboarding@resend.dev>",
  );

  return {
    nodeEnvironment,
    port,
    publicBaseUrl,
    databaseConnectionString,
    redisConnectionString,
    ownerCookieSecret,
    redirectCacheTtlSeconds,
    createRateLimitMaxRequests,
    createRateLimitWindowSeconds,
    authRateLimitMaxRequests,
    authRateLimitWindowSeconds,
    logLevel,
    trustProxyHops,
    dashboardBaseUrl,
    googleOAuthClientId,
    googleOAuthClientSecret,
    resendApiKey,
    emailFromAddress,
  };
}
