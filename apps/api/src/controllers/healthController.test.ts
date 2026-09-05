import type Redis from "ioredis";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthController } from "./healthController";

function buildFakeResponse() {
  const response = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

function buildFakePool(query: () => Promise<unknown>): Pool {
  return { query } as unknown as Pool;
}

function buildFakeRedis(ping: () => Promise<unknown>): Redis {
  return { ping } as unknown as Redis;
}

describe("HealthController", () => {
  it("reports liveness as ok without touching any dependency", () => {
    const pool = buildFakePool(() => Promise.reject(new Error("should never be called")));
    const redisClient = buildFakeRedis(() => Promise.reject(new Error("should never be called")));
    const controller = new HealthController(pool, redisClient);
    const response = buildFakeResponse();

    controller.handleLiveness({} as never, response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("reports 200 ok when both PostgreSQL and Redis respond", async () => {
    const pool = buildFakePool(() => Promise.resolve({ rows: [] }));
    const redisClient = buildFakeRedis(() => Promise.resolve("PONG"));
    const controller = new HealthController(pool, redisClient);
    const response = buildFakeResponse();

    await controller.handleReadiness({} as never, response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      dependencies: { database: "ok", cache: "ok" },
    });
  });

  it("reports 503 unavailable when PostgreSQL is down, even if Redis is fine", async () => {
    const pool = buildFakePool(() => Promise.reject(new Error("connection refused")));
    const redisClient = buildFakeRedis(() => Promise.resolve("PONG"));
    const controller = new HealthController(pool, redisClient);
    const response = buildFakeResponse();

    await controller.handleReadiness({} as never, response as never);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      status: "unavailable",
      dependencies: { database: "unavailable", cache: "ok" },
    });
  });

  it("stays 200 ok (degraded cache) when only Redis is down, since redirects fall back to PostgreSQL", async () => {
    const pool = buildFakePool(() => Promise.resolve({ rows: [] }));
    const redisClient = buildFakeRedis(() => Promise.reject(new Error("connection refused")));
    const controller = new HealthController(pool, redisClient);
    const response = buildFakeResponse();

    await controller.handleReadiness({} as never, response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      dependencies: { database: "ok", cache: "degraded" },
    });
  });

  it("does not hang forever when a dependency never responds", async () => {
    const pool = buildFakePool(() => new Promise(() => {}));
    const redisClient = buildFakeRedis(() => new Promise(() => {}));
    const controller = new HealthController(pool, redisClient);
    const response = buildFakeResponse();

    await controller.handleReadiness({} as never, response as never);

    expect(response.statusCode).toBe(503);
  });

  describe("dependency check caching", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reuses a cached result for repeated calls within the cache TTL, instead of re-checking every time", async () => {
      let databaseCallCount = 0;
      let redisCallCount = 0;
      const pool = buildFakePool(() => {
        databaseCallCount += 1;
        return Promise.resolve({ rows: [] });
      });
      const redisClient = buildFakeRedis(() => {
        redisCallCount += 1;
        return Promise.resolve("PONG");
      });
      const controller = new HealthController(pool, redisClient);

      await controller.handleReadiness({} as never, buildFakeResponse() as never);
      await controller.handleReadiness({} as never, buildFakeResponse() as never);
      await controller.handleReadiness({} as never, buildFakeResponse() as never);

      expect(databaseCallCount).toBe(1);
      expect(redisCallCount).toBe(1);
    });

    it("checks again once the cache TTL has expired", async () => {
      let redisCallCount = 0;
      const pool = buildFakePool(() => Promise.resolve({ rows: [] }));
      const redisClient = buildFakeRedis(() => {
        redisCallCount += 1;
        return Promise.resolve("PONG");
      });
      const controller = new HealthController(pool, redisClient);

      await controller.handleReadiness({} as never, buildFakeResponse() as never);
      vi.advanceTimersByTime(11_000);
      await controller.handleReadiness({} as never, buildFakeResponse() as never);

      expect(redisCallCount).toBe(2);
    });
  });
});
