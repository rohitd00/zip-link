import { describe, expect, it } from "vitest";
import { chooseAnalyticsBucket } from "./analyticsBucketSelection";

describe("chooseAnalyticsBucket", () => {
  it("chooses hour for a short range when nothing was requested", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-02T00:00:00.000Z"); // 24 hours
    expect(chooseAnalyticsBucket(null, from, to)).toBe("hour");
  });

  it("chooses day for a long range when nothing was requested", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-09-01T00:00:00.000Z"); // 31 days
    expect(chooseAnalyticsBucket(null, from, to)).toBe("day");
  });

  it("honors an explicit day request regardless of range", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-02T00:00:00.000Z");
    expect(chooseAnalyticsBucket("day", from, to)).toBe("day");
  });

  it("honors a reasonable explicit hour request", () => {
    const from = new Date("2026-08-25T00:00:00.000Z");
    const to = new Date("2026-09-02T00:00:00.000Z"); // 8 days
    expect(chooseAnalyticsBucket("hour", from, to)).toBe("hour");
  });

  it("overrides an explicit hour request when the range is impractically long", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-09-02T00:00:00.000Z"); // ~8 months
    expect(chooseAnalyticsBucket("hour", from, to)).toBe("day");
  });
});
