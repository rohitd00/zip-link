import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshCurrentUser, googleSignInEnabled } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formLevelError, setFormLevelError] = useState<string | null>(
    searchParams.get("error") === "google_sign_in_failed"
      ? "Google sign-in didn't work. Please try again."
      : null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormLevelError(null);
    setIsSubmitting(true);

    try {
      await apiClient.login({ email: email.trim(), password });
      await refreshCurrentUser();
      navigate("/dashboard");
    } catch (thrownError) {
      if (thrownError instanceof NetworkUnavailableError) {
        setFormLevelError(thrownError.message);
      } else if (thrownError instanceof ApiRequestError) {
        setFormLevelError(
          thrownError.code === "INVALID_CREDENTIALS"
            ? "Incorrect email or password."
            : thrownError.message,
        );
      } else {
        setFormLevelError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to ZipLink.">
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
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <Link
            to="/forgot-password"
            className="self-end text-xs font-medium text-accent hover:text-accent-hover"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" isLoading={isSubmitting} loadingLabel="Signing in…">
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-accent hover:text-accent-hover">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
