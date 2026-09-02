import { describe, expect, it } from "vitest";
import { ValidationError } from "./applicationErrors";
import {
  validateAndNormalizeDisplayName,
  validateAndNormalizeEmail,
  validatePasswordFormat,
} from "./authValidation";

describe("validateAndNormalizeEmail", () => {
  it("lowercases and trims a valid email", () => {
    expect(validateAndNormalizeEmail("  Person@Example.COM  ")).toBe("person@example.com");
  });

  it("rejects an empty value", () => {
    expect(() => validateAndNormalizeEmail("   ")).toThrow(ValidationError);
  });

  it("rejects a value with no @ sign", () => {
    expect(() => validateAndNormalizeEmail("not-an-email")).toThrow(ValidationError);
  });

  it("rejects a value with no domain", () => {
    expect(() => validateAndNormalizeEmail("person@")).toThrow(ValidationError);
  });

  it("rejects a value containing whitespace", () => {
    expect(() => validateAndNormalizeEmail("person @example.com")).toThrow(ValidationError);
  });
});

describe("validatePasswordFormat", () => {
  it("accepts a password at the minimum length", () => {
    expect(validatePasswordFormat("12345678")).toBe("12345678");
  });

  it("rejects a password shorter than the minimum", () => {
    expect(() => validatePasswordFormat("short")).toThrow(ValidationError);
  });

  it("rejects a password longer than the maximum", () => {
    expect(() => validatePasswordFormat("a".repeat(500))).toThrow(ValidationError);
  });
});

describe("validateAndNormalizeDisplayName", () => {
  it("returns null when not provided", () => {
    expect(validateAndNormalizeDisplayName(undefined)).toBeNull();
  });

  it("returns null for a whitespace-only value", () => {
    expect(validateAndNormalizeDisplayName("   ")).toBeNull();
  });

  it("trims a provided value", () => {
    expect(validateAndNormalizeDisplayName("  Alex  ")).toBe("Alex");
  });

  it("rejects a value longer than the maximum", () => {
    expect(() => validateAndNormalizeDisplayName("a".repeat(500))).toThrow(ValidationError);
  });
});
