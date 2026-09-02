import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

function readLoggedLine(consoleLogSpy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const [rawLine] = consoleLogSpy.mock.calls[0] as [string];
  return JSON.parse(rawLine) as Record<string, unknown>;
}

describe("logger redaction", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("redacts a field named for a raw IP address instead of logging its value", () => {
    logger.info("Resolved a redirect request.", { clientIpAddress: "203.0.113.5" });

    const loggedLine = readLoggedLine(consoleLogSpy);
    expect(loggedLine.clientIpAddress).toBe("[REDACTED]");
  });

  it("redacts cookie, secret, and token fields regardless of casing", () => {
    logger.warn("Debug snapshot.", {
      ownerCookie: "value-a",
      apiSecret: "value-b",
      authToken: "value-c",
      Authorization: "value-d",
    });

    const loggedLine = readLoggedLine(consoleLogSpy);
    expect(loggedLine.ownerCookie).toBe("[REDACTED]");
    expect(loggedLine.apiSecret).toBe("[REDACTED]");
    expect(loggedLine.authToken).toBe("[REDACTED]");
    expect(loggedLine.Authorization).toBe("[REDACTED]");
  });

  it("leaves ordinary, non-sensitive fields untouched", () => {
    logger.info("Resolved a redirect request.", {
      shortCode: "abc123",
      outcome: "redirect",
      cacheResult: "hit",
    });

    const loggedLine = readLoggedLine(consoleLogSpy);
    expect(loggedLine.shortCode).toBe("abc123");
    expect(loggedLine.outcome).toBe("redirect");
    expect(loggedLine.cacheResult).toBe("hit");
  });

  it("always includes level, message, and an ISO timestamp", () => {
    logger.error("Something failed.", { requestId: "req_123" });

    const loggedLine = readLoggedLine(consoleLogSpy);
    expect(loggedLine.level).toBe("error");
    expect(loggedLine.message).toBe("Something failed.");
    expect(typeof loggedLine.timestamp).toBe("string");
    expect(new Date(loggedLine.timestamp as string).toString()).not.toBe("Invalid Date");
  });

  it("never lets a field literally named 'message', 'level', or 'timestamp' overwrite the real ones", () => {
    logger.error("The real message.", {
      message: "a field value that happens to be named message",
      level: "info",
      timestamp: "not-a-real-timestamp",
    });

    const loggedLine = readLoggedLine(consoleLogSpy);
    expect(loggedLine.message).toBe("The real message.");
    expect(loggedLine.level).toBe("error");
    expect(new Date(loggedLine.timestamp as string).toString()).not.toBe("Invalid Date");
  });
});
