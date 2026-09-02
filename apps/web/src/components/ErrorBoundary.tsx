import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches a rendering error anywhere below it and shows a small recovery
 * card instead of letting React unmount the entire page to a blank screen.
 * Added after a real incident: a split-host deploy (Vercel frontend, Render
 * API — see docs/10-system-design.md Section 12) has a window where the
 * frontend can be newer than the API it's talking to, and a response
 * missing a field the new frontend expects threw during render with no
 * boundary to catch it. React only supports error boundaries as class
 * components — there is no hook equivalent for this.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Caught a rendering error.", error, errorInfo);
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-soft/40 p-8 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-danger" aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold text-text">Something went wrong here</p>
        <p className="mt-1 text-sm text-text-muted">
          Try reloading the page. If this keeps happening, please try again shortly.
        </p>
      </div>
    );
  }
}
