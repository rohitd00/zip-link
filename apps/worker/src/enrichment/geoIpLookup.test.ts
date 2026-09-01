import { describe, expect, it } from "vitest";
import { lookupGeography } from "./geoIpLookup";

describe("lookupGeography", () => {
  it("returns a country code and readable country name for a known public IP", () => {
    const result = lookupGeography("8.8.8.8");
    expect(result.countryCode).toBe("US");
    expect(result.countryName).toBe("United States");
  });

  it("returns all-null fields for a missing IP address", () => {
    expect(lookupGeography(null)).toEqual({
      countryCode: null,
      countryName: null,
      cityName: null,
    });
  });

  it("returns all-null fields for a private/loopback address with no geo data", () => {
    const result = lookupGeography("127.0.0.1");
    expect(result.countryCode).toBeNull();
    expect(result.cityName).toBeNull();
  });

  it("returns all-null fields rather than throwing for a garbage input", () => {
    const result = lookupGeography("not-an-ip-address");
    expect(result).toEqual({ countryCode: null, countryName: null, cityName: null });
  });
});
