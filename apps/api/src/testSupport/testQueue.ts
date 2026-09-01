import { Queue } from "bullmq";
import type Redis from "ioredis";
import { CLICK_ANALYTICS_QUEUE_NAME } from "@shared/contracts/clickEventJob";
import { createQueueRedisConnection } from "../queue/queueRedisConnection";
import { createTestRedisConnectionString } from "./testRedisClient";

export interface TestClickEventQueue {
  queue: Queue;
  connection: Redis;
}

/**
 * Creates a click-analytics Queue connected to the isolated test Redis
 * database (REDIS_TEST_URL), with its own dedicated connection as BullMQ
 * requires. BullMQ does not close a connection it did not create itself,
 * so the caller must close both `queue` and `connection` during teardown.
 */
export function createTestClickEventQueue(): TestClickEventQueue {
  const connection = createQueueRedisConnection(createTestRedisConnectionString());
  const queue = new Queue(CLICK_ANALYTICS_QUEUE_NAME, { connection });

  return { queue, connection };
}
