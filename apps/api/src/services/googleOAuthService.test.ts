import { describe, expect, it } from "vitest";
import { GoogleOAuthService } from "./googleOAuthService";

describe("GoogleOAuthService.buildAuthorizationUrl", () => {
  it("builds a Google authorization URL with the configured client ID, redirect URI, and state", () => {
    const service = new GoogleOAuthService(
      "test-client-id",
      "test-client-secret",
      "https://api.example.com/api/auth/google/callback",
    );

    const url = new URL(service.buildAuthorizationUrl("random-state-value"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.example.com/api/auth/google/callback",
    );
    expect(url.searchParams.get("state")).toBe("random-state-value");
    expect(url.searchParams.get("scope")).toContain("email");
  });
});
