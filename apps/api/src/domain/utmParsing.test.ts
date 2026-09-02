import { describe, expect, it } from "vitest";
import { parseUtmParameters } from "./utmParsing";

describe("parseUtmParameters", () => {
  it("extracts all three UTM parameters when present", () => {
    const result = parseUtmParameters(
      "https://example.com/launch?utm_source=newsletter&utm_medium=email&utm_campaign=spring-sale",
    );

    expect(result).toEqual({
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "spring-sale",
    });
  });

  it("returns all null when no UTM parameters are present", () => {
    const result = parseUtmParameters("https://example.com/launch");

    expect(result).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null });
  });

  it("returns null for a blank (whitespace-only) UTM value", () => {
    const result = parseUtmParameters("https://example.com/launch?utm_source=%20%20");

    expect(result.utmSource).toBeNull();
  });

  it("extracts only the parameters that are actually present", () => {
    const result = parseUtmParameters("https://example.com/launch?utm_source=twitter");

    expect(result).toEqual({ utmSource: "twitter", utmMedium: null, utmCampaign: null });
  });

  it("truncates a UTM value longer than the stored column width", () => {
    const longValue = "a".repeat(400);
    const result = parseUtmParameters(`https://example.com/launch?utm_campaign=${longValue}`);

    expect(result.utmCampaign).toHaveLength(255);
  });

  it("ignores unrelated query parameters", () => {
    const result = parseUtmParameters("https://example.com/launch?ref=abc&utm_medium=cpc");

    expect(result).toEqual({ utmSource: null, utmMedium: "cpc", utmCampaign: null });
  });
});
