// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("is not visible when isOpen is false", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Delete this link?"
        description="This cannot be undone."
        confirmLabel="Delete link"
        isConfirming={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText("Delete this link?")).not.toBeVisible();
  });

  it("calls onConfirm when the destructive button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete this link?"
        description="This cannot be undone."
        confirmLabel="Delete link"
        isConfirming={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete link" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete this link?"
        description="This cannot be undone."
        confirmLabel="Delete link"
        isConfirming={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while confirming, showing a Deleting… label", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete this link?"
        description="This cannot be undone."
        confirmLabel="Delete link"
        isConfirming={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText("Deleting…")).toBeInTheDocument();
  });
});
