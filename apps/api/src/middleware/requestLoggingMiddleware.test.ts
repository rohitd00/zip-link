import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "./requestIdMiddleware";
import { requestLoggingMiddleware } from "./requestLoggingMiddleware";

function buildTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
  app.get("/sample-route", (_request, response) => {
    response.status(200).json({ ok: true });
  });
  return app;
}

describe("requestLoggingMiddleware", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("logs exactly one line per request with method, path, status, duration, and request ID", async () => {
    const app = buildTestApp();

    await request(app).get("/sample-route?secretQueryValue=should-not-appear");

    const loggedLines = consoleLogSpy.mock.calls.map(
      (call) => JSON.parse(call[0] as string) as Record<string, unknown>,
    );
    const requestLogLine = loggedLines.find((line) => line.message === "Handled a request.");

    expect(requestLogLine).toBeDefined();
    expect(requestLogLine?.method).toBe("GET");
    expect(requestLogLine?.path).toBe("/sample-route");
    expect(requestLogLine?.statusCode).toBe(200);
    expect(typeof requestLogLine?.durationMilliseconds).toBe("number");
    expect(typeof requestLogLine?.requestId).toBe("string");
  });

  it("never logs the query string, since it may carry values a log reader should not see", async () => {
    const app = buildTestApp();

    await request(app).get("/sample-route?secretQueryValue=should-not-appear");

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0] as string);
    const anyLineContainsQueryValue = loggedLines.some((line) =>
      line.includes("should-not-appear"),
    );

    expect(anyLineContainsQueryValue).toBe(false);
  });
});
