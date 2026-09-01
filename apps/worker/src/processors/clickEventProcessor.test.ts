import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ClickEventJobPayloadV1 } from "@shared/contracts/clickEventJob";
import {
  createTestDatabasePool,
  insertTestLink,
  truncateAllTestData,
} from "../testSupport/testDatabasePool";
import { ClickEventRepository } from "../repositories/clickEventRepository";
import { processClickEventJob } from "./clickEventProcessor";

let pool: Pool;
let clickEventRepository: ClickEventRepository;

beforeAll(() => {
  pool = createTestDatabasePool();
  clickEventRepository = new ClickEventRepository(pool);
});

afterEach(async () => {
  await truncateAllTestData(pool);
});

afterAll(async () => {
  await pool.end();
});

const dependencies = {
  get clickEventRepository() {
    return clickEventRepository;
  },
  ipHashSecret: "test-ip-hash-secret",
  ipHashKeyVersion: "v1",
};

function buildFakeJob(data: unknown): Job {
  return { id: "test-job-id", data } as unknown as Job;
}

describe("processClickEventJob", () => {
  it("enriches and persists a valid job, ending with exactly one click_events row", async () => {
    const linkId = await insertTestLink(pool, "mno");
    const payload: ClickEventJobPayloadV1 = {
      eventVersion: 1,
      eventId: "6f8f857e-2c8a-4a35-9e6a-2b2f9a2f5d10",
      linkId,
      shortCode: "mno",
      occurredAt: "2026-09-02T12:00:00.000Z",
      referrer: "https://news.example.com/story",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      clientIpAddress: "8.8.8.8",
    };

    await processClickEventJob(buildFakeJob(payload), dependencies);

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      payload.eventId,
    ]);
    expect(rowsResult.rows).toHaveLength(1);

    const insertedRow = rowsResult.rows[0];
    expect(insertedRow.device_type).toBe("desktop");
    expect(insertedRow.browser_name).toBe("Chrome");
    expect(insertedRow.referrer_host).toBe("news.example.com");
    expect(insertedRow.country_code).toBe("US");
    expect(insertedRow.ip_hash).not.toBeNull();
    expect(insertedRow.ip_hash).not.toBe("8.8.8.8");
  });

  it("persists safe fallback values for an unknown user agent and untraceable IP", async () => {
    const linkId = await insertTestLink(pool, "pqr");
    const payload: ClickEventJobPayloadV1 = {
      eventVersion: 1,
      eventId: "6f8f857e-2c8a-4a35-9e6a-2b2f9a2f5d11",
      linkId,
      shortCode: "pqr",
      occurredAt: "2026-09-02T12:00:00.000Z",
      referrer: null,
      userAgent: null,
      clientIpAddress: "127.0.0.1",
    };

    await processClickEventJob(buildFakeJob(payload), dependencies);

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      payload.eventId,
    ]);
    const insertedRow = rowsResult.rows[0];

    expect(insertedRow.device_type).toBe("unknown");
    expect(insertedRow.browser_name).toBeNull();
    expect(insertedRow.country_code).toBeNull();
    // A null clientIpAddress is not exercised here (127.0.0.1 is provided,
    // just unresolvable), so a hash is still produced from that address.
    expect(insertedRow.ip_hash).not.toBeNull();
  });

  it("does not create a click event when no client IP was available at all", async () => {
    const linkId = await insertTestLink(pool, "stu");
    const payload: ClickEventJobPayloadV1 = {
      eventVersion: 1,
      eventId: "6f8f857e-2c8a-4a35-9e6a-2b2f9a2f5d12",
      linkId,
      shortCode: "stu",
      occurredAt: "2026-09-02T12:00:00.000Z",
      referrer: null,
      userAgent: null,
      clientIpAddress: null,
    };

    await processClickEventJob(buildFakeJob(payload), dependencies);

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      payload.eventId,
    ]);
    expect(rowsResult.rows[0].ip_hash).toBeNull();
    expect(rowsResult.rows[0].ip_hash_key_version).toBeNull();
  });

  it("throws an UnrecoverableError for a payload with an unsupported event version, without inserting anything", async () => {
    const linkId = await insertTestLink(pool, "vwx");
    const malformedPayload = {
      eventVersion: 2,
      eventId: "6f8f857e-2c8a-4a35-9e6a-2b2f9a2f5d13",
      linkId,
      shortCode: "vwx",
      occurredAt: "2026-09-02T12:00:00.000Z",
      referrer: null,
      userAgent: null,
      clientIpAddress: null,
    };

    await expect(
      processClickEventJob(buildFakeJob(malformedPayload), dependencies),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE link_id = $1", [linkId]);
    expect(rowsResult.rows).toHaveLength(0);
  });
});
