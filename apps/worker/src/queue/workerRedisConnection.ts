import Redis from "ioredis";

/**
 * The BullMQ Worker needs its own dedicated Redis connection, and — like
 * the queue producer's connection — it must use
 * `maxRetriesPerRequest: null` because BullMQ issues long-running blocking
 * commands to wait for new jobs.
 */
export function createWorkerRedisConnection(redisConnectionString: string): Redis {
  return new Redis(redisConnectionString, {
    maxRetriesPerRequest: null,
  });
}
