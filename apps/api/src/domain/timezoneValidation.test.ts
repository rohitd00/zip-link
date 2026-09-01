import { describe, expect, it } from "vitest";
import { ValidationError } from "./applicationErrors";
import { validateTimezone } from "./timezoneValidation";

describe("validateTimezone", () => {
  it("defaults to UTC when no timezone is supplied", () => {
    expect(validateTimezone(undefined)).toBe("UTC");
  });

  it("accepts a valid IANA timezone name", () => {
    expect(validateTimezone("America/New_York")).toBe("America/New_York");
    expect(validateTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("rejects an unrecognized timezone name", () => {
    expect(() => validateTimezone("Not/A_Real_Zone")).toThrow(ValidationError);
  });
});
