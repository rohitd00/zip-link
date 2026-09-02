// A small, dependency-free structured logger. Every log line is a single
// JSON object so it can be read by a log aggregator later. This
// deliberately never accepts a raw IP address, cookie value, or connection
// string as a field name, matching Rule O-01 in the project rules.
export type LogFields = Record<string, string | number | boolean | null>;

const REDACTED_VALUE = "[REDACTED]";

// A field whose *name* matches any of these patterns has its value
// replaced before the log line is ever written, no matter which call site
// produced it. This is a last-line-of-defense safety net: every current
// call site already avoids logging these fields on purpose, but a future
// change that accidentally passes one (for example `{ clientIpAddress }`
// or `{ cookie }`) must not silently leak it into the logs.
const SENSITIVE_FIELD_NAME_PATTERN =
  /ip|cookie|password|secret|token|authorization|connectionstring|databaseurl|redisurl|apikey/i;

function redactSensitiveFields(fields: LogFields | undefined): LogFields | undefined {
  if (fields === undefined) {
    return fields;
  }

  const redactedFields: LogFields = {};

  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    redactedFields[fieldName] = SENSITIVE_FIELD_NAME_PATTERN.test(fieldName)
      ? REDACTED_VALUE
      : fieldValue;
  }

  return redactedFields;
}

function writeLogLine(level: "info" | "warn" | "error", message: string, fields?: LogFields): void {
  // `level`/`message`/`timestamp` are spread last so they always win: a
  // caller that happens to pass a field named "message" (an error's own
  // `.message`, most commonly) must never silently overwrite the actual
  // log message instead of just losing that one field, which is what
  // spreading `fields` last would do.
  const logLine = {
    ...redactSensitiveFields(fields),
    level,
    message,
    timestamp: new Date().toISOString(),
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
