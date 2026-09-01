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
  ListLinksResponseData,
} from "@shared/contracts/linkRequests";
import { AliasUnavailableError, NotFoundError, ValidationError } from "../domain/applicationErrors";
import { validateCustomAliasFormat } from "../domain/aliasValidation";
import { validateFutureExpiryTimestamp } from "../domain/expiryValidation";
import { hasLinkReachedExpiry } from "../domain/linkState";
import { validateAndNormalizeDestinationUrl } from "../domain/urlValidation";
import type { LinkRepository } from "../repositories/linkRepository";

const POSTGRES_UNIQUE_VIOLATION_ERROR_CODE = "23505";

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
    private readonly publicBaseUrl: string,
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
      );

      return {
        data: mapLinkRecordToCreateResponse(createdLink, this.publicBaseUrl, false),
        wasExistingDuplicate: false,
      };
    }

    const createdLink = await this.createLinkWithGeneratedCode(
      ownerContext,
      validatedUrl,
      expiresAt,
    );

    return {
      data: mapLinkRecordToCreateResponse(createdLink, this.publicBaseUrl, false),
      wasExistingDuplicate: false,
    };
  }

  private async createLinkWithGeneratedCode(
    ownerContext: OwnerContext,
    validatedUrl: { originalUrl: string; normalizedUrl: string },
    expiresAt: Date | null,
  ): Promise<LinkDatabaseRow> {
    const allocatedLinkId = await this.linkRepository.allocateNextLinkId();
    const generatedShortCode = encodeBase62(allocatedLinkId);

    return this.linkRepository.insertGeneratedLinkWithKnownId(allocatedLinkId, {
      shortCode: generatedShortCode,
      longUrl: validatedUrl.originalUrl,
      normalizedLongUrl: validatedUrl.normalizedUrl,
      ownerContext,
      expiresAt,
    });
  }

  private async createLinkWithCustomAlias(
    ownerContext: OwnerContext,
    rawCustomAlias: string,
    validatedUrl: { originalUrl: string; normalizedUrl: string },
    expiresAt: Date | null,
  ): Promise<LinkDatabaseRow> {
    const validatedAlias = validateCustomAliasFormat(rawCustomAlias);

    try {
      return await this.linkRepository.createCustomAliasLink({
        shortCode: validatedAlias,
        longUrl: validatedUrl.originalUrl,
        normalizedLongUrl: validatedUrl.normalizedUrl,
        ownerContext,
        expiresAt,
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
  ): Promise<{ link: LinkDatabaseRow; totalClicks: number }> {
    const link = await this.linkRepository.findOwnedLinkByShortCode(ownerContext, shortCode);

    if (link === null) {
      throw new NotFoundError();
    }

    const totalClicks = await this.linkRepository.countClicksForLink(link.id);

    return { link, totalClicks };
  }

  async deleteOwnedLink(ownerContext: OwnerContext, shortCode: string): Promise<void> {
    const deletedLink = await this.linkRepository.softDeleteOwnedLink(ownerContext, shortCode);

    if (deletedLink === null) {
      throw new NotFoundError();
    }
  }
}

function isPostgresUniqueViolation(thrownError: unknown): boolean {
  if (typeof thrownError !== "object" || thrownError === null) {
    return false;
  }

  const maybeDatabaseError = thrownError as { code?: unknown };
  return maybeDatabaseError.code === POSTGRES_UNIQUE_VIOLATION_ERROR_CODE;
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

function buildShortUrl(publicBaseUrl: string, shortCode: string): string {
  const baseUrlWithoutTrailingSlash = publicBaseUrl.endsWith("/")
    ? publicBaseUrl.slice(0, -1)
    : publicBaseUrl;

  return `${baseUrlWithoutTrailingSlash}/${shortCode}`;
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
