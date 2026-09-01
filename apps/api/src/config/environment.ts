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
  logLevel: string;
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

  const logLevel = readOptionalStringVariable("LOG_LEVEL", "info");

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
    logLevel,
  };
}
