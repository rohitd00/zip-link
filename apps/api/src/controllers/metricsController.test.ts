import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { MetricsController } from "./metricsController";

function buildFakeQueue(overrides: Partial<Queue> = {}): Queue {
  return {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getDelayedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getJobs: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as Queue;
}

function buildFakeResponse() {
  const response = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

describe("MetricsController", () => {
  it("reports queue depth counts and null oldest-job age when the queue is empty", async () => {
    const queue = buildFakeQueue();
    const controller = new MetricsController(queue);
    const response = buildFakeResponse();

    await controller.handleMetrics({} as never, response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      clickEventQueue: {
        waitingJobs: 0,
        activeJobs: 0,
        delayedJobs: 0,
        failedJobs: 0,
        completedJobs: 0,
        oldestWaitingJobAgeSeconds: null,
      },
    });
  });

  it("computes the oldest waiting job's age in seconds from its timestamp", async () => {
    const fiveSecondsAgo = Date.now() - 5000;
    const queue = buildFakeQueue({
      getWaitingCount: vi.fn().mockResolvedValue(3),
      getJobs: vi.fn().mockResolvedValue([{ timestamp: fiveSecondsAgo }]),
    });
    const controller = new MetricsController(queue);
    const response = buildFakeResponse();

    await controller.handleMetrics({} as never, response as never);

    const body = response.body as {
      clickEventQueue: { waitingJobs: number; oldestWaitingJobAgeSeconds: number | null };
    };
    expect(body.clickEventQueue.waitingJobs).toBe(3);
    expect(body.clickEventQueue.oldestWaitingJobAgeSeconds).toBeGreaterThanOrEqual(4);
    expect(body.clickEventQueue.oldestWaitingJobAgeSeconds).toBeLessThanOrEqual(10);
  });
});
