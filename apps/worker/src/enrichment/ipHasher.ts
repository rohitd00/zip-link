import crypto from "node:crypto";

export interface HashedIpAddress {
  ipHash: string;
  ipHashKeyVersion: string;
}

/**
 * Turns a raw client IP address into a pseudonymous, non-reversible value
 * before it is ever written to the database. This uses HMAC, not a plain
 * hash: an IP address space is small enough that an attacker could
 * precompute a plain hash for every possible address, but not one keyed
 * with a secret they do not have. See Rule P-02 in project-rules.md.
 *
 * ipHashKeyVersion is stored alongside the hash so a future secret
 * rotation does not silently make old and new hashes incomparable without
 * explanation.
 */
export function hashClientIpAddress(
  rawIpAddress: string,
  ipHashSecret: string,
  ipHashKeyVersion: string,
): HashedIpAddress {
  const hmac = crypto.createHmac("sha256", ipHashSecret);
  hmac.update(rawIpAddress);

  return {
    ipHash: hmac.digest("hex"),
    ipHashKeyVersion,
  };
}
