// A small, dependency-free structured logger, matching
// apps/api/src/observability/logger.ts. It is intentionally duplicated
// rather than shared: the worker and API are separate deployable
// processes, and this file is small enough that sharing it is not worth
// the coupling.
export type LogFields = Record<string, string | number | boolean | null>;

function writeLogLine(level: "info" | "warn" | "error", message: string, fields?: LogFields): void {
  const logLine = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  console.log(JSON.stringify(logLine));
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    writeLogLine("info", message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    writeLogLine("warn", message, fields);
  },
  error(message: string, fields?: LogFields): void {
    writeLogLine("error", message, fields);
  },
};
