import { Queue } from "bullmq";
import type Redis from "ioredis";
import { CLICK_ANALYTICS_QUEUE_NAME } from "@shared/contracts/clickEventJob";

// See technical-specification.md Section 10.2 for the rationale behind
// each of these values.
const JOB_ATTEMPTS = 5;
const BACKOFF_INITIAL_DELAY_MILLISECONDS = 1000;
const COMPLETED_JOB_RETENTION = { count: 1000, age: 60 * 60 * 24 }; // 1 day
const FAILED_JOB_RETENTION = { count: 5000, age: 60 * 60 * 24 * 7 }; // 7 days

/**
 * Creates the click-analytics BullMQ queue used to publish jobs. The
 * worker process creates its own separate Worker instance pointed at the
 * same queue name; they never share a connection object.
 */
export function createClickEventQueue(redisConnection: Redis): Queue {
  return new Queue(CLICK_ANALYTICS_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: JOB_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: BACKOFF_INITIAL_DELAY_MILLISECONDS,
      },
      removeOnComplete: COMPLETED_JOB_RETENTION,
      removeOnFail: FAILED_JOB_RETENTION,
    },
  });
}
