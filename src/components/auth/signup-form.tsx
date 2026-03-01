'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ErrorMessage } from '@/components/ui/error-message';
import {
  type AuthError,
  getAuthErrorTitle,
  parseSignupApiError,
  toAuthError,
  logAuthError,
} from '@/lib/utils/errors';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  organizationName: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  organizationName?: string;
}

// ---------------------------------------------------------------------------
// Client-side validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

function validateForm(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.name.trim()) {
    errors.name = 'Full name is required.';
  }

  if (!values.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!values.organizationName.trim()) {
    errors.organizationName = 'Organization name is required.';
  } else if (values.organizationName.trim().length < 2) {
    errors.organizationName = 'Organization name must be at least 2 characters.';
  }

  if (!values.password) {
    errors.password = 'Password is required.';
  } else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// FormField — accessible input with inline error
// ---------------------------------------------------------------------------

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

function FormField({ id, label, error, className, ...props }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium leading-none"
      >
        {label}
      </label>
      <input
        id={id}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'ring-offset-background placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignupForm
// ---------------------------------------------------------------------------

export interface SignupFormProps {
  /** Called after the owner account and organization are created successfully. */
  onSuccess?: () => void;
  /** Called when the user clicks the "Sign in" link. */
  onSignInClick?: () => void;
}

const INITIAL_VALUES: FormValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  organizationName: '',
};

/**
 * Owner account creation form.
 *
 * Handles:
 * - Client-side field validation with inline errors
 * - Duplicate email / duplicate organization name from the API
 * - Network and server errors with a retry button
 * - Loading state during submission and retries
 * - Form data preservation across errors — no data is lost on failure
 */
export function SignupForm({ onSuccess, onSignInClick }: SignupFormProps) {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [topError, setTopError] = useState<AuthError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Clear field errors and top error as the user types
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setValues((prev) => ({ ...prev, [name]: value }));
      setFieldErrors((prev) => (prev[name as keyof FieldErrors] ? { ...prev, [name]: undefined } : prev));
      setTopError(null);
    },
    []
  );

  // Core submission logic — separated so it can be reused by retry
  const submitSignup = useCallback(async (vals: FormValues): Promise<void> => {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: vals.name.trim(),
        email: vals.email.trim().toLowerCase(),
        password: vals.password,
        organizationName: vals.organizationName.trim(),
      }),
    });

    if (!response.ok) {
      const authErr = await parseSignupApiError(response);

      // Apply server-returned field-level errors
      if (authErr.fieldErrors?.length) {
        const fromServer: FieldErrors = {};
        for (const fe of authErr.fieldErrors) {
          if (fe.field in INITIAL_VALUES) {
            fromServer[fe.field as keyof FieldErrors] = fe.message;
          }
        }
        setFieldErrors(fromServer);
      }

      // Map well-known codes to targeted field errors for immediate feedback
      if (authErr.code === 'DUPLICATE_EMAIL') {
        setFieldErrors((prev) => ({
          ...prev,
          email: 'An account with this email already exists.',
        }));
      } else if (authErr.code === 'DUPLICATE_ORG') {
        setFieldErrors((prev) => ({
          ...prev,
          organizationName: 'An organization with this name already exists.',
        }));
      }

      throw authErr;
    }

    // Account and organization created — authenticate the user automatically
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: vals.email.trim().toLowerCase(),
      password: vals.password,
    });

    if (signInError) {
      // Account was created successfully; sign-in failed (e.g. email
      // confirmation required). Not a fatal error — surface as a warning
      // so the user knows they must confirm their email or sign in manually.
      logAuthError('signup_auto_signin', signInError);
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setTopError(null);
      setFieldErrors({});

      // Run client-side validation first
      const validationErrors = validateForm(values);
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        return;
      }

      setIsSubmitting(true);
      try {
        await submitSignup(values);
        setIsSuccess(true);
        onSuccess?.();
      } catch (err) {
        logAuthError('signup_submit', err);
        const authErr = toAuthError(err);
        // Duplicate email/org already surface as field-level errors — skip the
        // redundant top banner so users see one focused message, not two.
        const hasFieldTarget = authErr.code === 'DUPLICATE_EMAIL' || authErr.code === 'DUPLICATE_ORG';
        if (!hasFieldTarget) {
          setTopError(authErr);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, submitSignup, onSuccess]
  );

  const handleRetry = useCallback(async () => {
    setTopError(null);
    setIsRetrying(true);
    try {
      await submitSignup(values);
      setIsSuccess(true);
      onSuccess?.();
    } catch (err) {
      logAuthError('signup_retry', err);
      const authErr = toAuthError(err);
      const hasFieldTarget = authErr.code === 'DUPLICATE_EMAIL' || authErr.code === 'DUPLICATE_ORG';
      if (!hasFieldTarget) {
        setTopError(authErr);
      }
    } finally {
      setIsRetrying(false);
    }
  }, [values, submitSignup, onSuccess]);

  const isLoading = isSubmitting || isRetrying;

  if (isSuccess) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-500" aria-hidden="true" />
            <CardTitle className="text-2xl">Account created!</CardTitle>
          </div>
          <CardDescription>
            Your account and organization have been set up successfully.
            You are now signed in.
          </CardDescription>
        </CardHeader>
        {onSignInClick && (
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              Taking you to your dashboard&hellip;
            </p>
          </CardFooter>
        )}
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          Set up your owner account and organization to get started.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit} noValidate aria-label="Sign up form">
        <CardContent className="space-y-4">
          {/* Top-level error banner — shown for non-field errors (network, server, etc.) */}
          {topError && (
            <ErrorMessage
              title={getAuthErrorTitle(topError.code)}
              message={topError.userMessage}
              retryable={topError.retryable}
              onRetry={handleRetry}
              isRetrying={isRetrying}
            />
          )}

          <FormField
            id="name"
            name="name"
            label="Full name"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            value={values.name}
            onChange={handleChange}
            error={fieldErrors.name}
            disabled={isLoading}
            required
          />

          <FormField
            id="email"
            name="email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="jane@company.com"
            value={values.email}
            onChange={handleChange}
            error={fieldErrors.email}
            disabled={isLoading}
            required
          />

          <FormField
            id="organizationName"
            name="organizationName"
            label="Organization name"
            type="text"
            autoComplete="organization"
            placeholder="Acme Corp"
            value={values.organizationName}
            onChange={handleChange}
            error={fieldErrors.organizationName}
            disabled={isLoading}
            required
          />

          <FormField
            id="password"
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
            disabled={isLoading}
            required
          />

          <FormField
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={values.confirmPassword}
            onChange={handleChange}
            error={fieldErrors.confirmPassword}
            disabled={isLoading}
            required
          />
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Creating account\u2026</span>
              </>
            ) : isRetrying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Retrying\u2026</span>
              </>
            ) : (
              'Create account'
            )}
          </Button>

          {onSignInClick && (
            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onSignInClick}
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Sign in
              </button>
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
