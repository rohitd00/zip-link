// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../api/apiClient";
import { apiClient } from "../../api/apiClient";
import { CreateLinkForm, type CreateLinkFormProps } from "./CreateLinkForm";

// CreateLinkForm renders a react-router <Link> in its success panel ("View
// analytics"), so every test needs a surrounding router context.
function renderCreateLinkForm(props: CreateLinkFormProps) {
  return render(
    <MemoryRouter>
      <CreateLinkForm {...props} />
    </MemoryRouter>,
  );
}

vi.mock("../../api/apiClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/apiClient")>("../../api/apiClient");
  return {
    ...actual,
    apiClient: {
      createLink: vi.fn(),
    },
  };
});

function buildErrorResponseBody(field: string, message: string) {
  return {
    error: {
      code: "VALIDATION_ERROR" as const,
      message: "Validation failed.",
      details: [{ field, message }],
      requestId: "req_test",
    },
  };
}

describe("CreateLinkForm", () => {
  it("shows a field error and keeps the entered URL when the server rejects it", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.createLink).mockRejectedValueOnce(
      new ApiRequestError(
        400,
        buildErrorResponseBody("longUrl", "Use a valid HTTP or HTTPS URL."),
        null,
      ),
    );

    renderCreateLinkForm({ onLinkCreated: vi.fn() });

    const urlInput = screen.getByLabelText("Destination URL");
    await user.type(urlInput, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Shorten link" }));

    await waitFor(() => {
      expect(screen.getByText("Use a valid HTTP or HTTPS URL.")).toBeInTheDocument();
    });

    // The value the owner typed must still be there after a recoverable
    // error, per app-flow.md's "preserve form entries" rule.
    expect(urlInput).toHaveValue("javascript:alert(1)");
  });

  it("calls onLinkCreated and shows the success panel on a valid submission", async () => {
    const user = userEvent.setup();
    const onLinkCreated = vi.fn();

    vi.mocked(apiClient.createLink).mockResolvedValueOnce({
      data: {
        id: "1",
        shortCode: "abc",
        shortUrl: "https://sho.rt/abc",
        longUrl: "https://example.com/page",
        createdAt: new Date().toISOString(),
        expiresAt: null,
        wasExistingDuplicate: false,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      },
    });

    renderCreateLinkForm({ onLinkCreated: onLinkCreated });

    await user.type(screen.getByLabelText("Destination URL"), "https://example.com/page");
    await user.click(screen.getByRole("button", { name: "Shorten link" }));

    await waitFor(() => {
      expect(screen.getByText("Link created")).toBeInTheDocument();
    });

    expect(screen.getByText("https://sho.rt/abc")).toBeInTheDocument();
    expect(onLinkCreated).toHaveBeenCalledTimes(1);
  });

  it("shows the duplicate wording instead of claiming a new link was made", async () => {
    const user = userEvent.setup();

    vi.mocked(apiClient.createLink).mockResolvedValueOnce({
      data: {
        id: "1",
        shortCode: "abc",
        shortUrl: "https://sho.rt/abc",
        longUrl: "https://example.com/page",
        createdAt: new Date().toISOString(),
        expiresAt: null,
        wasExistingDuplicate: true,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      },
    });

    renderCreateLinkForm({ onLinkCreated: vi.fn() });
    await user.type(screen.getByLabelText("Destination URL"), "https://example.com/page");
    await user.click(screen.getByRole("button", { name: "Shorten link" }));

    await waitFor(() => {
      expect(screen.getByText("Existing link found")).toBeInTheDocument();
    });
  });

  it("keeps advanced options collapsed until the owner opens them", async () => {
    const user = userEvent.setup();
    renderCreateLinkForm({ onLinkCreated: vi.fn() });

    expect(screen.queryByLabelText("Custom alias (optional)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Advanced options" }));

    expect(screen.getByLabelText("Custom alias (optional)")).toBeInTheDocument();
  });
});
