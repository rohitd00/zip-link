import { BASE62_ALPHABET, BASE62_ALPHABET_LENGTH, BASE62_CHARACTER_TO_VALUE } from "./alphabet";

/**
 * Converts a non-negative database identifier into a base62 short code.
 *
 * This project deliberately does not use UUID, Nano ID, or any other random
 * identifier library to create short codes. The database allocates a unique
 * numeric identifier through its identity sequence, and this function turns
 * that number into a compact, URL-safe, and fully deterministic string.
 */
export function encodeBase62(numericIdentifier: bigint): string {
  if (numericIdentifier < 0n) {
    throw new Error("A base62 identifier cannot be negative.");
  }

  if (numericIdentifier === 0n) {
    return "0";
  }

  let remainingValue = numericIdentifier;
  let encodedValue = "";

  while (remainingValue > 0n) {
    const remainder = remainingValue % BASE62_ALPHABET_LENGTH;
    const alphabetIndex = Number(remainder);
    encodedValue = BASE62_ALPHABET[alphabetIndex] + encodedValue;
    remainingValue = remainingValue / BASE62_ALPHABET_LENGTH;
  }

  return encodedValue;
}

/**
 * Converts a base62 short code back into the numeric identifier it was
 * created from. This is used by internal tooling and tests to verify the
 * encode/decode round trip; the public redirect path looks codes up by their
 * string value directly and does not need to decode them.
 */
export function decodeBase62(shortCode: string): bigint {
  if (shortCode.length === 0) {
    throw new Error("A base62 short code cannot be an empty string.");
  }

  let decodedValue = 0n;

  for (const character of shortCode) {
    const characterValue = BASE62_CHARACTER_TO_VALUE.get(character);

    if (characterValue === undefined) {
      throw new Error(`The character "${character}" is not part of the base62 alphabet.`);
    }

    decodedValue = decodedValue * BASE62_ALPHABET_LENGTH + BigInt(characterValue);
  }

  return decodedValue;
}
