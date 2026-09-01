import type {
  ApplicationErrorCode,
  ApplicationErrorFieldDetail,
} from "@shared/contracts/applicationError";

/**
 * The base type for every error a service is allowed to throw. A
 * controller catches this and maps it to an HTTP response using `code`; it
 * never needs to inspect the error message to decide the status code.
 */
export class ApplicationError extends Error {
  public readonly code: ApplicationErrorCode;
  public readonly details: ApplicationErrorFieldDetail[] | undefined;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    details?: ApplicationErrorFieldDetail[],
  ) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details: ApplicationErrorFieldDetail[]) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class AliasUnavailableError extends ApplicationError {
  constructor() {
    super("ALIAS_UNAVAILABLE", "That custom alias is already in use.", [
      { field: "customAlias", message: "That custom alias is already in use." },
    ]);
    this.name = "AliasUnavailableError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "The requested resource could not be found.") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class LinkExpiredError extends ApplicationError {
  constructor() {
    super("LINK_EXPIRED", "This link has expired.");
    this.name = "LinkExpiredError";
  }
}

export class ServiceUnavailableError extends ApplicationError {
  constructor(message = "The service is temporarily unavailable. Please try again shortly.") {
    super("SERVICE_UNAVAILABLE", message);
    this.name = "ServiceUnavailableError";
  }
}

export class RateLimitedError extends ApplicationError {
  public readonly retryAfterSeconds: number | undefined;

  constructor(message: string, retryAfterSeconds?: number) {
    super("RATE_LIMITED", message);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
