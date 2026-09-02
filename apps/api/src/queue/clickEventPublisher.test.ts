import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { ClickEventPublisher } from "./clickEventPublisher";

const sampleInput = {
  linkId: "1",
  shortCode: "abc",
  occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  referrer: null,
  userAgent: null,
  clientIpAddress: "203.0.113.5",
};

function buildFakeQueue(overrides: Partial<Queue> = {}): Queue {
  return {
    add: vi.fn(),
    ...overrides,
  } as unknown as Queue;
}

describe("ClickEventPublisher", () => {
  it("returns published when the queue accepts the job", async () => {
    const queue = buildFakeQueue({ add: vi.fn().mockResolvedValue(undefined) });
    const publisher = new ClickEventPublisher(queue);

    const outcome = await publisher.publish(sampleInput);

    expect(outcome).toBe("published");
  });

  it("returns failed instead of throwing when the queue rejects the publish", async () => {
    const queue = buildFakeQueue({
      add: vi.fn().mockRejectedValue(new Error("queue unavailable")),
    });
    const publisher = new ClickEventPublisher(queue);

    const outcome = await publisher.publish(sampleInput);

    expect(outcome).toBe("failed");
  });

  it("returns failed instead of hanging when the queue never responds", async () => {
    const queue = buildFakeQueue({
      add: vi.fn().mockImplementation(() => new Promise(() => {})),
    });
    const publisher = new ClickEventPublisher(queue);

    const outcome = await publisher.publish(sampleInput);

    expect(outcome).toBe("failed");
  });

  it("never sends the raw client IP address as a job field name a logger could accidentally echo, and bounds referrer/user-agent length", async () => {
    let publishedJobPayload: unknown;
    const queue = buildFakeQueue({
      add: vi.fn().mockImplementation((_name: string, payload: unknown) => {
        publishedJobPayload = payload;
        return Promise.resolve(undefined);
      }),
    });
    const publisher = new ClickEventPublisher(queue);

    await publisher.publish({
      ...sampleInput,
      referrer: "a".repeat(5000),
      userAgent: "b".repeat(5000),
    });

    const payload = publishedJobPayload as {
      clientIpAddress: string | null;
      referrer: string | null;
      userAgent: string | null;
    };
    expect(payload.clientIpAddress).toBe("203.0.113.5");
    expect(payload.referrer?.length).toBeLessThan(5000);
    expect(payload.userAgent?.length).toBeLessThan(5000);
  });
});
