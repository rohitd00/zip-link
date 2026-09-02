import { describe, expect, it } from "vitest";
import { computePercentChange } from "./usePeriodComparison";

describe("computePercentChange", () => {
  it("computes a positive percentage increase", () => {
    expect(computePercentChange(150, 100)).toBe(50);
  });

  it("computes a negative percentage decrease", () => {
    expect(computePercentChange(50, 100)).toBe(-50);
  });

  it("returns 0 when the value did not change", () => {
    expect(computePercentChange(100, 100)).toBe(0);
  });

  it("returns null when the previous value was zero, rather than dividing by zero", () => {
    expect(computePercentChange(10, 0)).toBeNull();
  });
});
