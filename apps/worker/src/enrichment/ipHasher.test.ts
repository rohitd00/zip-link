import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashClientIpAddress } from "./ipHasher";

describe("hashClientIpAddress", () => {
  it("produces the exact HMAC-SHA-256 hex digest for a known input and secret", () => {
    const expectedDigest = crypto
      .createHmac("sha256", "test-secret")
      .update("203.0.113.5")
      .digest("hex");

    const result = hashClientIpAddress("203.0.113.5", "test-secret", "v1");

    expect(result.ipHash).toBe(expectedDigest);
  });

  it("includes the given key version unchanged", () => {
    const result = hashClientIpAddress("203.0.113.5", "test-secret", "v2");
    expect(result.ipHashKeyVersion).toBe("v2");
  });

  it("produces a different hash for a different IP address with the same secret", () => {
    const first = hashClientIpAddress("203.0.113.5", "test-secret", "v1");
    const second = hashClientIpAddress("203.0.113.6", "test-secret", "v1");

    expect(first.ipHash).not.toBe(second.ipHash);
  });

  it("produces a different hash for the same IP address with a different secret", () => {
    const first = hashClientIpAddress("203.0.113.5", "secret-one", "v1");
    const second = hashClientIpAddress("203.0.113.5", "secret-two", "v1");

    expect(first.ipHash).not.toBe(second.ipHash);
  });

  it("never includes the raw IP address anywhere in its output", () => {
    const result = hashClientIpAddress("203.0.113.5", "test-secret", "v1");

    expect(result.ipHash).not.toContain("203.0.113.5");
    expect(JSON.stringify(result)).not.toContain("203.0.113.5");
  });
});
