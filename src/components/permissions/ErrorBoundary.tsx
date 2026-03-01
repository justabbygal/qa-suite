"use client";

import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Custom fallback UI. Receives the caught error and a callback to reset the
   * boundary so the child tree can re-mount.
   */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** Called when an error is caught, e.g. for external error reporting. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

// ---------------------------------------------------------------------------
// Default fallback UI
// ---------------------------------------------------------------------------

function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-start gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6"
    >
      <div className="flex items-center gap-2 text-destructive">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 6v4.5M10 13.5v.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-sm font-semibold">Something went wrong</span>
      </div>

      <p className="text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred in the permission panel."}
      </p>

      <button
        type="button"
        onClick={onReset}
        className={[
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
          "text-sm font-medium",
          "border border-border bg-background text-foreground",
          "shadow-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ].join(" ")}
      >
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

/**
 * Error boundary for the permission management UI.
 *
 * Catches errors thrown by any descendant and renders a fallback instead of
 * crashing the entire page. The "Try again" button resets the boundary so the
 * child tree can re-mount from a clean state.
 *
 * Usage:
 * ```tsx
 * <PermissionErrorBoundary onError={logError}>
 *   <PermissionLayout organizationId={orgId} />
 * </PermissionErrorBoundary>
 * ```
 *
 * Custom fallback:
 * ```tsx
 * <PermissionErrorBoundary
 *   fallback={(error, reset) => (
 *     <MyCustomError message={error.message} onRetry={reset} />
 *   )}
 * >
 *   <PermissionLayout organizationId={orgId} />
 * </PermissionErrorBoundary>
 * ```
 */
export class PermissionErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  handleReset(): void {
    this.setState({ hasError: false, error: null });
  }

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (fallback) {
        return fallback(error, this.handleReset);
      }
      return <DefaultFallback error={error} onReset={this.handleReset} />;
    }

    return children;
  }
}
