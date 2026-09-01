import { describe, expect, it } from "vitest";
import { buildRangeForPreset } from "./dateRangeHelpers";

describe("buildRangeForPreset", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");

  it("builds a 24-hour range ending now", () => {
    const range = buildRangeForPreset("24h", now);
    expect(range.to).toBe("2026-09-02T12:00:00.000Z");
    expect(range.from).toBe("2026-09-01T12:00:00.000Z");
  });

  it("builds a 7-day range ending now", () => {
    const range = buildRangeForPreset("7d", now);
    expect(range.from).toBe("2026-08-26T12:00:00.000Z");
  });

  it("builds a 30-day range ending now", () => {
    const range = buildRangeForPreset("30d", now);
    expect(range.from).toBe("2026-08-03T12:00:00.000Z");
  });
});
