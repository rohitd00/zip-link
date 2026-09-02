import type { FormEvent } from "react";
import { useState } from "react";
import { ChevronDown, PartyPopper, Repeat2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { CreateLinkResponseData } from "@shared/contracts/linkRequests";
import { apiClient, ApiRequestError, NetworkUnavailableError } from "../../api/apiClient";
import { Button } from "../../components/Button";
import { CopyButton } from "../../components/CopyButton";
import { TextField } from "../../components/TextField";

interface FieldErrors {
  longUrl?: string;
  customAlias?: string;
  expiresAt?: string;
}

export interface CreateLinkFormProps {
  onLinkCreated: (link: CreateLinkResponseData) => void;
}

/**
 * The dashboard's primary create-link form. Advanced options (custom
 * alias, expiry) stay collapsed by default per Section 8.3 of the design
 * specification, and all entered values are preserved across a
 * recoverable error so the owner never has to retype anything.
 */
export function CreateLinkForm({ onLinkCreated }: CreateLinkFormProps) {
  const [longUrl, setLongUrl] = useState("");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [customAlias, setCustomAlias] = useState("");
  const [isExpiryEnabled, setIsExpiryEnabled] = useState(false);
  const [expiresAtLocal, setExpiresAtLocal] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formLevelError, setFormLevelError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<CreateLinkResponseData | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormLevelError(null);
    setSuccessResult(null);

    const trimmedLongUrl = longUrl.trim();

    if (trimmedLongUrl.length === 0) {
      setFieldErrors({ longUrl: "Enter a destination URL." });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient.createLink({
        longUrl: trimmedLongUrl,
        customAlias: customAlias.trim().length > 0 ? customAlias.trim() : undefined,
        expiresAt:
          isExpiryEnabled && expiresAtLocal.length > 0 ? toIsoTimestamp(expiresAtLocal) : undefined,
      });

      setSuccessResult(response.data);
      onLinkCreated(response.data);
    } catch (thrownError) {
      handleSubmitError(thrownError);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmitError(thrownError: unknown): void {
    if (thrownError instanceof NetworkUnavailableError) {
      setFormLevelError(thrownError.message);
      return;
    }

    if (thrownError instanceof ApiRequestError) {
      if (thrownError.code === "RATE_LIMITED") {
        setFormLevelError("You've created several links recently. Try again shortly.");
        return;
      }

      if (thrownError.details !== undefined && thrownError.details.length > 0) {
        const nextFieldErrors: FieldErrors = {};

        for (const detail of thrownError.details) {
          if (
            detail.field === "longUrl" ||
            detail.field === "customAlias" ||
            detail.field === "expiresAt"
          ) {
            nextFieldErrors[detail.field] = detail.message;
          }
        }

        setFieldErrors(nextFieldErrors);
        return;
      }

      setFormLevelError(thrownError.message);
      return;
    }

    setFormLevelError("Something went wrong. Please try again.");
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7">
      <h2 className="text-[15px] font-semibold tracking-tight text-text">Shorten a link</h2>

      {formLevelError !== null && (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {formLevelError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <TextField
          label="Destination URL"
          type="url"
          value={longUrl}
          onChange={(event) => setLongUrl(event.target.value)}
          placeholder="https://example.com/your-long-link"
          helperText="Paste a public HTTP or HTTPS URL."
          errorMessage={fieldErrors.longUrl}
          required
        />

        <button
          type="button"
          aria-expanded={isAdvancedOpen}
          aria-controls="advanced-options-panel"
          onClick={() => setIsAdvancedOpen((current) => !current)}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-text-muted transition-colors hover:text-text"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-150 ${isAdvancedOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          Advanced options
        </button>

        {isAdvancedOpen && (
          <div
            id="advanced-options-panel"
            className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-surface-subtle/60 p-4"
          >
            <TextField
              label="Custom alias (optional)"
              value={customAlias}
              onChange={(event) => setCustomAlias(event.target.value)}
              placeholder="launch-2026"
              helperText="Use letters, numbers, hyphens, or underscores."
              errorMessage={fieldErrors.customAlias}
            />

            <label className="flex items-center gap-2 text-sm font-medium text-text">
              <input
                type="checkbox"
                checked={isExpiryEnabled}
                onChange={(event) => setIsExpiryEnabled(event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Set expiry
            </label>

            {isExpiryEnabled && (
              <TextField
                label="Expires at"
                type="datetime-local"
                value={expiresAtLocal}
                onChange={(event) => setExpiresAtLocal(event.target.value)}
                helperText="The link will stop working after this time (your local timezone)."
                errorMessage={fieldErrors.expiresAt}
              />
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" isLoading={isSubmitting} loadingLabel="Creating…">
            Shorten link
          </Button>
        </div>
      </form>

      {successResult !== null && (
        <div className="mt-5 rounded-[var(--radius-control)] border border-border bg-surface-subtle/60 p-4">
          <div className="flex items-center gap-2">
            {successResult.wasExistingDuplicate ? (
              <Repeat2 className="h-4 w-4 text-accent" aria-hidden="true" />
            ) : (
              <PartyPopper className="h-4 w-4 text-accent" aria-hidden="true" />
            )}
            <p className="text-sm font-semibold text-text">
              {successResult.wasExistingDuplicate ? "Existing link found" : "Link created"}
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <p className="break-all text-sm font-medium text-accent">{successResult.shortUrl}</p>
            <CopyButton valueToCopy={successResult.shortUrl} />
          </div>
          <p className="mt-1.5 truncate text-xs text-text-muted">Opens {successResult.longUrl}</p>
          <Link
            to={`/links/${successResult.shortCode}`}
            className="mt-2 inline-block text-sm font-medium text-accent hover:text-accent-hover"
          >
            View analytics →
          </Link>
        </div>
      )}
    </div>
  );
}

function toIsoTimestamp(datetimeLocalValue: string): string {
  return new Date(datetimeLocalValue).toISOString();
}
