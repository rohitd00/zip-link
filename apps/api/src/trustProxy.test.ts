import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

// This is a small, standalone test of Express's own "trust proxy"
// contract rather than a test that goes through buildApiApp — the actual
// wiring in app.ts is a one-line `app.set("trust proxy", options.trustProxyHops)`,
// so what actually needs proving is that this setting behaves the way the
// rest of the codebase (and its comments) assumes: X-Forwarded-For is
// ignored by default, and only honored once explicitly told how many
// proxy hops to trust.
function buildAppWithTrustProxySetting(trustProxyHops: number) {
  const app = express();
  app.set("trust proxy", trustProxyHops);
  app.get("/whoami", (requestObject, response) => {
    response.json({ ip: requestObject.ip });
  });
  return app;
}

describe("Express trust proxy setting", () => {
  it("ignores a spoofed X-Forwarded-For header when no proxy is trusted (the default)", async () => {
    const app = buildAppWithTrustProxySetting(0);

    const response = await request(app).get("/whoami").set("X-Forwarded-For", "203.0.113.99");

    // Supertest talks to the app over a local loopback connection, so the
    // real (untrusted) socket address is a loopback address, never the
    // header value a caller could freely fake.
    expect(response.body.ip).not.toBe("203.0.113.99");
  });

  it("honors X-Forwarded-For once configured to trust one proxy hop", async () => {
    const app = buildAppWithTrustProxySetting(1);

    const response = await request(app).get("/whoami").set("X-Forwarded-For", "203.0.113.99");

    expect(response.body.ip).toBe("203.0.113.99");
  });
});
