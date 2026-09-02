import type { Pool } from "pg";
import type { AnalyticsBucket } from "../domain/analyticsBucketSelection";

export interface AnalyticsTimeRange {
  linkId: string;
  from: Date;
  to: Date;
}

export interface TimelinePoint {
  bucketStart: Date;
  clickCount: number;
}

export interface NamedCount {
  name: string;
  clickCount: number;
}

export interface GeographyCount {
  countryCode: string | null;
  countryName: string | null;
  cityName: string | null;
  clickCount: number;
}

const TOP_BREAKDOWN_ROW_LIMIT = 10;

/**
 * Every query here is scoped to one link and one time range, using the
 * (link_id, occurred_at) index on each monthly click_events partition, per
 * Rule DB-06. None of these queries ever interpolates the bucket unit or
 * any other value into the SQL string — the bucket is passed as an
 * ordinary bound parameter, since PostgreSQL's date_trunc accepts its unit
 * argument as a normal text value.
 */
export class AnalyticsRepository {
  constructor(private readonly databasePool: Pool) {}

  async getTotalClickCount(range: AnalyticsTimeRange): Promise<number> {
    const result = await this.databasePool.query<{ total_click_count: string }>(
      `
        SELECT count(*) AS total_click_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3;
      `,
      [range.linkId, range.from, range.to],
    );

    return Number.parseInt(result.rows[0]?.total_click_count ?? "0", 10);
  }

  /**
   * Distinct visitor count, approximated by distinct ip_hash values (the
   * same HMAC-hashed IP already stored for privacy — see ipHasher.ts). A
   * click recorded with no IP at all (ip_hash IS NULL) cannot contribute to
   * this count; it still counts toward getTotalClickCount above.
   */
  async getUniqueVisitorCount(range: AnalyticsTimeRange): Promise<number> {
    const result = await this.databasePool.query<{ unique_visitor_count: string }>(
      `
        SELECT count(DISTINCT ip_hash) AS unique_visitor_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3
          AND ip_hash IS NOT NULL;
      `,
      [range.linkId, range.from, range.to],
    );

    return Number.parseInt(result.rows[0]?.unique_visitor_count ?? "0", 10);
  }

  async getTimeline(
    range: AnalyticsTimeRange,
    bucket: AnalyticsBucket,
    timezone: string,
  ): Promise<TimelinePoint[]> {
    // date_trunc alone truncates in the database session's local timezone,
    // not UTC. Converting to the requested zone, truncating, and
    // converting back (the pattern from database-schema.md Section 14.2)
    // produces bucket boundaries anchored to that zone regardless of the
    // session's own timezone setting.
    const result = await this.databasePool.query<{ bucket_start: Date; click_count: string }>(
      `
        SELECT
          date_trunc($4, occurred_at AT TIME ZONE $5) AT TIME ZONE $5 AS bucket_start,
          count(*) AS click_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3
        GROUP BY bucket_start
        ORDER BY bucket_start ASC;
      `,
      [range.linkId, range.from, range.to, bucket, timezone],
    );

    return result.rows.map((row) => ({
      bucketStart: row.bucket_start,
      clickCount: Number.parseInt(row.click_count, 10),
    }));
  }

  async getTopReferrers(range: AnalyticsTimeRange): Promise<NamedCount[]> {
    const result = await this.databasePool.query<{ name: string; click_count: string }>(
      `
        SELECT
          COALESCE(referrer_host, 'Direct / unknown') AS name,
          count(*) AS click_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3
        GROUP BY referrer_host
        ORDER BY click_count DESC, name ASC
        LIMIT $4;
      `,
      [range.linkId, range.from, range.to, TOP_BREAKDOWN_ROW_LIMIT],
    );

    return mapNamedCountRows(result.rows);
  }

  async getDeviceBreakdown(range: AnalyticsTimeRange): Promise<NamedCount[]> {
    const result = await this.databasePool.query<{ name: string; click_count: string }>(
      `
        SELECT
          device_type::text AS name,
          count(*) AS click_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3
        GROUP BY device_type
        ORDER BY click_count DESC, name ASC
        LIMIT $4;
      `,
      [range.linkId, range.from, range.to, TOP_BREAKDOWN_ROW_LIMIT],
    );

    return mapNamedCountRows(result.rows);
  }

  async getBrowserBreakdown(range: AnalyticsTimeRange): Promise<NamedCount[]> {
    const result = await this.databasePool.query<{ name: string; click_count: string }>(
      `
        SELECT
          COALESCE(browser_name, 'Unknown') AS name,
          count(*) AS click_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3
        GROUP BY browser_name
        ORDER BY click_count DESC, name ASC
        LIMIT $4;
      `,
      [range.linkId, range.from, range.to, TOP_BREAKDOWN_ROW_LIMIT],
    );

    return mapNamedCountRows(result.rows);
  }

  async getOperatingSystemBreakdown(range: AnalyticsTimeRange): Promise<NamedCount[]> {
    const result = await this.databasePool.query<{ name: string; click_count: string }>(
      `
        SELECT
          COALESCE(os_name, 'Unknown') AS name,
          count(*) AS click_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3
        GROUP BY os_name
        ORDER BY click_count DESC, name ASC
        LIMIT $4;
      `,
      [range.linkId, range.from, range.to, TOP_BREAKDOWN_ROW_LIMIT],
    );

    return mapNamedCountRows(result.rows);
  }

  async getGeographyBreakdown(range: AnalyticsTimeRange): Promise<GeographyCount[]> {
    const result = await this.databasePool.query<{
      country_code: string | null;
      country_name: string | null;
      city_name: string | null;
      click_count: string;
    }>(
      `
        SELECT
          country_code,
          country_name,
          city_name,
          count(*) AS click_count
        FROM click_events
        WHERE link_id = $1
          AND occurred_at >= $2
          AND occurred_at < $3
        GROUP BY country_code, country_name, city_name
        ORDER BY click_count DESC;
      `,
      [range.linkId, range.from, range.to],
    );

    return result.rows.map((row) => ({
      countryCode: row.country_code,
      countryName: row.country_name,
      cityName: row.city_name,
      clickCount: Number.parseInt(row.click_count, 10),
    }));
  }
}

function mapNamedCountRows(rows: Array<{ name: string; click_count: string }>): NamedCount[] {
  return rows.map((row) => ({
    name: row.name,
    clickCount: Number.parseInt(row.click_count, 10),
  }));
}
