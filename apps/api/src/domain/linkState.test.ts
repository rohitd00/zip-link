import { describe, expect, it } from "vitest";
import { evaluateLinkLifecycleState, hasLinkReachedExpiry } from "./linkState";

const currentTime = new Date("2026-09-02T12:00:00.000Z");

describe("hasLinkReachedExpiry", () => {
  it("returns false when there is no expiry", () => {
    expect(hasLinkReachedExpiry(null, currentTime)).toBe(false);
  });

  it("returns false when expiry is in the future", () => {
    const futureExpiry = new Date("2026-09-03T00:00:00.000Z");
    expect(hasLinkReachedExpiry(futureExpiry, currentTime)).toBe(false);
  });

  it("returns true when expiry is exactly at the current time", () => {
    expect(hasLinkReachedExpiry(currentTime, currentTime)).toBe(true);
  });

  it("returns true when expiry is in the past", () => {
    const pastExpiry = new Date("2026-09-01T00:00:00.000Z");
    expect(hasLinkReachedExpiry(pastExpiry, currentTime)).toBe(true);
  });
});

describe("evaluateLinkLifecycleState", () => {
  it("reports active for a link with no expiry and no deletion", () => {
    const state = evaluateLinkLifecycleState({ expiresAt: null, deletedAt: null }, currentTime);
    expect(state).toBe("active");
  });

  it("reports active for a link that expires in the future", () => {
    const state = evaluateLinkLifecycleState(
      { expiresAt: new Date("2026-09-03T00:00:00.000Z"), deletedAt: null },
      currentTime,
    );
    expect(state).toBe("active");
  });

  it("reports expired for a link past its expiry time", () => {
    const state = evaluateLinkLifecycleState(
      { expiresAt: new Date("2026-09-01T00:00:00.000Z"), deletedAt: null },
      currentTime,
    );
    expect(state).toBe("expired");
  });

  it("reports deleted for a link with a deletion timestamp", () => {
    const state = evaluateLinkLifecycleState(
      { expiresAt: null, deletedAt: new Date("2026-09-01T00:00:00.000Z") },
      currentTime,
    );
    expect(state).toBe("deleted");
  });

  it("reports deleted when a link is both deleted and expired", () => {
    const state = evaluateLinkLifecycleState(
      {
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        deletedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      currentTime,
    );
    expect(state).toBe("deleted");
  });
});
