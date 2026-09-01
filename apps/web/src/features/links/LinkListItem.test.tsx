// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LinkListItem } from "./LinkListItem";

const sampleLink = {
  shortCode: "abc",
  shortUrl: "https://sho.rt/abc",
  longUrl: "https://example.com/a-very-long-destination-page",
  createdAt: "2026-09-01T00:00:00.000Z",
  expiresAt: null,
  state: "active" as const,
  totalClicks: 1248,
};

describe("LinkListItem", () => {
  it("renders the short URL, destination, status, and click count", () => {
    render(
      <MemoryRouter>
        <LinkListItem link={sampleLink} />
      </MemoryRouter>,
    );

    expect(screen.getByText("https://sho.rt/abc")).toBeInTheDocument();
    expect(screen.getByText(sampleLink.longUrl)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("1,248 clicks")).toBeInTheDocument();
  });

  it("renders an expired badge for an expired link", () => {
    render(
      <MemoryRouter>
        <LinkListItem link={{ ...sampleLink, state: "expired" }} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Expired")).toBeInTheDocument();
  });
});
