import type { AnalyticsResponseData } from "@shared/contracts/analytics";
import type { ApplicationErrorResponseBody } from "@shared/contracts/applicationError";
import type {
  AuthSuccessResponseData,
  CurrentUserResponseData,
  LoginRequestBody,
  RequestPasswordResetRequestBody,
  ResetPasswordRequestBody,
  SignupRequestBody,
} from "@shared/contracts/auth";
import type {
  CreateLinkRequestBody,
  CreateLinkResponseData,
  GetLinkDetailResponseData,
  ListLinksResponseData,
} from "@shared/contracts/linkRequests";

/**
 * A typed, application-level error thrown for any non-2xx API response.
 * Components can inspect `.code` to decide how to react (for example,
 * mapping VALIDATION_ERROR field details onto form fields) without ever
 * needing to know about fetch/Response objects.
 */
export class ApiRequestError extends Error {
  public readonly code: ApplicationErrorResponseBody["error"]["code"];
  public readonly details: ApplicationErrorResponseBody["error"]["details"];
  public readonly httpStatus: number;
  public readonly retryAfterSeconds: number | null;

  constructor(
    httpStatus: number,
    body: ApplicationErrorResponseBody,
    retryAfterSeconds: number | null,
  ) {
    super(body.error.message);
    this.name = "ApiRequestError";
    this.code = body.error.code;
    this.details = body.error.details;
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Thrown when the request could not reach the server at all (offline,
 * DNS failure, connection refused). Kept distinct from ApiRequestError so
 * the UI can show "check your connection" rather than a field-level error.
 */
export class NetworkUnavailableError extends Error {
  constructor() {
    super("Could not reach the server. Check your connection and try again.");
    this.name = "NetworkUnavailableError";
  }
}

async function sendJsonRequest<TResponseBody>(
  path: string,
  init: RequestInit,
): Promise<TResponseBody> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new NetworkUnavailableError();
  }

  if (response.status === 204) {
    return undefined as TResponseBody;
  }

  const responseBody = (await response.json()) as unknown;

  if (!response.ok) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds =
      retryAfterHeader === null ? null : Number.parseInt(retryAfterHeader, 10);

    throw new ApiRequestError(
      response.status,
      responseBody as ApplicationErrorResponseBody,
      retryAfterSeconds,
    );
  }

  return responseBody as TResponseBody;
}

export const apiClient = {
  createLink(requestBody: CreateLinkRequestBody): Promise<{ data: CreateLinkResponseData }> {
    return sendJsonRequest("/api/links", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  },

  listLinks(options: {
    cursor: string | null;
    query: string | null;
  }): Promise<ListLinksResponseData> {
    const searchParams = new URLSearchParams();

    if (options.cursor !== null) {
      searchParams.set("cursor", options.cursor);
    }

    if (options.query !== null && options.query.length > 0) {
      searchParams.set("query", options.query);
    }

    const queryString = searchParams.toString();
    const path = queryString.length > 0 ? `/api/links?${queryString}` : "/api/links";

    return sendJsonRequest(path, { method: "GET" });
  },

  getLinkDetail(shortCode: string): Promise<{ data: GetLinkDetailResponseData }> {
    return sendJsonRequest(`/api/links/${encodeURIComponent(shortCode)}`, { method: "GET" });
  },

  getLinkAnalytics(
    shortCode: string,
    range: { from: string; to: string },
  ): Promise<{ data: AnalyticsResponseData }> {
    const searchParams = new URLSearchParams({ from: range.from, to: range.to });
    return sendJsonRequest(
      `/api/links/${encodeURIComponent(shortCode)}/analytics?${searchParams.toString()}`,
      {
        method: "GET",
      },
    );
  },

  /**
   * Not fetched with JS — this is a plain URL for an <a> tag, so the
   * browser's own download handling (and the session cookie, sent
   * automatically on a same-origin navigation) takes care of the rest.
   */
  buildLinkAnalyticsExportUrl(shortCode: string, range: { from: string; to: string }): string {
    const searchParams = new URLSearchParams({ from: range.from, to: range.to });
    return `/api/links/${encodeURIComponent(shortCode)}/analytics/export?${searchParams.toString()}`;
  },

  deleteLink(shortCode: string): Promise<void> {
    return sendJsonRequest(`/api/links/${encodeURIComponent(shortCode)}`, {
      method: "DELETE",
    });
  },

  getCurrentUser(): Promise<{ data: CurrentUserResponseData }> {
    return sendJsonRequest("/api/auth/me", { method: "GET" });
  },

  signup(requestBody: SignupRequestBody): Promise<{ data: AuthSuccessResponseData }> {
    return sendJsonRequest("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  },

  login(requestBody: LoginRequestBody): Promise<{ data: AuthSuccessResponseData }> {
    return sendJsonRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  },

  logout(): Promise<void> {
    return sendJsonRequest("/api/auth/logout", { method: "POST" });
  },

  requestPasswordReset(requestBody: RequestPasswordResetRequestBody): Promise<void> {
    return sendJsonRequest("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  },

  resetPassword(requestBody: ResetPasswordRequestBody): Promise<void> {
    return sendJsonRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  },
};

/** Absolute path the browser should navigate to for "Continue with Google". */
export const GOOGLE_SIGN_IN_URL = "/api/auth/google";
