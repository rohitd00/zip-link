import type { LinkLifecycleState } from "@shared/contracts/link";

export interface LinkLifecycleTimestamps {
  expiresAt: Date | null;
  deletedAt: Date | null;
}

/**
 * Determines whether a link has passed its expiry time. This treats
 * "exactly at the expiry instant" as already expired, matching Section 7.1
 * of the technical specification ("expiresAt is at or before current UTC
 * time").
 */
export function hasLinkReachedExpiry(expiresAt: Date | null, currentTime: Date): boolean {
  if (expiresAt === null) {
    return false;
  }

  return expiresAt.getTime() <= currentTime.getTime();
}

/**
 * Derives a link's lifecycle state from its timestamps rather than from a
 * stored status column. Deletion always takes precedence over expiry, so a
 * deleted-and-also-expired link is reported as deleted.
 */
export function evaluateLinkLifecycleState(
  link: LinkLifecycleTimestamps,
  currentTime: Date,
): LinkLifecycleState {
  if (link.deletedAt !== null) {
    return "deleted";
  }

  if (hasLinkReachedExpiry(link.expiresAt, currentTime)) {
    return "expired";
  }

  return "active";
}
