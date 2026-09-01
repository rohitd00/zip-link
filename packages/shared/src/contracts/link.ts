import type { OwnerType } from "./ownerContext";

// The lifecycle state of a link, derived from its timestamps rather than
// stored directly. See Section 7.1 of the technical specification.
export type LinkLifecycleState = "active" | "expired" | "deleted";

// This is the shape of a `links` table row as read from PostgreSQL. It is an
// internal type: repositories return this, and services convert it into a
// public-facing DTO before it reaches an HTTP response.
export interface LinkDatabaseRow {
  id: string;
  shortCode: string;
  longUrl: string;
  normalizedLongUrl: string;
  ownerType: OwnerType;
  ownerId: string;
  redirectStatusCode: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  deletedAt: Date | null;
  isCustomAlias: boolean;
}

// This is the shape returned to an owner through the management API. It
// never includes the owner ID, because that value must not be exposed to
// the client.
export interface PublicLinkDto {
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  createdAt: string;
  expiresAt: string | null;
  state: LinkLifecycleState;
  totalClicks: number;
}
