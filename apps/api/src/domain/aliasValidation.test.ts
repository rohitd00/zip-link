import { describe, expect, it } from "vitest";
import { ValidationError } from "./applicationErrors";
import { validateCustomAliasFormat } from "./aliasValidation";

describe("validateCustomAliasFormat", () => {
  it("accepts a valid alias using letters, numbers, hyphens, and underscores", () => {
    expect(validateCustomAliasFormat("launch-2026")).toBe("launch-2026");
    expect(validateCustomAliasFormat("summer_sale")).toBe("summer_sale");
  });

  it("trims surrounding whitespace", () => {
    expect(validateCustomAliasFormat("  launch  ")).toBe("launch");
  });

  it("rejects an alias shorter than the minimum length", () => {
    expect(() => validateCustomAliasFormat("ab")).toThrow(ValidationError);
  });

  it("rejects an alias longer than the maximum length", () => {
    expect(() => validateCustomAliasFormat("a".repeat(65))).toThrow(ValidationError);
  });

  it("rejects an alias starting with an underscore", () => {
    expect(() => validateCustomAliasFormat("_launch")).toThrow(ValidationError);
  });

  it("rejects an alias containing a disallowed character", () => {
    expect(() => validateCustomAliasFormat("launch!2026")).toThrow(ValidationError);
    expect(() => validateCustomAliasFormat("launch 2026")).toThrow(ValidationError);
  });

  it("rejects a reserved word regardless of case", () => {
    expect(() => validateCustomAliasFormat("api")).toThrow(ValidationError);
    expect(() => validateCustomAliasFormat("API")).toThrow(ValidationError);
    expect(() => validateCustomAliasFormat("Health")).toThrow(ValidationError);
  });
});
