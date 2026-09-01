import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { OwnerContext } from "@shared/contracts/ownerContext";
import { createTestDatabasePool, truncateAllTestData } from "../testSupport/testDatabasePool";
import { LinkRepository } from "./linkRepository";

const ownerA: OwnerContext = { ownerType: "anonymous_session", ownerId: "owner-a" };
const ownerB: OwnerContext = { ownerType: "anonymous_session", ownerId: "owner-b" };

let pool: Pool;
let linkRepository: LinkRepository;

beforeAll(() => {
  pool = createTestDatabasePool();
  linkRepository = new LinkRepository(pool);
});

afterEach(async () => {
  await truncateAllTestData(pool);
});

afterAll(async () => {
  await pool.end();
});

async function insertGeneratedLink(
  ownerContext: OwnerContext,
  overrides: Partial<{ longUrl: string; normalizedLongUrl: string; expiresAt: Date | null }> = {},
) {
  const linkId = await linkRepository.allocateNextLinkId();
  const longUrl = overrides.longUrl ?? "https://example.com/page";

  return linkRepository.insertGeneratedLinkWithKnownId(linkId, {
    shortCode: linkId.toString(),
    longUrl,
    normalizedLongUrl: overrides.normalizedLongUrl ?? longUrl,
    ownerContext,
    expiresAt: overrides.expiresAt ?? null,
  });
}

describe("LinkRepository", () => {
  it("allocates sequential, collision-free identifiers across many concurrent calls", async () => {
    const allocationPromises = Array.from({ length: 25 }, () =>
      linkRepository.allocateNextLinkId(),
    );
    const allocatedIds = await Promise.all(allocationPromises);
    const uniqueIds = new Set(allocatedIds.map((id) => id.toString()));

    expect(uniqueIds.size).toBe(allocatedIds.length);
  });

  it("creates a custom alias link and later rejects a duplicate alias", async () => {
    const firstLink = await linkRepository.createCustomAliasLink({
      shortCode: "launch-2026",
      longUrl: "https://example.com/one",
      normalizedLongUrl: "https://example.com/one",
      ownerContext: ownerA,
      expiresAt: null,
    });

    expect(firstLink.shortCode).toBe("launch-2026");
    expect(firstLink.isCustomAlias).toBe(true);

    await expect(
      linkRepository.createCustomAliasLink({
        shortCode: "launch-2026",
        longUrl: "https://example.com/two",
        normalizedLongUrl: "https://example.com/two",
        ownerContext: ownerB,
        expiresAt: null,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("finds an active duplicate scoped to the requesting owner only", async () => {
    await insertGeneratedLink(ownerA, { longUrl: "https://example.com/shared" });
    await insertGeneratedLink(ownerB, { longUrl: "https://example.com/shared" });

    const duplicateForOwnerA = await linkRepository.findActiveDuplicateByOwnerAndNormalizedUrl(
      ownerA,
      "https://example.com/shared",
    );

    expect(duplicateForOwnerA).not.toBeNull();
    expect(duplicateForOwnerA?.ownerId).toBe("owner-a");
  });

  it("does not return a deleted link as a duplicate", async () => {
    const createdLink = await insertGeneratedLink(ownerA, {
      longUrl: "https://example.com/deleted-case",
    });
    await linkRepository.softDeleteOwnedLink(ownerA, createdLink.shortCode);

    const duplicate = await linkRepository.findActiveDuplicateByOwnerAndNormalizedUrl(
      ownerA,
      "https://example.com/deleted-case",
    );

    expect(duplicate).toBeNull();
  });

  it("lists only the requesting owner's active links, newest first", async () => {
    await insertGeneratedLink(ownerA, { longUrl: "https://example.com/a1" });
    await insertGeneratedLink(ownerA, { longUrl: "https://example.com/a2" });
    await insertGeneratedLink(ownerB, { longUrl: "https://example.com/b1" });

    const links = await linkRepository.listOwnedActiveLinks({
      ownerContext: ownerA,
      searchText: null,
      limit: 10,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(links).toHaveLength(2);
    expect(links.every((link) => link.ownerId === "owner-a")).toBe(true);
    expect(links[0]?.longUrl).toBe("https://example.com/a2");
  });

  it("finds a public link by short code regardless of owner", async () => {
    const createdLink = await insertGeneratedLink(ownerA);

    const publicLink = await linkRepository.findPublicLinkByShortCode(createdLink.shortCode);

    expect(publicLink?.id).toBe(createdLink.id);
  });

  it("does not find a soft-deleted link through the public lookup", async () => {
    const createdLink = await insertGeneratedLink(ownerA);
    await linkRepository.softDeleteOwnedLink(ownerA, createdLink.shortCode);

    const publicLink = await linkRepository.findPublicLinkByShortCode(createdLink.shortCode);

    expect(publicLink).toBeNull();
  });

  it("does not find another owner's link through the owned lookup", async () => {
    const createdLink = await insertGeneratedLink(ownerA);

    const foundByWrongOwner = await linkRepository.findOwnedLinkByShortCode(
      ownerB,
      createdLink.shortCode,
    );

    expect(foundByWrongOwner).toBeNull();
  });

  it("returns null when deleting a link that does not belong to the requester", async () => {
    const createdLink = await insertGeneratedLink(ownerA);

    const result = await linkRepository.softDeleteOwnedLink(ownerB, createdLink.shortCode);

    expect(result).toBeNull();
  });

  it("is idempotent-safe: deleting an already-deleted link returns null the second time", async () => {
    const createdLink = await insertGeneratedLink(ownerA);

    const firstDelete = await linkRepository.softDeleteOwnedLink(ownerA, createdLink.shortCode);
    const secondDelete = await linkRepository.softDeleteOwnedLink(ownerA, createdLink.shortCode);

    expect(firstDelete).not.toBeNull();
    expect(secondDelete).toBeNull();
  });
});
