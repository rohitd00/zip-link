import { describe, expect, it } from "vitest";
import { ValidationError } from "./applicationErrors";
import { validateAndNormalizeDestinationUrl } from "./urlValidation";

describe("validateAndNormalizeDestinationUrl", () => {
  it("accepts a valid https URL and keeps the original form", () => {
    const result = validateAndNormalizeDestinationUrl("https://Example.com/Articles/Launch?x=1");
    expect(result.originalUrl).toBe("https://Example.com/Articles/Launch?x=1");
  });

  it("lowercases the protocol and hostname in the normalized form", () => {
    const result = validateAndNormalizeDestinationUrl("HTTPS://Example.COM/path");
    expect(result.normalizedUrl).toBe("https://example.com/path");
  });

  it("removes the default port for http and https", () => {
    const httpResult = validateAndNormalizeDestinationUrl("http://example.com:80/page");
    expect(httpResult.normalizedUrl).toBe("http://example.com/page");

    const httpsResult = validateAndNormalizeDestinationUrl("https://example.com:443/page");
    expect(httpsResult.normalizedUrl).toBe("https://example.com/page");
  });

  it("keeps a non-default port in the normalized form", () => {
    const result = validateAndNormalizeDestinationUrl("https://example.com:8443/page");
    expect(result.normalizedUrl).toBe("https://example.com:8443/page");
  });

  it("removes a trailing slash only for a bare origin path", () => {
    const bareOriginResult = validateAndNormalizeDestinationUrl("https://example.com/");
    expect(bareOriginResult.normalizedUrl).toBe("https://example.com");

    const deeperPathResult = validateAndNormalizeDestinationUrl("https://example.com/articles/");
    expect(deeperPathResult.normalizedUrl).toBe("https://example.com/articles/");
  });

  it("preserves the query string without reordering parameters", () => {
    const result = validateAndNormalizeDestinationUrl("https://example.com/page?b=2&a=1");
    expect(result.normalizedUrl).toBe("https://example.com/page?b=2&a=1");
  });

  it("rejects a javascript protocol", () => {
    expect(() => validateAndNormalizeDestinationUrl("javascript:alert(1)")).toThrow(
      ValidationError,
    );
  });

  it("rejects a data protocol", () => {
    expect(() => validateAndNormalizeDestinationUrl("data:text/plain,hello")).toThrow(
      ValidationError,
    );
  });

  it("rejects a file protocol", () => {
    expect(() => validateAndNormalizeDestinationUrl("file:///etc/passwd")).toThrow(ValidationError);
  });

  it("rejects a URL containing embedded credentials", () => {
    expect(() =>
      validateAndNormalizeDestinationUrl("https://user:password@example.com/page"),
    ).toThrow(ValidationError);
  });

  it("rejects an empty destination URL", () => {
    expect(() => validateAndNormalizeDestinationUrl("   ")).toThrow(ValidationError);
  });

  it("rejects an unparsable URL", () => {
    expect(() => validateAndNormalizeDestinationUrl("not a url at all")).toThrow(ValidationError);
  });

  it("rejects a destination URL longer than the configured maximum", () => {
    const veryLongPath = "a".repeat(5000);
    expect(() => validateAndNormalizeDestinationUrl(`https://example.com/${veryLongPath}`)).toThrow(
      ValidationError,
    );
  });
});
