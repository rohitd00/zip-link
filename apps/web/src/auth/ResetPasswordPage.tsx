import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient, ApiRequestError, NetworkUnavailableError } from "../api/apiClient";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { AuthLayout } from "./AuthLayout";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formLevelError, setFormLevelError] = useState<string | null>(null);
  const [hasSucceeded, setHasSucceeded] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token === null) {
      return;
    }

    setFormLevelError(null);
    setIsSubmitting(true);

    try {
      await apiClient.resetPassword({ token, newPassword });
      setHasSucceeded(true);
    } catch (thrownError) {
      if (thrownError instanceof NetworkUnavailableError) {
        setFormLevelError(thrownError.message);
      } else if (thrownError instanceof ApiRequestError) {
        setFormLevelError(
          thrownError.code === "INVALID_OR_EXPIRED_TOKEN"
            ? "This reset link is invalid or has expired. Request a new one."
            : thrownError.message,
        );
      } else {
        setFormLevelError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (token === null) {
    return (
      <AuthLayout title="Invalid link">
        <p className="text-sm text-text-muted">
          This password reset link is missing its token. Request a new one below.
        </p>
        <Link
          to="/forgot-password"
          className="mt-5 inline-block text-sm font-medium text-accent hover:text-accent-hover"
        >
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  if (hasSucceeded) {
    return (
      <AuthLayout title="Password updated">
        <p className="text-sm text-text-muted">
          Your password has been reset. You can now sign in.
        </p>
        <Link
          to="/login"
          className="mt-5 inline-block text-sm font-medium text-accent hover:text-accent-hover"
        >
          Sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      {formLevelError !== null && (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {formLevelError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="New password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          helperText="At least 8 characters."
          autoComplete="new-password"
          required
        />
        <Button type="submit" isLoading={isSubmitting} loadingLabel="Saving…">
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
