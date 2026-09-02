import {
  MAX_DISPLAY_NAME_LENGTH_CHARACTERS,
  MAX_EMAIL_LENGTH_CHARACTERS,
  MAX_PASSWORD_LENGTH_CHARACTERS,
  MIN_PASSWORD_LENGTH_CHARACTERS,
} from "@shared/constants/validationLimits";
import { ValidationError } from "./applicationErrors";

// A deliberately simple email shape check: one "@", something on each
// side, no whitespace. This project does not attempt to fully validate
// email addresses against the RFC grammar (very few real systems do
// correctly) — the only thing that actually confirms an email address is
// real and reachable is successfully delivering mail to it, which the
// welcome/verification email already does downstream of this check.
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates and normalizes a submitted email address. Normalization
 * (trim + lowercase) happens here so "Person@Example.com" and
 * "person@example.com" are treated as the same account everywhere — at
 * signup, login, and the unique constraint on users.email.
 */
export function validateAndNormalizeEmail(rawEmail: string): string {
  const trimmedEmail = rawEmail.trim().toLowerCase();

  if (trimmedEmail.length === 0) {
    throw new ValidationError("Enter an email address.", [
      { field: "email", message: "Enter an email address." },
    ]);
  }

  if (trimmedEmail.length > MAX_EMAIL_LENGTH_CHARACTERS) {
    throw new ValidationError("That email address is too long.", [
      {
        field: "email",
        message: `Use at most ${MAX_EMAIL_LENGTH_CHARACTERS} characters.`,
      },
    ]);
  }

  if (!SIMPLE_EMAIL_PATTERN.test(trimmedEmail)) {
    throw new ValidationError("Enter a valid email address.", [
      { field: "email", message: "Enter a valid email address, like you@example.com." },
    ]);
  }

  return trimmedEmail;
}

/**
 * Validates a submitted password's length only. Deliberately does not
 * require a mix of character classes (uppercase/number/symbol) — that
 * kind of rule tends to push people toward predictable substitutions
 * ("Password1!") rather than genuinely stronger passwords, and length is
 * the dominant factor in how long a hash actually takes to brute-force.
 */
export function validatePasswordFormat(rawPassword: string): string {
  if (rawPassword.length < MIN_PASSWORD_LENGTH_CHARACTERS) {
    throw new ValidationError("The password is too short.", [
      {
        field: "password",
        message: `Use at least ${MIN_PASSWORD_LENGTH_CHARACTERS} characters.`,
      },
    ]);
  }

  if (rawPassword.length > MAX_PASSWORD_LENGTH_CHARACTERS) {
    throw new ValidationError("The password is too long.", [
      {
        field: "password",
        message: `Use at most ${MAX_PASSWORD_LENGTH_CHARACTERS} characters.`,
      },
    ]);
  }

  return rawPassword;
}

/**
 * Validates an optional display name. An empty/whitespace-only value is
 * treated as "not provided" rather than an error, since this field is
 * optional at signup.
 */
export function validateAndNormalizeDisplayName(rawDisplayName: string | undefined): string | null {
  if (rawDisplayName === undefined) {
    return null;
  }

  const trimmedDisplayName = rawDisplayName.trim();

  if (trimmedDisplayName.length === 0) {
    return null;
  }

  if (trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH_CHARACTERS) {
    throw new ValidationError("That name is too long.", [
      {
        field: "displayName",
        message: `Use at most ${MAX_DISPLAY_NAME_LENGTH_CHARACTERS} characters.`,
      },
    ]);
  }

  return trimmedDisplayName;
}
