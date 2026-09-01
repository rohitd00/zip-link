import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

// The worker validates its own required configuration independently of the
// API process, per the technical specification's "worker validates its
// own required values independently" requirement. It does not read
// PUBLIC_BASE_URL, OWNER_COOKIE_SECRET, or any other API-only setting.
export interface WorkerEnvironmentConfig {
  nodeEnvironment: string;
  databaseConnectionString: string;
  redisConnectionString: string;
  ipHashSecret: string;
  ipHashKeyVersion: string;
  analyticsWorkerConcurrency: number;
  logLevel: string;
}

class MissingEnvironmentVariableError extends Error {
  constructor(variableName: string, explanation: string) {
    super(`Missing or invalid required environment variable "${variableName}". ${explanation}`);
    this.name = "MissingEnvironmentVariableError";
  }
}

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

export function loadWorkerEnvironmentConfig(): WorkerEnvironmentConfig {
  const nodeEnvironment = readOptionalStringVariable("NODE_ENV", "development");

  const databaseConnectionString = readRequiredStringVariable(
    "DATABASE_URL",
    "Set DATABASE_URL to a valid PostgreSQL connection string.",
  );

  const redisConnectionString = readRequiredStringVariable(
    "REDIS_URL",
    "Set REDIS_URL to a valid Redis connection string, for example redis://127.0.0.1:6379.",
  );

  const ipHashSecret = readRequiredStringVariable(
    "IP_HASH_SECRET",
    "Set IP_HASH_SECRET to a long random value used to HMAC-hash visitor IP addresses.",
  );

  const ipHashKeyVersion = readRequiredStringVariable(
    "IP_HASH_KEY_VERSION",
    "Set IP_HASH_KEY_VERSION to identify which IP_HASH_SECRET generation is in use, for example v1.",
  );

  const analyticsWorkerConcurrency = readRequiredPositiveIntegerVariable(
    "ANALYTICS_WORKER_CONCURRENCY",
    "Set ANALYTICS_WORKER_CONCURRENCY to how many click events this worker processes at once.",
  );

  const logLevel = readOptionalStringVariable("LOG_LEVEL", "info");

  return {
    nodeEnvironment,
    databaseConnectionString,
    redisConnectionString,
    ipHashSecret,
    ipHashKeyVersion,
    analyticsWorkerConcurrency,
    logLevel,
  };
}
