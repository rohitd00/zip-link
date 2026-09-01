import type { Pool } from "pg";

export type ParsedDeviceType = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export interface EnrichedClickEvent {
  eventId: string;
  linkId: string;
  shortCode: string;
  occurredAt: Date;
  referrer: string | null;
  referrerHost: string | null;
  deviceType: ParsedDeviceType;
  browserName: string | null;
  countryCode: string | null;
  countryName: string | null;
  cityName: string | null;
  ipHash: string | null;
  ipHashKeyVersion: string | null;
}

export type ClickEventInsertResult = "inserted" | "already_processed";

/**
 * Persists an enriched click event using the dedupe-claim-then-insert
 * pattern from database-schema.md Section 9.3, inside one transaction. If
 * the event ID has already been claimed by a prior attempt, this commits
 * immediately and reports "already_processed" instead of inserting a
 * second row — this is what makes a BullMQ retry after a crash safe.
 */
export class ClickEventRepository {
  constructor(private readonly databasePool: Pool) {}

  async insertClickEventIdempotently(event: EnrichedClickEvent): Promise<ClickEventInsertResult> {
    const client = await this.databasePool.connect();

    try {
      await client.query("BEGIN");

      const dedupeClaimResult = await client.query(
        `
          INSERT INTO analytics_event_deduplication (event_id, occurred_at, link_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (event_id) DO NOTHING;
        `,
        [event.eventId, event.occurredAt, event.linkId],
      );

      const wasAlreadyClaimed = dedupeClaimResult.rowCount === 0;

      if (wasAlreadyClaimed) {
        await client.query("COMMIT");
        return "already_processed";
      }

      await client.query(
        `
          INSERT INTO click_events (
            occurred_at,
            event_id,
            link_id,
            short_code,
            referrer,
            referrer_host,
            device_type,
            browser_name,
            country_code,
            country_name,
            city_name,
            ip_hash,
            ip_hash_key_version
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
        `,
        [
          event.occurredAt,
          event.eventId,
          event.linkId,
          event.shortCode,
          event.referrer,
          event.referrerHost,
          event.deviceType,
          event.browserName,
          event.countryCode,
          event.countryName,
          event.cityName,
          event.ipHash,
          event.ipHashKeyVersion,
        ],
      );

      await client.query(
        `UPDATE analytics_event_deduplication SET persisted_at = now() WHERE event_id = $1;`,
        [event.eventId],
      );

      await client.query("COMMIT");
      return "inserted";
    } catch (thrownError) {
      await client.query("ROLLBACK");
      throw thrownError;
    } finally {
      client.release();
    }
  }
}
