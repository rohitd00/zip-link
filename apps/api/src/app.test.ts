import type { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app";
import { createTestDatabasePool, truncateAllTestData } from "./testSupport/testDatabasePool";

let pool: Pool;
let app: ReturnType<typeof buildApiApp>;

beforeAll(() => {
  pool = createTestDatabasePool();
  app = buildApiApp({
    databasePool: pool,
    publicBaseUrl: "https://sho.rt",
    ownerCookieSecret: "test-owner-cookie-secret",
    isProductionEnvironment: false,
  });
});

afterEach(async () => {
  await truncateAllTestData(pool);
});

afterAll(async () => {
  await pool.end();
});

/**
 * Creates a link and returns both the response body and the signed
 * owner-context cookie the server set, so later requests in the same test
 * can act as the same owner.
 */
async function createLinkAndCaptureOwnerCookie(longUrl: string) {
  const response = await request(app).post("/api/links").send({ longUrl });
  const setCookieHeader = response.headers["set-cookie"] as unknown as string[];
  const ownerCookie = setCookieHeader[0];

  if (ownerCookie === undefined) {
    throw new Error("Expected the API to set an owner-context cookie on link creation.");
  }

  return { response, ownerCookie };
}

describe("POST /api/links", () => {
  it("creates a generated-code link and returns 201", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/articles/launch" });

    expect(response.status).toBe(201);
    expect(response.body.data.shortCode).toMatch(/^[0-9a-zA-Z]+$/);
    expect(response.body.data.longUrl).toBe("https://example.com/articles/launch");
    expect(response.body.data.wasExistingDuplicate).toBe(false);
  });

  it("creates a custom alias link using the exact requested alias", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/signup", customAlias: "join-now" });

    expect(response.status).toBe(201);
    expect(response.body.data.shortCode).toBe("join-now");
  });

  it("rejects an unsupported protocol with a 400 field error", async () => {
    const response = await request(app).post("/api/links").send({ longUrl: "javascript:alert(1)" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details[0].field).toBe("longUrl");
  });

  it("rejects a reserved custom alias", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/page", customAlias: "admin" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when the requested custom alias is already taken", async () => {
    await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/first", customAlias: "taken-alias" });

    const secondResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/second", customAlias: "taken-alias" });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error.code).toBe("ALIAS_UNAVAILABLE");
  });

  it("returns the existing link with 200 when the same owner submits a known duplicate", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie("https://example.com/repeat");

    const secondResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/repeat" });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data.wasExistingDuplicate).toBe(true);
  });

  it("does not treat a different owner's identical URL as a duplicate", async () => {
    await request(app).post("/api/links").send({ longUrl: "https://example.com/not-shared" });

    const secondOwnerResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/not-shared" });

    expect(secondOwnerResponse.status).toBe(201);
  });

  it("rejects a past expiry timestamp", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/page", expiresAt: "2000-01-01T00:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe("expiresAt");
  });
});

describe("GET /:code (public redirect)", () => {
  it("redirects an active link to its stored destination", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/target" });

    const shortCode = createResponse.body.data.shortCode;
    const redirectResponse = await request(app).get(`/${shortCode}`);

    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.location).toBe("https://example.com/target");
  });

  it("returns 404 for an unknown code", async () => {
    const response = await request(app).get("/does-not-exist");
    expect(response.status).toBe(404);
  });

  it("returns 404 JSON when the client explicitly requests JSON", async () => {
    const response = await request(app).get("/does-not-exist").set("Accept", "application/json");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 410 for an expired link and does not redirect", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie(
      "https://example.com/soon-expired",
    );
    // Directly craft a link that already expired, since the API itself
    // refuses to create one with a past expiry. This simulates the passage
    // of time for a link that used to be valid.
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({
        longUrl: "https://example.com/will-expire",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      });

    const shortCode = createResponse.body.data.shortCode;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const redirectResponse = await request(app).get(`/${shortCode}`);
    expect(redirectResponse.status).toBe(410);
  });

  it("returns 404 after the owner deletes the link", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie("https://example.com/to-delete");
    const createResponse = await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/deletion-target" });

    const shortCode = createResponse.body.data.shortCode;

    await request(app).delete(`/api/links/${shortCode}`).set("Cookie", ownerCookie).expect(204);

    const redirectResponse = await request(app).get(`/${shortCode}`);
    expect(redirectResponse.status).toBe(404);
  });
});

describe("GET /api/links", () => {
  it("lists only the requesting owner's links", async () => {
    const { ownerCookie } = await createLinkAndCaptureOwnerCookie("https://example.com/mine-1");
    await request(app)
      .post("/api/links")
      .set("Cookie", ownerCookie)
      .send({ longUrl: "https://example.com/mine-2" });
    await request(app).post("/api/links").send({ longUrl: "https://example.com/not-mine" });

    const response = await request(app).get("/api/links").set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });
});

describe("GET /api/links/:code and DELETE /api/links/:code ownership", () => {
  it("returns a generic 404 when reading another owner's link", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/private" });

    const response = await request(app).get(`/api/links/${createResponse.body.data.shortCode}`);

    expect(response.status).toBe(404);
  });

  it("returns a generic 404 when deleting another owner's link", async () => {
    const createResponse = await request(app)
      .post("/api/links")
      .send({ longUrl: "https://example.com/private-delete" });

    const response = await request(app).delete(`/api/links/${createResponse.body.data.shortCode}`);

    expect(response.status).toBe(404);
  });
});

describe("GET /health/live and /health/ready", () => {
  it("reports ok for both endpoints", async () => {
    const liveResponse = await request(app).get("/health/live");
    const readyResponse = await request(app).get("/health/ready");

    expect(liveResponse.status).toBe(200);
    expect(readyResponse.status).toBe(200);
  });
});
