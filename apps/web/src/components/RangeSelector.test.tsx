// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RangeSelector } from "./RangeSelector";

describe("RangeSelector", () => {
  it("marks the currently selected preset as pressed", () => {
    render(<RangeSelector selectedPreset="7d" onSelectPreset={vi.fn()} />);

    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onSelectPreset with the clicked preset", async () => {
    const user = userEvent.setup();
    const onSelectPreset = vi.fn();

    render(<RangeSelector selectedPreset="30d" onSelectPreset={onSelectPreset} />);
    await user.click(screen.getByRole("button", { name: "24 hours" }));

    expect(onSelectPreset).toHaveBeenCalledWith("24h");
  });

  it("is fully operable by keyboard", async () => {
    const user = userEvent.setup();
    const onSelectPreset = vi.fn();

    render(<RangeSelector selectedPreset="30d" onSelectPreset={onSelectPreset} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "24 hours" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onSelectPreset).toHaveBeenCalledWith("24h");
  });
});
