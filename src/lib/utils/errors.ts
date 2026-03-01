/**
 * Auth-specific error utilities for the owner account creation / signup flow.
 *
 * Provides a structured AuthError type, an API response parser, safe error
 * logging, and mapping from raw API codes to user-facing messages.
 *
 * Follows the same patterns as lib/errors/invite-errors.ts — every caught
 * value is converted to an AuthError so callers always have a typed shape.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthErrorCode =
  | 'DUPLICATE_EMAIL'
  | 'DUPLICATE_ORG'
  | 'INVALID_INPUT'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'DATABASE_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNKNOWN';

/** Field-level validation error returned by the server. */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Normalized error shape used throughout the signup flow.
 * Safe to surface directly to the UI — never contains stack traces
 * or internal details.
 */
export interface AuthError {
  code: AuthErrorCode;
  /** Human-readable message safe to display in the UI. */
  userMessage: string;
  /** Whether this error is transient and worth retrying. */
  retryable: boolean;
  /** Seconds until the user may retry (rate limit errors only). */
  retryAfter?: number;
  /** Per-field validation errors from the server, if any. */
  fieldErrors?: FieldError[];
}

// ---------------------------------------------------------------------------
// User-facing messages
// ---------------------------------------------------------------------------

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  DUPLICATE_EMAIL:
    'An account with this email address already exists. Please sign in or use a different email.',
  DUPLICATE_ORG:
    'An organization with this name already exists. Please choose a different name.',
  INVALID_INPUT: 'Please review the highlighted fields and try again.',
  NETWORK_ERROR:
    'Unable to connect. Please check your internet connection and try again.',
  SERVER_ERROR: 'Something went wrong on our end. Please try again in a moment.',
  DATABASE_ERROR:
    "We're having trouble completing your request. Please try again in a moment.",
  RATE_LIMIT_EXCEEDED: 'Too many attempts. Please wait a moment before trying again.',
  UNKNOWN: 'An unexpected error occurred. Please try again or contact support.',
};

const AUTH_ERROR_TITLES: Record<AuthErrorCode, string> = {
  DUPLICATE_EMAIL: 'Email already in use',
  DUPLICATE_ORG: 'Organization name taken',
  INVALID_INPUT: 'Invalid input',
  NETWORK_ERROR: 'Connection problem',
  SERVER_ERROR: 'Service error',
  DATABASE_ERROR: 'Service unavailable',
  RATE_LIMIT_EXCEEDED: 'Too many attempts',
  UNKNOWN: 'Something went wrong',
};

export function getAuthErrorMessage(code: AuthErrorCode): string {
  return AUTH_ERROR_MESSAGES[code];
}

export function getAuthErrorTitle(code: AuthErrorCode): string {
  return AUTH_ERROR_TITLES[code];
}

// ---------------------------------------------------------------------------
// API error response shape (mirrors ApiErrorResponse in invite-errors.ts)
// ---------------------------------------------------------------------------

interface SignupApiErrorBody {
  error: {
    code: string;
    userMessage?: string;
    message?: string;
    retryable?: boolean;
    retryAfter?: number;
    details?: {
      fields?: FieldError[];
      [key: string]: unknown;
    };
  };
}

function isSignupApiErrorBody(value: unknown): value is SignupApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as SignupApiErrorBody).error === 'object' &&
    (value as SignupApiErrorBody).error !== null &&
    typeof (value as SignupApiErrorBody).error.code === 'string'
  );
}

/**
 * Maps raw API error codes to the canonical AuthErrorCode.
 * Unknown codes fall through to 'UNKNOWN'.
 */
function mapApiCodeToAuthCode(code: string): AuthErrorCode {
  const codeMap: Record<string, AuthErrorCode> = {
    DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
    DUPLICATE_ORG: 'DUPLICATE_ORG',
    INVALID_REQUEST: 'INVALID_INPUT',
    INVALID_EMAIL: 'INVALID_INPUT',
    VALIDATION_ERROR: 'INVALID_INPUT',
    DATABASE_ERROR: 'DATABASE_ERROR',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    INTERNAL_ERROR: 'SERVER_ERROR',
    SERVER_ERROR: 'SERVER_ERROR',
  };
  return codeMap[code] ?? 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a failed fetch Response from the signup API into an AuthError.
 * Always resolves — network errors should be caught before calling this.
 */
export async function parseSignupApiError(response: Response): Promise<AuthError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Framework error page or non-JSON body
    const code: AuthErrorCode = response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN';
    return {
      code,
      userMessage: getAuthErrorMessage(code),
      retryable: response.status >= 500,
    };
  }

  if (isSignupApiErrorBody(body)) {
    const { code: rawCode, userMessage, retryable, retryAfter, details } = body.error;
    const code = mapApiCodeToAuthCode(rawCode);
    const isRetryable =
      retryable ?? (code === 'SERVER_ERROR' || code === 'DATABASE_ERROR');

    return {
      code,
      userMessage: userMessage ?? getAuthErrorMessage(code),
      retryable: isRetryable,
      retryAfter,
      fieldErrors: details?.fields,
    };
  }

  const code: AuthErrorCode = response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN';
  return {
    code,
    userMessage: getAuthErrorMessage(code),
    retryable: response.status >= 500,
  };
}

/**
 * Converts any thrown value into an AuthError.
 * Use this in catch blocks to guarantee a consistent error shape.
 */
export function toAuthError(error: unknown): AuthError {
  if (isAuthError(error)) return error;

  if (
    error instanceof TypeError &&
    (error.message.includes('fetch') || error.message.includes('network'))
  ) {
    return {
      code: 'NETWORK_ERROR',
      userMessage: getAuthErrorMessage('NETWORK_ERROR'),
      retryable: true,
    };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('offline')
    ) {
      return {
        code: 'NETWORK_ERROR',
        userMessage: getAuthErrorMessage('NETWORK_ERROR'),
        retryable: true,
      };
    }
  }

  return {
    code: 'UNKNOWN',
    userMessage: getAuthErrorMessage('UNKNOWN'),
    retryable: false,
  };
}

/** Type guard for AuthError objects. */
export function isAuthError(value: unknown): value is AuthError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'userMessage' in value &&
    'retryable' in value
  );
}

/**
 * Logs an auth error for server-side debugging, stripping any data that
 * could contain PII. Replace `console.error` with your logging service
 * in production.
 */
export function logAuthError(context: string, error: unknown): void {
  const safeError = isAuthError(error)
    ? { code: error.code, retryable: error.retryable }
    : error instanceof Error
      ? { name: error.name, message: error.message }
      : { raw: typeof error };

  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: 'auth-signup',
      context,
      error: safeError,
    })
  );
}
