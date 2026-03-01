'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ErrorMessageProps {
  /** The primary error text to display. */
  message: string;
  /** Optional bolded title above the message. */
  title?: string;
  /** Show a retry button when true and `onRetry` is provided. */
  retryable?: boolean;
  /** Called when the user clicks the retry button. */
  onRetry?: () => void;
  /** Shows a spinner on the retry button while true. */
  isRetrying?: boolean;
  className?: string;
}

/**
 * Inline error banner with an optional retry action.
 *
 * Uses `role="alert"` and `aria-live="assertive"` so assistive technology
 * announces the error as soon as it is rendered.
 */
export function ErrorMessage({
  message,
  title,
  retryable = false,
  onRetry,
  isRetrying = false,
  className,
}: ErrorMessageProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4',
        className
      )}
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0 space-y-1">
        {title && (
          <p className="text-sm font-semibold text-destructive">{title}</p>
        )}
        <p className="text-sm text-destructive">{message}</p>
        {retryable && onRetry && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-1 h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive"
          >
            <RefreshCw
              className={cn('mr-1.5 h-3 w-3', isRetrying && 'animate-spin')}
              aria-hidden="true"
            />
            <span>{isRetrying ? 'Retrying\u2026' : 'Try again'}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
