import { describe, expect, it } from "vitest";
import { applyGeographyPrivacyThreshold } from "./analyticsService";

describe("applyGeographyPrivacyThreshold", () => {
  it("keeps a city that meets the display threshold", () => {
    const result = applyGeographyPrivacyThreshold([
      { countryCode: "US", countryName: "United States", cityName: "Chicago", clickCount: 5 },
    ]);

    expect(result).toEqual([{ country: "United States", city: "Chicago", clickCount: 5 }]);
  });

  it("suppresses a city below the display threshold into its country", () => {
    const result = applyGeographyPrivacyThreshold([
      { countryCode: "US", countryName: "United States", cityName: "Peoria", clickCount: 1 },
    ]);

    expect(result).toEqual([{ country: "United States", city: null, clickCount: 1 }]);
  });

  it("merges two suppressed cities in the same country into one row", () => {
    const result = applyGeographyPrivacyThreshold([
      { countryCode: "US", countryName: "United States", cityName: "Peoria", clickCount: 1 },
      { countryCode: "US", countryName: "United States", cityName: "Topeka", clickCount: 1 },
    ]);

    expect(result).toEqual([{ country: "United States", city: null, clickCount: 2 }]);
  });

  it("keeps a large city and a suppressed city in the same country as two separate rows", () => {
    const result = applyGeographyPrivacyThreshold([
      { countryCode: "US", countryName: "United States", cityName: "Chicago", clickCount: 5 },
      { countryCode: "US", countryName: "United States", cityName: "Peoria", clickCount: 1 },
    ]);

    expect(result).toHaveLength(2);
    expect(result.find((row) => row.city === "Chicago")).toBeDefined();
    expect(result.find((row) => row.city === null)?.clickCount).toBe(1);
  });

  it("labels a row with no country as Unknown rather than dropping it", () => {
    const result = applyGeographyPrivacyThreshold([
      { countryCode: null, countryName: null, cityName: null, clickCount: 2 },
    ]);

    expect(result).toEqual([{ country: "Unknown", city: null, clickCount: 2 }]);
  });

  it("sorts the result by click count descending", () => {
    const result = applyGeographyPrivacyThreshold([
      { countryCode: "IN", countryName: "India", cityName: "Kolkata", clickCount: 3 },
      { countryCode: "US", countryName: "United States", cityName: "Chicago", clickCount: 10 },
    ]);

    expect(result[0]?.country).toBe("United States");
    expect(result[1]?.country).toBe("India");
  });
});
