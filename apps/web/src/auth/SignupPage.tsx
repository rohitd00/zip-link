import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiClient,
  ApiRequestError,
  GOOGLE_SIGN_IN_URL,
  NetworkUnavailableError,
} from "../api/apiClient";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { useAuth } from "./AuthContext";
import { AuthLayout } from "./AuthLayout";
import { GoogleIcon } from "./GoogleIcon";

export function SignupPage() {
  const navigate = useNavigate();
  const { refreshCurrentUser, googleSignInEnabled } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formLevelError, setFormLevelError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormLevelError(null);
    setIsSubmitting(true);

    try {
      await apiClient.signup({
        email: email.trim(),
        password,
        displayName: displayName.trim().length > 0 ? displayName.trim() : undefined,
      });
      await refreshCurrentUser();
      navigate("/dashboard");
    } catch (thrownError) {
      if (thrownError instanceof NetworkUnavailableError) {
        setFormLevelError(thrownError.message);
      } else if (thrownError instanceof ApiRequestError) {
        if (thrownError.details !== undefined && thrownError.details.length > 0) {
          const nextFieldErrors: { email?: string; password?: string } = {};
          for (const detail of thrownError.details) {
            if (detail.field === "email" || detail.field === "password") {
              nextFieldErrors[detail.field] = detail.message;
            }
          }
          setFieldErrors(nextFieldErrors);
        } else {
          setFormLevelError(thrownError.message);
        }
      } else {
        setFormLevelError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Track and manage your links in one place.">
      {formLevelError !== null && (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {formLevelError}
        </p>
      )}

      {googleSignInEnabled && (
        <>
          <a
            href={GOOGLE_SIGN_IN_URL}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-[var(--shadow-card)] transition-colors hover:bg-surface-subtle"
          >
            <GoogleIcon />
            Continue with Google
          </a>
          <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="Name (optional)"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="name"
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          errorMessage={fieldErrors.email}
          autoComplete="email"
          required
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          errorMessage={fieldErrors.password}
          helperText="At least 8 characters."
          autoComplete="new-password"
          required
        />
        <Button type="submit" isLoading={isSubmitting} loadingLabel="Creating account…">
          Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-accent hover:text-accent-hover">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
