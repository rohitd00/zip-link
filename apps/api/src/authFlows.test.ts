import type { Redis } from "ioredis";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app";
import { createTestDatabasePool, truncateAllTestData } from "./testSupport/testDatabasePool";
import { clearTestCacheKeys, createTestRedisClient } from "./testSupport/testRedisClient";
import { createTestClickEventQueue, type TestClickEventQueue } from "./testSupport/testQueue";

let pool: Pool;
let redisClient: Redis;
let testQueue: TestClickEventQueue;
let app: ReturnType<typeof buildApiApp>;

beforeAll(() => {
  pool = createTestDatabasePool();
  redisClient = createTestRedisClient();
  testQueue = createTestClickEventQueue();
  app = buildApiApp({
    databasePool: pool,
    redisClient,
    clickEventQueue: testQueue.queue,
    publicBaseUrl: "https://sho.rt",
    ownerCookieSecret: "test-owner-cookie-secret",
    redirectCacheTtlSeconds: 86400,
    createRateLimitMaxRequests: 1000,
    createRateLimitWindowSeconds: 900,
    // Generous here too, for the same reason as app.test.ts: this file
    // exercises auth correctness, not the auth rate limiter specifically.
    authRateLimitMaxRequests: 1000,
    authRateLimitWindowSeconds: 900,
    isProductionEnvironment: false,
    trustProxyHops: 0,
    dashboardBaseUrl: "https://dashboard.test",
    googleOAuthClientId: null,
    googleOAuthClientSecret: null,
    resendApiKey: null,
    emailFromAddress: "ZipLink <test@ziplink.test>",
  });
});

afterEach(async () => {
  await truncateAllTestData(pool);
  await clearTestCacheKeys(redisClient);
});

afterAll(async () => {
  await pool.end();
  await redisClient.quit();
  await testQueue.queue.close();
  await testQueue.connection.quit();
});

function extractSessionCookie(response: request.Response): string {
  const setCookieHeader = response.headers["set-cookie"] as unknown as string[];
  const sessionCookie = setCookieHeader.find((cookie) => cookie.startsWith("session_id="));

  if (sessionCookie === undefined) {
    throw new Error("Expected a session_id cookie in the response but did not find one.");
  }

  return sessionCookie;
}

describe("POST /api/auth/signup", () => {
  it("creates an account, signs it in, and never returns the password hash", async () => {
    const response = await request(app).post("/api/auth/signup").send({
      email: "New.Person@Example.com",
      password: "a-strong-password",
      displayName: "New Person",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe("new.person@example.com");
    expect(response.body.data.user.displayName).toBe("New Person");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(extractSessionCookie(response)).toContain("HttpOnly");
  });

  it("rejects a second signup with the same email", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ email: "taken@example.com", password: "a-strong-password" });

    const secondResponse = await request(app)
      .post("/api/auth/signup")
      .send({ email: "taken@example.com", password: "a-different-password" });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error.code).toBe("EMAIL_ALREADY_IN_USE");
  });

  it("rejects a password that is too short", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({ email: "person@example.com", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login", () => {
  it("signs in with the correct email and password", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ email: "login-test@example.com", password: "correct-password" });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "login-test@example.com", password: "correct-password" });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("login-test@example.com");
  });

  it("rejects the wrong password with a generic message", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ email: "login-test-2@example.com", password: "correct-password" });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "login-test-2@example.com", password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an email that was never signed up, with the same generic message", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "never-signed-up@example.com", password: "whatever-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("returns null when no one is signed in", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.data.user).toBeNull();
  });

  it("returns the signed-in user's profile when a valid session cookie is sent", async () => {
    const signupResponse = await request(app)
      .post("/api/auth/signup")
      .send({ email: "me-test@example.com", password: "a-strong-password" });
    const sessionCookie = extractSessionCookie(signupResponse);

    const response = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);

    expect(response.body.data.user.email).toBe("me-test@example.com");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session so GET /api/auth/me no longer recognizes it", async () => {
    const signupResponse = await request(app)
      .post("/api/auth/signup")
      .send({ email: "logout-test@example.com", password: "a-strong-password" });
    const sessionCookie = extractSessionCookie(signupResponse);

    const meBeforeLogout = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    expect(meBeforeLogout.body.data.user).not.toBeNull();

    await request(app).post("/api/auth/logout").set("Cookie", sessionCookie);

    const meAfterLogout = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    expect(meAfterLogout.body.data.user).toBeNull();
  });
});

describe("Account isolation between two signed-in users", () => {
  it("keeps each signed-in user's links completely separate from the other's", async () => {
    const userASignup = await request(app)
      .post("/api/auth/signup")
      .send({ email: "user-a@example.com", password: "password-for-user-a" });
    const userACookie = extractSessionCookie(userASignup);

    const userBSignup = await request(app)
      .post("/api/auth/signup")
      .send({ email: "user-b@example.com", password: "password-for-user-b" });
    const userBCookie = extractSessionCookie(userBSignup);

    const userALinkResponse = await request(app)
      .post("/api/links")
      .set("Cookie", userACookie)
      .send({ longUrl: "https://example.com/user-a-page" });
    const userALinkCode = userALinkResponse.body.data.shortCode as string;

    await request(app)
      .post("/api/links")
      .set("Cookie", userBCookie)
      .send({ longUrl: "https://example.com/user-b-page" });

    // User A's list contains only their own link.
    const userALinksList = await request(app).get("/api/links").set("Cookie", userACookie);
    expect(userALinksList.body.data).toHaveLength(1);
    expect(userALinksList.body.data[0].longUrl).toBe("https://example.com/user-a-page");

    // User B's list contains only their own link.
    const userBLinksList = await request(app).get("/api/links").set("Cookie", userBCookie);
    expect(userBLinksList.body.data).toHaveLength(1);
    expect(userBLinksList.body.data[0].longUrl).toBe("https://example.com/user-b-page");

    // User B cannot read user A's link detail — a generic 404, not a
    // "forbidden" that would reveal the code belongs to someone else.
    const crossOwnerAttempt = await request(app)
      .get(`/api/links/${userALinkCode}`)
      .set("Cookie", userBCookie);
    expect(crossOwnerAttempt.status).toBe(404);
  });
});
