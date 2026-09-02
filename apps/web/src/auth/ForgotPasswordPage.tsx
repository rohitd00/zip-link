import type { FormEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, NetworkUnavailableError } from "../api/apiClient";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { AuthLayout } from "./AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formLevelError, setFormLevelError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormLevelError(null);
    setIsSubmitting(true);

    try {
      await apiClient.requestPasswordReset({ email: email.trim() });
      // The server always resolves successfully here regardless of whether
      // the address has an account, so we can't (and shouldn't) tell the
      // two cases apart in the UI either.
      setHasSubmitted(true);
    } catch (thrownError) {
      setFormLevelError(
        thrownError instanceof NetworkUnavailableError
          ? thrownError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (hasSubmitted) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-sm text-text-muted">
          If an account exists for <span className="font-medium text-text">{email}</span>, a
          password reset link is on its way.
        </p>
        <Link
          to="/login"
          className="mt-5 inline-block text-sm font-medium text-accent hover:text-accent-hover"
        >
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
    >
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
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <Button type="submit" isLoading={isSubmitting} loadingLabel="Sending…">
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        <Link to="/login" className="font-medium text-accent hover:text-accent-hover">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
