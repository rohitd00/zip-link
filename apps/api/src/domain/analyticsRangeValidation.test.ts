import { describe, expect, it } from "vitest";
import { ValidationError } from "./applicationErrors";
import { validateAnalyticsRange } from "./analyticsRangeValidation";

const currentTime = new Date("2026-09-02T12:00:00.000Z");

describe("validateAnalyticsRange", () => {
  it("defaults to the last 30 days ending now when neither from nor to is supplied", () => {
    const result = validateAnalyticsRange(undefined, undefined, currentTime);
    expect(result.to).toEqual(currentTime);
    expect(result.from).toEqual(new Date("2026-08-03T12:00:00.000Z"));
  });

  it("accepts an explicit valid range", () => {
    const result = validateAnalyticsRange(
      "2026-08-01T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
      currentTime,
    );
    expect(result.from).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(result.to).toEqual(new Date("2026-08-31T00:00:00.000Z"));
  });

  it("rejects a from that is not before to", () => {
    expect(() =>
      validateAnalyticsRange("2026-08-31T00:00:00.000Z", "2026-08-01T00:00:00.000Z", currentTime),
    ).toThrow(ValidationError);
  });

  it("rejects an unparsable timestamp", () => {
    expect(() => validateAnalyticsRange("not-a-date", undefined, currentTime)).toThrow(
      ValidationError,
    );
  });

  it("rejects a range longer than the configured maximum", () => {
    expect(() =>
      validateAnalyticsRange("2025-01-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z", currentTime),
    ).toThrow(ValidationError);
  });
});
