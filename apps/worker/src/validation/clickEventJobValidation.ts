import { z } from "zod";
import type { ClickEventJobPayloadV1 } from "@shared/contracts/clickEventJob";

// A queue payload is untrusted input from the worker's point of view, even
// though the API produced it: the queue is a boundary, per Rule C-05. This
// schema is checked before any enrichment work begins.
const clickEventJobPayloadSchema = z.object({
  eventVersion: z.literal(1),
  eventId: z.string().uuid(),
  linkId: z.string(),
  shortCode: z.string(),
  occurredAt: z.string(),
  referrer: z.string().nullable(),
  userAgent: z.string().nullable(),
  clientIpAddress: z.string().nullable(),
});

export class InvalidClickEventJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClickEventJobError";
  }
}

/**
 * Validates a raw BullMQ job payload against the versioned click-event
 * contract. An unrecognized event version or a missing required field
 * throws InvalidClickEventJobError, which the processor treats as a
 * permanent failure — retrying a malformed payload can never fix it.
 */
export function parseClickEventJobPayload(rawJobData: unknown): ClickEventJobPayloadV1 {
  const parseResult = clickEventJobPayloadSchema.safeParse(rawJobData);

  if (!parseResult.success) {
    throw new InvalidClickEventJobError(
      `Click event job payload failed validation: ${parseResult.error.message}`,
    );
  }

  return parseResult.data;
}
