import type { Pool } from "pg";
import type { OwnerContext } from "@shared/contracts/ownerContext";
import type { LinkDatabaseRow } from "@shared/contracts/link";

export interface CreateGeneratedLinkInput {
  shortCode: string;
  longUrl: string;
  normalizedLongUrl: string;
  ownerContext: OwnerContext;
  expiresAt: Date | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface CreateCustomAliasLinkInput {
  shortCode: string;
  longUrl: string;
  normalizedLongUrl: string;
  ownerContext: OwnerContext;
  expiresAt: Date | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface ListOwnedLinksOptions {
  ownerContext: OwnerContext;
  searchText: string | null;
  limit: number;
  cursorCreatedAt: Date | null;
  cursorId: string | null;
}

/**
 * Encapsulates every SQL statement used to read and write `links` rows.
 * Every query here is parameterized; no caller-supplied value is ever
 * concatenated into a query string.
 */
export class LinkRepository {
  constructor(private readonly databasePool: Pool) {}

  /**
   * Allocates the next identity value first, so the caller can encode the
   * short code from a known id before any row exists. This is the
   * recommended two-step approach from database-schema.md Section 13.1 for
   * callers that need to know the id ahead of insertion.
   */
  async allocateNextLinkId(): Promise<bigint> {
    const queryResult = await this.databasePool.query<{ next_id: string }>(
      `SELECT nextval(pg_get_serial_sequence('links', 'id')) AS next_id;`,
    );

    const firstRow = queryResult.rows[0];

    if (firstRow === undefined) {
      throw new Error("Could not allocate the next link identifier.");
    }

    return BigInt(firstRow.next_id);
  }

  /**
   * Inserts a generated-code link using an identifier that was already
   * allocated by allocateNextLinkId, so the short code can be computed from
   * a known id before the row is written.
   */
  async insertGeneratedLinkWithKnownId(
    linkId: bigint,
    input: CreateGeneratedLinkInput,
  ): Promise<LinkDatabaseRow> {
    const queryResult = await this.databasePool.query(
      `
        INSERT INTO links (
          id,
          short_code,
          long_url,
          normalized_long_url,
          owner_type,
          owner_id,
          expires_at,
          is_custom_alias,
          utm_source,
          utm_medium,
          utm_campaign
        )
        OVERRIDING SYSTEM VALUE
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10)
        RETURNING *;
      `,
      [
        linkId.toString(),
        input.shortCode,
        input.longUrl,
        input.normalizedLongUrl,
        input.ownerContext.ownerType,
        input.ownerContext.ownerId,
        input.expiresAt,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
      ],
    );

    return mapDatabaseRowToLinkRecord(queryResult.rows[0]);
  }

  /**
   * Inserts a custom-alias link. A unique-constraint violation on
   * short_code is expected to be caught by the caller and mapped to an
   * AliasUnavailableError; this method does not swallow that error.
   */
  async createCustomAliasLink(input: CreateCustomAliasLinkInput): Promise<LinkDatabaseRow> {
    const queryResult = await this.databasePool.query(
      `
        INSERT INTO links (
          short_code,
          long_url,
          normalized_long_url,
          owner_type,
          owner_id,
          expires_at,
          is_custom_alias,
          utm_source,
          utm_medium,
          utm_campaign
        )
        VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9)
        RETURNING *;
      `,
      [
        input.shortCode,
        input.longUrl,
        input.normalizedLongUrl,
        input.ownerContext.ownerType,
        input.ownerContext.ownerId,
        input.expiresAt,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
      ],
    );

    return mapDatabaseRowToLinkRecord(queryResult.rows[0]);
  }

  /**
   * Finds the most recently created active link owned by ownerContext that
   * points at the same normalized destination URL. Used for duplicate
   * detection when the owner did not request a specific custom alias.
   */
  async findActiveDuplicateByOwnerAndNormalizedUrl(
    ownerContext: OwnerContext,
    normalizedLongUrl: string,
  ): Promise<LinkDatabaseRow | null> {
    const queryResult = await this.databasePool.query(
      `
        SELECT *
        FROM links
        WHERE owner_type = $1
          AND owner_id = $2
          AND normalized_long_url = $3
          AND deleted_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC, id DESC
        LIMIT 1;
      `,
      [ownerContext.ownerType, ownerContext.ownerId, normalizedLongUrl],
    );

    const firstRow = queryResult.rows[0];

    if (firstRow === undefined) {
      return null;
    }

    return mapDatabaseRowToLinkRecord(firstRow);
  }

  /**
   * Returns one page of the owner's active links, newest first. Uses
   * keyset pagination on (created_at, id) rather than an OFFSET, so paging
   * through a large list stays fast.
   */
  async listOwnedActiveLinks(options: ListOwnedLinksOptions): Promise<LinkDatabaseRow[]> {
    const hasCursor = options.cursorCreatedAt !== null && options.cursorId !== null;

    const queryResult = await this.databasePool.query(
      `
        SELECT *
        FROM links
        WHERE owner_type = $1
          AND owner_id = $2
          AND deleted_at IS NULL
          AND (
            $3::text IS NULL
            OR short_code ILIKE '%' || $3 || '%'
            OR long_url ILIKE '%' || $3 || '%'
          )
          AND (
            $4::boolean IS NOT TRUE
            OR (created_at, id) < ($5::timestamptz, $6::bigint)
          )
        ORDER BY created_at DESC, id DESC
        LIMIT $7;
      `,
      [
        options.ownerContext.ownerType,
        options.ownerContext.ownerId,
        options.searchText,
        hasCursor,
        options.cursorCreatedAt,
        options.cursorId,
        options.limit,
      ],
    );

    return queryResult.rows.map(mapDatabaseRowToLinkRecord);
  }

  /**
   * Looks up a link by its public short code for the public redirect path.
   * Deleted links are excluded; expired links are intentionally still
   * returned so the caller can distinguish "expired" from "unknown".
   */
  async findPublicLinkByShortCode(shortCode: string): Promise<LinkDatabaseRow | null> {
    const queryResult = await this.databasePool.query(
      `
        SELECT *
        FROM links
        WHERE short_code = $1
          AND deleted_at IS NULL
        LIMIT 1;
      `,
      [shortCode],
    );

    const firstRow = queryResult.rows[0];

    if (firstRow === undefined) {
      return null;
    }

    return mapDatabaseRowToLinkRecord(firstRow);
  }

  /**
   * Looks up a link by short code, scoped to the owner making the request.
   * Returns null both when the code does not exist and when it belongs to
   * a different owner, so callers can return one generic "not found"
   * response without distinguishing the two cases.
   */
  async findOwnedLinkByShortCode(
    ownerContext: OwnerContext,
    shortCode: string,
  ): Promise<LinkDatabaseRow | null> {
    const queryResult = await this.databasePool.query(
      `
        SELECT *
        FROM links
        WHERE short_code = $1
          AND owner_type = $2
          AND owner_id = $3
          AND deleted_at IS NULL
        LIMIT 1;
      `,
      [shortCode, ownerContext.ownerType, ownerContext.ownerId],
    );

    const firstRow = queryResult.rows[0];

    if (firstRow === undefined) {
      return null;
    }

    return mapDatabaseRowToLinkRecord(firstRow);
  }

  /**
   * Soft-deletes a link owned by ownerContext. Returns null if no matching
   * active owned row existed, which the caller treats as "not found" rather
   * than an error.
   */
  async softDeleteOwnedLink(
    ownerContext: OwnerContext,
    shortCode: string,
  ): Promise<LinkDatabaseRow | null> {
    const queryResult = await this.databasePool.query(
      `
        UPDATE links
        SET deleted_at = now()
        WHERE short_code = $1
          AND owner_type = $2
          AND owner_id = $3
          AND deleted_at IS NULL
        RETURNING *;
      `,
      [shortCode, ownerContext.ownerType, ownerContext.ownerId],
    );

    const firstRow = queryResult.rows[0];

    if (firstRow === undefined) {
      return null;
    }

    return mapDatabaseRowToLinkRecord(firstRow);
  }

  /**
   * Returns the total number of click_events rows recorded for a link.
   * This is a simple count used by the dashboard list in Release 1; the
   * implementation plan notes this should move to a maintained totals table
   * or rollups once list size makes a per-row count expensive.
   */
  async countClicksForLink(linkId: string): Promise<number> {
    const queryResult = await this.databasePool.query<{ total_click_count: string }>(
      `SELECT count(*) AS total_click_count FROM click_events WHERE link_id = $1;`,
      [linkId],
    );

    const firstRow = queryResult.rows[0];

    if (firstRow === undefined) {
      return 0;
    }

    return Number.parseInt(firstRow.total_click_count, 10);
  }
}

// The pg driver returns snake_case column names as plain untyped rows. This
// function is the one place that converts those raw rows into the shared
// LinkDatabaseRow shape, so every repository method returns the same,
// already-typed object.
function mapDatabaseRowToLinkRecord(rawRow: Record<string, unknown>): LinkDatabaseRow {
  return {
    id: String(rawRow.id),
    shortCode: String(rawRow.short_code),
    longUrl: String(rawRow.long_url),
    normalizedLongUrl: String(rawRow.normalized_long_url),
    ownerType: rawRow.owner_type as LinkDatabaseRow["ownerType"],
    ownerId: String(rawRow.owner_id),
    redirectStatusCode: Number(rawRow.redirect_status_code),
    createdAt: rawRow.created_at as Date,
    updatedAt: rawRow.updated_at as Date,
    expiresAt: rawRow.expires_at as Date | null,
    deletedAt: rawRow.deleted_at as Date | null,
    isCustomAlias: Boolean(rawRow.is_custom_alias),
    utmSource: rawRow.utm_source as string | null,
    utmMedium: rawRow.utm_medium as string | null,
    utmCampaign: rawRow.utm_campaign as string | null,
  };
}
