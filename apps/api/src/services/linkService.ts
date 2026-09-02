import { encodeBase62 } from "@shared/base62/base62";
import {
  DEFAULT_LINK_LIST_PAGE_SIZE,
  MAX_LINK_LIST_PAGE_SIZE,
} from "@shared/constants/validationLimits";
import type { OwnerContext } from "@shared/contracts/ownerContext";
import type { LinkDatabaseRow } from "@shared/contracts/link";
import type {
  CreateLinkRequestBody,
  CreateLinkResponseData,
  GetLinkDetailResponseData,
  ListLinksResponseData,
} from "@shared/contracts/linkRequests";
import type { RedirectCacheRepository } from "../cache/redirectCacheRepository";
import { AliasUnavailableError, NotFoundError, ValidationError } from "../domain/applicationErrors";
import { validateCustomAliasFormat } from "../domain/aliasValidation";
import { calculateRedirectCacheTtlSeconds } from "../domain/cacheTtl";
import { validateFutureExpiryTimestamp } from "../domain/expiryValidation";
import { hasLinkReachedExpiry } from "../domain/linkState";
import { buildShortUrl } from "../domain/shortUrlBuilder";
import { validateAndNormalizeDestinationUrl } from "../domain/urlValidation";
import { parseUtmParameters, type ParsedUtmParameters } from "../domain/utmParsing";
import type { LinkRepository } from "../repositories/linkRepository";
import { isPostgresUniqueViolation } from "../utils/postgresErrors";

export interface CreateLinkResult {
  data: CreateLinkResponseData;
  wasExistingDuplicate: boolean;
}

/**
 * Holds every business rule around creating, listing, reading, and
 * deleting links. Controllers call this service and never touch SQL or the
 * repository directly, matching Rule C-03 in the project rules.
 */
export class LinkService {
  constructor(
    private readonly linkRepository: LinkRepository,
    private readonly redirectCacheRepository: RedirectCacheRepository,
    private readonly publicBaseUrl: string,
    private readonly defaultCacheTtlSeconds: number,
  ) {}

  async createLink(
    ownerContext: OwnerContext,
    requestBody: CreateLinkRequestBody,
    currentTime: Date,
  ): Promise<CreateLinkResult> {
    const validatedUrl = validateAndNormalizeDestinationUrl(requestBody.longUrl);
    const expiresAt = validateFutureExpiryTimestamp(requestBody.expiresAt, currentTime);
    const duplicateHandling = requestBody.duplicateHandling ?? "return_existing";
    const hasRequestedCustomAlias = requestBody.customAlias !== undefined;
    // Captured once here, from the validated URL — never re-derived later,
    // since the destination URL itself never changes after creation.
    const utmParameters = parseUtmParameters(validatedUrl.originalUrl);

    if (!hasRequestedCustomAlias && duplicateHandling === "return_existing") {
      const existingLink = await this.linkRepository.findActiveDuplicateByOwnerAndNormalizedUrl(
        ownerContext,
        validatedUrl.normalizedUrl,
      );

      if (existingLink !== null) {
        return {
          data: mapLinkRecordToCreateResponse(existingLink, this.publicBaseUrl, true),
          wasExistingDuplicate: true,
        };
      }
    }

    if (hasRequestedCustomAlias) {
      const createdLink = await this.createLinkWithCustomAlias(
        ownerContext,
        requestBody.customAlias as string,
        validatedUrl,
        expiresAt,
        utmParameters,
      );

      await this.cacheNewlyCreatedLink(createdLink, currentTime);

      return {
        data: mapLinkRecordToCreateResponse(createdLink, this.publicBaseUrl, false),
        wasExistingDuplicate: false,
      };
    }

    const createdLink = await this.createLinkWithGeneratedCode(
      ownerContext,
      validatedUrl,
      expiresAt,
      utmParameters,
    );

    await this.cacheNewlyCreatedLink(createdLink, currentTime);

    return {
      data: mapLinkRecordToCreateResponse(createdLink, this.publicBaseUrl, false),
      wasExistingDuplicate: false,
    };
  }

  /**
   * Populates the redirect cache immediately after a link is created, so
   * the very first visitor does not need to wait for a cache-miss database
   * lookup. This is best-effort: RedirectCacheRepository already swallows
   * its own Redis errors, so a cache outage during creation cannot fail
   * the creation request itself, matching Rule A-02.
   */
  private async cacheNewlyCreatedLink(link: LinkDatabaseRow, currentTime: Date): Promise<void> {
    const ttlSeconds = calculateRedirectCacheTtlSeconds(
      link.expiresAt,
      currentTime,
      this.defaultCacheTtlSeconds,
    );

    await this.redirectCacheRepository.setCachedRedirectLink(
      {
        linkId: link.id,
        shortCode: link.shortCode,
        longUrl: link.longUrl,
        expiresAt: link.expiresAt === null ? null : link.expiresAt.toISOString(),
        redirectStatusCode: link.redirectStatusCode,
      },
      ttlSeconds,
    );
  }

  private async createLinkWithGeneratedCode(
    ownerContext: OwnerContext,
    validatedUrl: { originalUrl: string; normalizedUrl: string },
    expiresAt: Date | null,
    utmParameters: ParsedUtmParameters,
  ): Promise<LinkDatabaseRow> {
    const allocatedLinkId = await this.linkRepository.allocateNextLinkId();
    const generatedShortCode = encodeBase62(allocatedLinkId);

    return this.linkRepository.insertGeneratedLinkWithKnownId(allocatedLinkId, {
      shortCode: generatedShortCode,
      longUrl: validatedUrl.originalUrl,
      normalizedLongUrl: validatedUrl.normalizedUrl,
      ownerContext,
      expiresAt,
      ...utmParameters,
    });
  }

  private async createLinkWithCustomAlias(
    ownerContext: OwnerContext,
    rawCustomAlias: string,
    validatedUrl: { originalUrl: string; normalizedUrl: string },
    expiresAt: Date | null,
    utmParameters: ParsedUtmParameters,
  ): Promise<LinkDatabaseRow> {
    const validatedAlias = validateCustomAliasFormat(rawCustomAlias);

    try {
      return await this.linkRepository.createCustomAliasLink({
        shortCode: validatedAlias,
        longUrl: validatedUrl.originalUrl,
        normalizedLongUrl: validatedUrl.normalizedUrl,
        ownerContext,
        expiresAt,
        ...utmParameters,
      });
    } catch (thrownError) {
      if (isPostgresUniqueViolation(thrownError)) {
        throw new AliasUnavailableError();
      }

      throw thrownError;
    }
  }

  async listOwnedLinks(
    ownerContext: OwnerContext,
    options: { limit: number | null; cursor: string | null; searchText: string | null },
    currentTime: Date,
  ): Promise<ListLinksResponseData> {
    const pageSize = clampPageSize(options.limit);
    const cursor = decodeListCursor(options.cursor);

    const links = await this.linkRepository.listOwnedActiveLinks({
      ownerContext,
      searchText: options.searchText,
      limit: pageSize,
      cursorCreatedAt: cursor === null ? null : cursor.createdAt,
      cursorId: cursor === null ? null : cursor.id,
    });

    const linksWithClickCounts = await Promise.all(
      links.map(async (link) => ({
        link,
        totalClicks: await this.linkRepository.countClicksForLink(link.id),
      })),
    );

    const lastLink = links[links.length - 1];
    const hasFullPage = links.length === pageSize;
    const nextCursor = hasFullPage && lastLink !== undefined ? encodeListCursor(lastLink) : null;

    return {
      data: linksWithClickCounts.map(({ link, totalClicks }) =>
        mapLinkRecordToListItem(link, this.publicBaseUrl, totalClicks, currentTime),
      ),
      page: {
        nextCursor,
        limit: pageSize,
      },
    };
  }

  async getOwnedLinkDetail(
    ownerContext: OwnerContext,
    shortCode: string,
  ): Promise<GetLinkDetailResponseData> {
    const link = await this.linkRepository.findOwnedLinkByShortCode(ownerContext, shortCode);

    if (link === null) {
      throw new NotFoundError();
    }

    const totalClicks = await this.linkRepository.countClicksForLink(link.id);

    return {
      shortCode: link.shortCode,
      shortUrl: buildShortUrl(this.publicBaseUrl, link.shortCode),
      longUrl: link.longUrl,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt === null ? null : link.expiresAt.toISOString(),
      totalClicks,
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
    };
  }

  async deleteOwnedLink(ownerContext: OwnerContext, shortCode: string): Promise<void> {
    const deletedLink = await this.linkRepository.softDeleteOwnedLink(ownerContext, shortCode);

    if (deletedLink === null) {
      throw new NotFoundError();
    }

    // The database soft delete already committed and is authoritative; a
    // failure invalidating the cache here does not undo it, per Rule A-02.
    await this.redirectCacheRepository.deleteCachedRedirectLink(deletedLink.shortCode);
  }
}

function clampPageSize(requestedLimit: number | null): number {
  if (requestedLimit === null) {
    return DEFAULT_LINK_LIST_PAGE_SIZE;
  }

  if (requestedLimit < 1) {
    throw new ValidationError("The page size must be at least 1.", [
      { field: "limit", message: "Use a limit between 1 and 100." },
    ]);
  }

  if (requestedLimit > MAX_LINK_LIST_PAGE_SIZE) {
    throw new ValidationError("The page size is too large.", [
      { field: "limit", message: `Use a limit of at most ${MAX_LINK_LIST_PAGE_SIZE}.` },
    ]);
  }

  return requestedLimit;
}

interface ListCursor {
  createdAt: Date;
  id: string;
}

function encodeListCursor(link: LinkDatabaseRow): string {
  const cursorPayload = JSON.stringify({
    createdAt: link.createdAt.toISOString(),
    id: link.id,
  });

  return Buffer.from(cursorPayload, "utf8").toString("base64url");
}

function decodeListCursor(rawCursor: string | null): ListCursor | null {
  if (rawCursor === null) {
    return null;
  }

  try {
    const decodedJson = Buffer.from(rawCursor, "base64url").toString("utf8");
    const parsedPayload = JSON.parse(decodedJson) as { createdAt: string; id: string };

    return {
      createdAt: new Date(parsedPayload.createdAt),
      id: parsedPayload.id,
    };
  } catch {
    throw new ValidationError("The pagination cursor could not be read.", [
      { field: "cursor", message: "Start a new list request without a cursor." },
    ]);
  }
}

function mapLinkRecordToCreateResponse(
  link: LinkDatabaseRow,
  publicBaseUrl: string,
  wasExistingDuplicate: boolean,
): CreateLinkResponseData {
  return {
    id: link.id,
    shortCode: link.shortCode,
    shortUrl: buildShortUrl(publicBaseUrl, link.shortCode),
    longUrl: link.longUrl,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt === null ? null : link.expiresAt.toISOString(),
    wasExistingDuplicate,
    utmSource: link.utmSource,
    utmMedium: link.utmMedium,
    utmCampaign: link.utmCampaign,
  };
}

function mapLinkRecordToListItem(
  link: LinkDatabaseRow,
  publicBaseUrl: string,
  totalClicks: number,
  currentTime: Date,
): ListLinksResponseData["data"][number] {
  // The repository already excludes deleted links from this query, so the
  // only two lifecycle states a listed row can have are active and
  // expired.
  const lifecycleState: "active" | "expired" = hasLinkReachedExpiry(link.expiresAt, currentTime)
    ? "expired"
    : "active";

  return {
    shortCode: link.shortCode,
    shortUrl: buildShortUrl(publicBaseUrl, link.shortCode),
    longUrl: link.longUrl,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt === null ? null : link.expiresAt.toISOString(),
    state: lifecycleState,
    totalClicks,
  };
}
