// Stable error codes returned in every API error response. Controllers map
// a thrown ApplicationError to an HTTP status using this code, so the same
// code always means the same thing to any API client.
export type ApplicationErrorCode =
  | "VALIDATION_ERROR"
  | "ALIAS_UNAVAILABLE"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "LINK_EXPIRED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApplicationErrorFieldDetail {
  field: string;
  message: string;
}

// This is the exact JSON shape of every error response body, matching
// Section 11 of the technical specification.
export interface ApplicationErrorResponseBody {
  error: {
    code: ApplicationErrorCode;
    message: string;
    details?: ApplicationErrorFieldDetail[];
    requestId: string;
  };
}
