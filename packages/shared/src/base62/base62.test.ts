import { describe, expect, it } from "vitest";
import { decodeBase62, encodeBase62 } from "./base62";

describe("encodeBase62", () => {
  it("encodes zero as the literal digit zero", () => {
    expect(encodeBase62(0n)).toBe("0");
  });

  it("encodes small known values using single characters", () => {
    expect(encodeBase62(1n)).toBe("1");
    expect(encodeBase62(9n)).toBe("9");
    expect(encodeBase62(10n)).toBe("a");
    expect(encodeBase62(35n)).toBe("z");
    expect(encodeBase62(36n)).toBe("A");
    expect(encodeBase62(61n)).toBe("Z");
  });

  it("encodes values that require more than one character", () => {
    expect(encodeBase62(62n)).toBe("10");
    expect(encodeBase62(3844n)).toBe("100");
  });

  it("rejects a negative identifier", () => {
    expect(() => encodeBase62(-1n)).toThrow("cannot be negative");
  });
});

describe("decodeBase62", () => {
  it("decodes the literal digit zero back to zero", () => {
    expect(decodeBase62("0")).toBe(0n);
  });

  it("decodes known single-character values", () => {
    expect(decodeBase62("1")).toBe(1n);
    expect(decodeBase62("z")).toBe(35n);
    expect(decodeBase62("Z")).toBe(61n);
  });

  it("rejects an empty short code", () => {
    expect(() => decodeBase62("")).toThrow("cannot be an empty string");
  });

  it("rejects a character outside the base62 alphabet", () => {
    expect(() => decodeBase62("abc!")).toThrow("not part of the base62 alphabet");
  });
});

describe("encodeBase62 and decodeBase62 round trip", () => {
  it("returns the original identifier for a wide range of values", () => {
    const sampleIdentifiers = [0n, 1n, 61n, 62n, 12345n, 999999999n, 9007199254740993n];

    for (const identifier of sampleIdentifiers) {
      const encoded = encodeBase62(identifier);
      const decoded = decodeBase62(encoded);
      expect(decoded).toBe(identifier);
    }
  });
});
