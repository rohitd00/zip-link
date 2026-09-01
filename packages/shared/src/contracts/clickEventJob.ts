// This is the versioned payload published to the BullMQ "click-analytics"
// queue after a successful redirect. The redirect handler builds this value
// synchronously from request headers; it never performs user-agent parsing,
// GeoIP lookup, or database writes itself. See Section 10.1 of the
// technical specification.
export interface ClickEventJobPayloadV1 {
  eventVersion: 1;
  eventId: string;
  linkId: string;
  shortCode: string;
  occurredAt: string;
  referrer: string | null;
  userAgent: string | null;
  clientIpAddress: string | null;
}

export type ClickEventJobPayload = ClickEventJobPayloadV1;

export const CLICK_ANALYTICS_QUEUE_NAME = "click-analytics";
