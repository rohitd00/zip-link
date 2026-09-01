import { describe, expect, it } from "vitest";
import { calculateRedirectCacheTtlSeconds } from "./cacheTtl";

const currentTime = new Date("2026-09-02T12:00:00.000Z");
const defaultTtlSeconds = 86400;

describe("calculateRedirectCacheTtlSeconds", () => {
  it("uses the default TTL when the link never expires", () => {
    const ttl = calculateRedirectCacheTtlSeconds(null, currentTime, defaultTtlSeconds);
    expect(ttl).toBe(86400);
  });

  it("uses the remaining lifetime when it is shorter than the default TTL", () => {
    const expiresAt = new Date("2026-09-02T12:00:30.000Z"); // 30 seconds away
    const ttl = calculateRedirectCacheTtlSeconds(expiresAt, currentTime, defaultTtlSeconds);
    expect(ttl).toBe(30);
  });

  it("uses the default TTL when the remaining lifetime is longer than it", () => {
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");
    const ttl = calculateRedirectCacheTtlSeconds(expiresAt, currentTime, defaultTtlSeconds);
    expect(ttl).toBe(86400);
  });

  it("returns a non-positive value for a link that has already expired", () => {
    const expiresAt = new Date("2026-09-02T11:59:00.000Z");
    const ttl = calculateRedirectCacheTtlSeconds(expiresAt, currentTime, defaultTtlSeconds);
    expect(ttl).toBeLessThanOrEqual(0);
  });

  it("returns zero for a link expiring at exactly the current instant", () => {
    const ttl = calculateRedirectCacheTtlSeconds(currentTime, currentTime, defaultTtlSeconds);
    expect(ttl).toBe(0);
  });
});
