// This is the fixed 62-character alphabet used for every generated short code.
// The character order matters: it determines which symbol represents which
// numeric remainder. Never reorder or shrink this alphabet after links have
// already been created, because every previously encoded code depends on it.
export const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const BASE62_ALPHABET_LENGTH = BigInt(BASE62_ALPHABET.length);

// A lookup map from character to its numeric value, built once, so that
// decoding a short code does not need to search through the alphabet string
// one character at a time for every symbol.
export const BASE62_CHARACTER_TO_VALUE: ReadonlyMap<string, number> = new Map(
  BASE62_ALPHABET.split("").map((character, index) => [character, index]),
);
