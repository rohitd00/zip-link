import crypto from "node:crypto";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabasePool,
  insertTestLink,
  truncateAllTestData,
} from "../testSupport/testDatabasePool";
import { ClickEventRepository, type EnrichedClickEvent } from "./clickEventRepository";

let pool: Pool;
let repository: ClickEventRepository;

beforeAll(() => {
  pool = createTestDatabasePool();
  repository = new ClickEventRepository(pool);
});

afterEach(async () => {
  await truncateAllTestData(pool);
});

afterAll(async () => {
  await pool.end();
});

function buildEvent(
  overrides: Partial<EnrichedClickEvent> & { linkId: string; shortCode: string },
): EnrichedClickEvent {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date("2026-09-02T12:00:00.000Z"),
    referrer: null,
    referrerHost: null,
    deviceType: "desktop",
    browserName: "Chrome",
    countryCode: "US",
    countryName: "United States",
    cityName: null,
    ipHash: "deadbeef",
    ipHashKeyVersion: "v1",
    ...overrides,
  };
}

describe("ClickEventRepository", () => {
  it("inserts a new click event and reports it as inserted", async () => {
    const linkId = await insertTestLink(pool, "abc");
    const event = buildEvent({ linkId, shortCode: "abc" });

    const result = await repository.insertClickEventIdempotently(event);
    expect(result).toBe("inserted");

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      event.eventId,
    ]);
    expect(rowsResult.rows).toHaveLength(1);
    expect(rowsResult.rows[0].link_id).toBe(linkId);
  });

  it("does not insert a second row when the same event ID is processed again", async () => {
    const linkId = await insertTestLink(pool, "def");
    const event = buildEvent({ linkId, shortCode: "def" });

    const firstResult = await repository.insertClickEventIdempotently(event);
    const secondResult = await repository.insertClickEventIdempotently(event);

    expect(firstResult).toBe("inserted");
    expect(secondResult).toBe("already_processed");

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      event.eventId,
    ]);
    expect(rowsResult.rows).toHaveLength(1);
  });

  it("never stores a raw IP address, only a hash and key version", async () => {
    const linkId = await insertTestLink(pool, "ghi");
    const event = buildEvent({
      linkId,
      shortCode: "ghi",
      ipHash: "some-hash",
      ipHashKeyVersion: "v1",
    });

    await repository.insertClickEventIdempotently(event);

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      event.eventId,
    ]);
    const insertedRow = rowsResult.rows[0];

    expect(insertedRow.ip_hash).toBe("some-hash");
    expect(Object.keys(insertedRow)).not.toContain("ip_address");
    expect(Object.keys(insertedRow)).not.toContain("client_ip");
  });

  it("stores unknown/null enrichment fallback values without failing", async () => {
    const linkId = await insertTestLink(pool, "jkl");
    const event = buildEvent({
      linkId,
      shortCode: "jkl",
      browserName: null,
      countryCode: null,
      countryName: null,
      cityName: null,
      ipHash: null,
      ipHashKeyVersion: null,
    });

    const result = await repository.insertClickEventIdempotently(event);
    expect(result).toBe("inserted");

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      event.eventId,
    ]);
    expect(rowsResult.rows[0].device_type).toBe("desktop");
    expect(rowsResult.rows[0].country_code).toBeNull();
  });
});
