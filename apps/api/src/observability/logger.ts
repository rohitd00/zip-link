// A small, dependency-free structured logger. Every log line is a single
// JSON object so it can be read by a log aggregator later. This
// deliberately never accepts a raw IP address, cookie value, or connection
// string as a field name, matching Rule O-01 in the project rules.
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
