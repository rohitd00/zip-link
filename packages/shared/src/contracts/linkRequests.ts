// This is the JSON body accepted by POST /api/links, exactly as sent by the
// browser or any other API client. All fields except longUrl are optional.
export interface CreateLinkRequestBody {
  longUrl: string;
  customAlias?: string;
  expiresAt?: string;
  duplicateHandling?: "return_existing" | "create_new";
}

// This is the JSON body returned by a successful link creation, matching
// Section 11.1 of the technical specification.
export interface CreateLinkResponseData {
  id: string;
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  createdAt: string;
  expiresAt: string | null;
  wasExistingDuplicate: boolean;
}

// This is the JSON body returned by GET /api/links, matching Section 11.2.
export interface ListLinksResponseData {
  data: Array<{
    shortCode: string;
    shortUrl: string;
    longUrl: string;
    createdAt: string;
    expiresAt: string | null;
    state: "active" | "expired";
    totalClicks: number;
  }>;
  page: {
    nextCursor: string | null;
    limit: number;
  };
}

// Query parameters accepted by GET /api/links, after parsing from raw
// request query strings into their proper types.
export interface ListLinksQueryOptions {
  cursor: string | null;
  limit: number;
  query: string | null;
}

// This is the JSON body returned by GET /api/links/:code, matching
// Section 11.3 of the technical specification.
export interface GetLinkDetailResponseData {
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  createdAt: string;
  expiresAt: string | null;
  totalClicks: number;
}
