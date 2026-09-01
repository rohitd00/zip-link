import { UnrecoverableError, type Job } from "bullmq";
import { hashClientIpAddress } from "../enrichment/ipHasher";
import { lookupGeography } from "../enrichment/geoIpLookup";
import { normalizeReferrer } from "../enrichment/referrerNormalizer";
import { parseUserAgent } from "../enrichment/userAgentParser";
import { logger } from "../observability/logger";
import type { ClickEventRepository } from "../repositories/clickEventRepository";
import {
  InvalidClickEventJobError,
  parseClickEventJobPayload,
} from "../validation/clickEventJobValidation";

export interface ClickEventProcessorDependencies {
  clickEventRepository: ClickEventRepository;
  ipHashSecret: string;
  ipHashKeyVersion: string;
}

/**
 * Processes one click-analytics job: validates it, enriches it, and
 * persists it idempotently. This is the only place in the system that
 * parses a user agent, looks up geography, or writes to click_events —
 * the redirect path never does any of this itself, per Rule A-01.
 *
 * Error handling follows Rule A-05 / project-rules.md Section 10.2:
 * a malformed payload is a permanent failure (BullMQ's UnrecoverableError,
 * so it does not retry), while a database or Redis problem is transient
 * and is allowed to retry with the queue's configured backoff.
 */
export async function processClickEventJob(
  job: Job,
  dependencies: ClickEventProcessorDependencies,
): Promise<void> {
  const payload = parsePayloadOrFailPermanently(job);

  const { referrer, referrerHost } = normalizeReferrer(payload.referrer);
  const { deviceType, browserName } = parseUserAgent(payload.userAgent);
  const { countryCode, countryName, cityName } = lookupGeography(payload.clientIpAddress);

  const hashedIp =
    payload.clientIpAddress === null
      ? null
      : hashClientIpAddress(
          payload.clientIpAddress,
          dependencies.ipHashSecret,
          dependencies.ipHashKeyVersion,
        );

  const insertResult = await dependencies.clickEventRepository.insertClickEventIdempotently({
    eventId: payload.eventId,
    linkId: payload.linkId,
    shortCode: payload.shortCode,
    occurredAt: new Date(payload.occurredAt),
    referrer,
    referrerHost,
    deviceType,
    browserName,
    countryCode,
    countryName,
    cityName,
    ipHash: hashedIp === null ? null : hashedIp.ipHash,
    ipHashKeyVersion: hashedIp === null ? null : hashedIp.ipHashKeyVersion,
  });

  logger.info("Processed a click-analytics job.", {
    shortCode: payload.shortCode,
    eventId: payload.eventId,
    insertResult,
    deviceType,
    hasGeography: countryCode !== null,
  });
}

function parsePayloadOrFailPermanently(job: Job): ReturnType<typeof parseClickEventJobPayload> {
  try {
    return parseClickEventJobPayload(job.data);
  } catch (thrownError) {
    if (thrownError instanceof InvalidClickEventJobError) {
      logger.error("Discarding a click-analytics job with an invalid payload.", {
        jobId: job.id ?? "unknown",
        message: thrownError.message,
      });
      throw new UnrecoverableError(thrownError.message);
    }

    throw thrownError;
  }
}
