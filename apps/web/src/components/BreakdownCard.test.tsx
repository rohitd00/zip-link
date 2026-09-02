// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Monitor, Share2 } from "lucide-react";
import { describe, expect, it } from "vitest";
import { BreakdownCard } from "./BreakdownCard";

describe("BreakdownCard", () => {
  it("renders a single ranked list when given rows", () => {
    render(
      <BreakdownCard
        title="Top referrers"
        icon={Share2}
        rows={[
          { name: "news.example.com", clickCount: 40 },
          { name: "Direct / unknown", clickCount: 12 },
        ]}
      />,
    );

    expect(screen.getByText("Top referrers")).toBeInTheDocument();
    expect(screen.getByText("news.example.com")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Direct / unknown")).toBeInTheDocument();
  });

  it("shows a no-data message for an empty rows list", () => {
    render(<BreakdownCard title="Top referrers" icon={Share2} rows={[]} />);

    expect(screen.getByText("No data in this period.")).toBeInTheDocument();
  });

  it("renders two independently labeled ranked lists when given sections", () => {
    render(
      <BreakdownCard
        title="Devices & browsers"
        icon={Monitor}
        sections={[
          {
            label: "Devices",
            rows: [
              { name: "desktop", clickCount: 30 },
              { name: "mobile", clickCount: 10 },
            ],
          },
          {
            label: "Browsers",
            rows: [{ name: "Chrome", clickCount: 25 }],
          },
        ]}
      />,
    );

    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("desktop")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Browsers")).toBeInTheDocument();
    expect(screen.getByText("Chrome")).toBeInTheDocument();
  });

  it("shows its own no-data message for a section with an empty rows list", () => {
    render(
      <BreakdownCard
        title="Devices & browsers"
        icon={Monitor}
        sections={[
          { label: "Devices", rows: [{ name: "desktop", clickCount: 5 }] },
          { label: "Browsers", rows: [] },
        ]}
      />,
    );

    expect(screen.getByText("desktop")).toBeInTheDocument();
    expect(screen.getByText("No data in this period.")).toBeInTheDocument();
  });
});
