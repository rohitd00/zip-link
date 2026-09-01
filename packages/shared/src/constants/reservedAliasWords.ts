// These words cannot be used as a custom alias because they collide with
// real application routes or common system paths. The check is case
// insensitive, so "API" and "api" are both rejected.
export const RESERVED_ALIAS_WORDS: ReadonlyArray<string> = [
  "api",
  "health",
  "metrics",
  "assets",
  "favicon.ico",
  "robots.txt",
  "admin",
  "login",
  "logout",
  "signup",
  "register",
  "links",
  "analytics",
  "docs",
];

const RESERVED_ALIAS_WORDS_LOWERCASE: ReadonlySet<string> = new Set(
  RESERVED_ALIAS_WORDS.map((word) => word.toLowerCase()),
);

export function isReservedAliasWord(candidateAlias: string): boolean {
  return RESERVED_ALIAS_WORDS_LOWERCASE.has(candidateAlias.toLowerCase());
}
