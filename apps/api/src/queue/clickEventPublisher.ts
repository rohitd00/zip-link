import crypto from "node:crypto";
import type { Queue } from "bullmq";
import {
  MAX_REFERRER_STORED_LENGTH_CHARACTERS,
  MAX_USER_AGENT_INPUT_LENGTH_CHARACTERS,
} from "@shared/constants/validationLimits";
import type { ClickEventJobPayloadV1 } from "@shared/contracts/clickEventJob";
import { logger } from "../observability/logger";
import { runWithTimeout } from "../utils/runWithTimeout";

const PUBLISH_TIMEOUT_MILLISECONDS = 500;

export interface ClickEventPublishInput {
  linkId: string;
  shortCode: string;
  occurredAt: Date;
  referrer: string | null;
  userAgent: string | null;
  clientIpAddress: string | null;
}

export type ClickEventPublishOutcome = "published" | "failed";

/**
 * Builds and publishes a click-analytics job after a successful redirect.
 * This is the only place in the redirect path that touches BullMQ; it
 * never parses the user agent, looks up geography, or writes a click row
 * itself — that is exclusively the worker's job, per Rule A-01.
 *
 * A publish attempt is bounded to a small timeout budget. Whether it
 * succeeds, fails, or times out, this method never throws: the redirect
 * response must go out regardless, per Rule R-04.
 */
export class ClickEventPublisher {
  constructor(private readonly clickEventQueue: Queue) {}

  async publish(input: ClickEventPublishInput): Promise<ClickEventPublishOutcome> {
    const payload: ClickEventJobPayloadV1 = {
      eventVersion: 1,
      eventId: crypto.randomUUID(),
      linkId: input.linkId,
      shortCode: input.shortCode,
      occurredAt: input.occurredAt.toISOString(),
      referrer: boundString(input.referrer, MAX_REFERRER_STORED_LENGTH_CHARACTERS),
      userAgent: boundString(input.userAgent, MAX_USER_AGENT_INPUT_LENGTH_CHARACTERS),
      clientIpAddress: input.clientIpAddress,
    };

    try {
      await runWithTimeout(
        this.clickEventQueue.add("click", payload),
        PUBLISH_TIMEOUT_MILLISECONDS,
      );
      return "published";
    } catch (thrownError) {
      logger.error(
        "Failed to publish a click-analytics event. The redirect itself is unaffected; this click will not appear in analytics.",
        {
          shortCode: input.shortCode,
          errorMessage: thrownError instanceof Error ? thrownError.message : "Unknown error",
        },
      );
      return "failed";
    }
  }
}

function boundString(value: string | null, maxLength: number): string | null {
  if (value === null) {
    return null;
  }

  return value.slice(0, maxLength);
}
