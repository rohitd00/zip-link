import {
  CUSTOM_ALIAS_PATTERN,
  MAX_CUSTOM_ALIAS_LENGTH_CHARACTERS,
  MIN_CUSTOM_ALIAS_LENGTH_CHARACTERS,
} from "@shared/constants/validationLimits";
import { isReservedAliasWord } from "@shared/constants/reservedAliasWords";
import { ValidationError } from "./applicationErrors";

/**
 * Validates a custom alias submitted by a link owner. This only checks
 * format, length, and reserved words; whether the alias is already taken is
 * a separate database-uniqueness concern handled by the repository.
 */
export function validateCustomAliasFormat(rawCustomAlias: string): string {
  const trimmedAlias = rawCustomAlias.trim();

  if (trimmedAlias.length < MIN_CUSTOM_ALIAS_LENGTH_CHARACTERS) {
    throw new ValidationError("The custom alias is too short.", [
      {
        field: "customAlias",
        message: `Use at least ${MIN_CUSTOM_ALIAS_LENGTH_CHARACTERS} characters.`,
      },
    ]);
  }

  if (trimmedAlias.length > MAX_CUSTOM_ALIAS_LENGTH_CHARACTERS) {
    throw new ValidationError("The custom alias is too long.", [
      {
        field: "customAlias",
        message: `Use at most ${MAX_CUSTOM_ALIAS_LENGTH_CHARACTERS} characters.`,
      },
    ]);
  }

  if (!CUSTOM_ALIAS_PATTERN.test(trimmedAlias)) {
    throw new ValidationError("The custom alias contains characters that are not allowed.", [
      {
        field: "customAlias",
        message:
          "Use letters, numbers, hyphens, or underscores, and do not start with an underscore.",
      },
    ]);
  }

  if (isReservedAliasWord(trimmedAlias)) {
    throw new ValidationError("The custom alias is reserved by the application.", [
      { field: "customAlias", message: "Choose a different alias; that one is reserved." },
    ]);
  }

  return trimmedAlias;
}
