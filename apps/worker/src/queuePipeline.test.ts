import crypto from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import type { Pool } from "pg";
import type Redis from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CLICK_ANALYTICS_QUEUE_NAME,
  type ClickEventJobPayloadV1,
} from "@shared/contracts/clickEventJob";
import { processClickEventJob } from "./processors/clickEventProcessor";
import { ClickEventRepository } from "./repositories/clickEventRepository";
import {
  createTestDatabasePool,
  insertTestLink,
  truncateAllTestData,
} from "./testSupport/testDatabasePool";
import { createTestQueueRedisConnection } from "./testSupport/testRedisConnection";

// This test proves the full pipeline end to end: a real BullMQ queue, a
// real BullMQ worker running this project's actual processor, and a real
// PostgreSQL test database — not mocks. This is the "BullMQ producer/worker
// round trip and idempotent event insert" integration test required by
// the implementation plan's Phase 4 exit criteria.

let pool: Pool;
let clickEventRepository: ClickEventRepository;
let queueConnection: Redis;
let workerConnection: Redis;
let eventsConnection: Redis;
let queue: Queue;
let queueEvents: QueueEvents;
let worker: Worker;

beforeAll(async () => {
  pool = createTestDatabasePool();
  clickEventRepository = new ClickEventRepository(pool);

  queueConnection = createTestQueueRedisConnection();
  workerConnection = createTestQueueRedisConnection();
  eventsConnection = createTestQueueRedisConnection();

  queue = new Queue(CLICK_ANALYTICS_QUEUE_NAME, { connection: queueConnection });
  queueEvents = new QueueEvents(CLICK_ANALYTICS_QUEUE_NAME, { connection: eventsConnection });

  worker = new Worker(
    CLICK_ANALYTICS_QUEUE_NAME,
    (job) =>
      processClickEventJob(job, {
        clickEventRepository,
        ipHashSecret: "test-ip-hash-secret",
        ipHashKeyVersion: "v1",
      }),
    { connection: workerConnection, concurrency: 5 },
  );

  await worker.waitUntilReady();
  await queueEvents.waitUntilReady();
});

afterEach(async () => {
  await truncateAllTestData(pool);
});

afterAll(async () => {
  await worker.close();
  await queueEvents.close();
  await queue.close();
  await Promise.all([queueConnection.quit(), workerConnection.quit(), eventsConnection.quit()]);
  await pool.end();
});

function buildPayload(
  overrides: Partial<ClickEventJobPayloadV1> & { linkId: string; shortCode: string },
): ClickEventJobPayloadV1 {
  return {
    eventVersion: 1,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    referrer: null,
    userAgent: null,
    clientIpAddress: "8.8.8.8",
    ...overrides,
  };
}

describe("click-analytics queue pipeline", () => {
  it("publishes a job that the worker consumes and persists as exactly one click event", async () => {
    const linkId = await insertTestLink(pool, "queue-a");
    const payload = buildPayload({ linkId, shortCode: "queue-a" });

    const job = await queue.add("click", payload);
    await job.waitUntilFinished(queueEvents, 10000);

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      payload.eventId,
    ]);
    expect(rowsResult.rows).toHaveLength(1);
  }, 15000);

  it("does not create a duplicate row when the same event ID is delivered a second time", async () => {
    const linkId = await insertTestLink(pool, "queue-b");
    const payload = buildPayload({ linkId, shortCode: "queue-b" });

    const firstJob = await queue.add("click", payload);
    await firstJob.waitUntilFinished(queueEvents, 10000);

    const secondJob = await queue.add("click", payload);
    await secondJob.waitUntilFinished(queueEvents, 10000);

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE event_id = $1", [
      payload.eventId,
    ]);
    expect(rowsResult.rows).toHaveLength(1);
  }, 20000);

  it("fails a malformed job without retry rather than silently accepting it", async () => {
    const linkId = await insertTestLink(pool, "queue-c");
    const malformedPayload = {
      ...buildPayload({ linkId, shortCode: "queue-c" }),
      eventVersion: 99,
    };

    const job = await queue.add("click", malformedPayload, { attempts: 3 });

    await expect(job.waitUntilFinished(queueEvents, 10000)).rejects.toThrow();

    const rowsResult = await pool.query("SELECT * FROM click_events WHERE link_id = $1", [linkId]);
    expect(rowsResult.rows).toHaveLength(0);
  }, 15000);
});
