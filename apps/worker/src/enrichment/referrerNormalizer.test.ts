import { describe, expect, it } from "vitest";
import { normalizeReferrer } from "./referrerNormalizer";

describe("normalizeReferrer", () => {
  it("returns both fields null for a missing referrer", () => {
    expect(normalizeReferrer(null)).toEqual({ referrer: null, referrerHost: null });
  });

  it("returns both fields null for a blank referrer", () => {
    expect(normalizeReferrer("   ")).toEqual({ referrer: null, referrerHost: null });
  });

  it("extracts a lowercased hostname from a valid referrer URL", () => {
    const result = normalizeReferrer("https://News.Example.com/story/1");
    expect(result.referrerHost).toBe("news.example.com");
    expect(result.referrer).toBe("https://News.Example.com/story/1");
  });

  it("keeps the bounded referrer but returns a null host when it cannot be parsed as a URL", () => {
    const result = normalizeReferrer("not-a-url");
    expect(result.referrer).toBe("not-a-url");
    expect(result.referrerHost).toBeNull();
  });

  it("truncates a referrer longer than the maximum stored length", () => {
    const veryLongReferrer = `https://example.com/${"a".repeat(3000)}`;
    const result = normalizeReferrer(veryLongReferrer);
    expect(result.referrer?.length).toBe(2048);
  });
});
