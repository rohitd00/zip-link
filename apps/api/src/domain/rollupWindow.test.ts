import { describe, expect, it } from "vitest";
import { calculateDailyRollupWindow, calculateHourlyRollupWindow } from "./rollupWindow";

describe("calculateHourlyRollupWindow", () => {
  it("ends at the start of the next UTC hour", () => {
    const window = calculateHourlyRollupWindow(new Date("2026-03-15T10:47:22.123Z"));
    expect(window.windowEnd.toISOString()).toBe("2026-03-15T11:00:00.000Z");
  });

  it("starts three complete hours before the current hour", () => {
    const window = calculateHourlyRollupWindow(new Date("2026-03-15T10:47:22.123Z"));
    expect(window.windowStart.toISOString()).toBe("2026-03-15T07:00:00.000Z");
  });

  it("crosses a UTC day boundary correctly", () => {
    const window = calculateHourlyRollupWindow(new Date("2026-03-15T01:10:00.000Z"));
    expect(window.windowStart.toISOString()).toBe("2026-03-14T22:00:00.000Z");
    expect(window.windowEnd.toISOString()).toBe("2026-03-15T02:00:00.000Z");
  });
});

describe("calculateDailyRollupWindow", () => {
  it("ends at the start of the next UTC day", () => {
    const window = calculateDailyRollupWindow(new Date("2026-03-15T10:47:22.123Z"));
    expect(window.windowEnd.toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });

  it("starts two complete days before the current day", () => {
    const window = calculateDailyRollupWindow(new Date("2026-03-15T10:47:22.123Z"));
    expect(window.windowStart.toISOString()).toBe("2026-03-13T00:00:00.000Z");
  });

  it("crosses a UTC month boundary correctly", () => {
    const window = calculateDailyRollupWindow(new Date("2026-03-01T05:00:00.000Z"));
    expect(window.windowStart.toISOString()).toBe("2026-02-27T00:00:00.000Z");
    expect(window.windowEnd.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });
});
