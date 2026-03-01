/**
 * Generic API client utilities for the QA Suite.
 *
 * Provides a typed fetch wrapper with consistent error handling and a
 * `signup` convenience function for the owner account creation flow.
 *
 * Auth headers (Authorization, x-user-id, x-organization-id, x-user-role) are
 * injected by the Better Auth middleware in production. During development they
 * fall back to values stored in localStorage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    userMessage: string;
    retryable: boolean;
    retryAfter?: number;
    details?: {
      fields?: { field: string; message: string }[];
      [key: string]: unknown;
    };
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export class ApiRequestError extends Error {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly retryAfter?: number;
  public readonly httpStatus: number;

  constructor(
    response: ApiErrorResponse['error'],
    httpStatus: number,
  ) {
    super(response.userMessage);
    this.name = 'ApiRequestError';
    this.code = response.code;
    this.userMessage = response.userMessage;
    this.retryable = response.retryable;
    this.retryAfter = response.retryAfter;
    this.httpStatus = httpStatus;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Auth header helpers (dev pattern — replace with Better Auth once integrated)
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const userId = localStorage.getItem('dev_user_id');
  const organizationId = localStorage.getItem('dev_organization_id');
  const role = localStorage.getItem('dev_user_role');

  const headers: Record<string, string> = {};
  if (userId) headers['x-user-id'] = userId;
  if (organizationId) headers['x-organization-id'] = organizationId;
  if (role) headers['x-user-role'] = role;

  return headers;
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

/**
 * Typed fetch wrapper that:
 * - Merges Content-Type and dev auth headers automatically
 * - Throws ApiRequestError on non-2xx responses
 * - Throws a retryable error on network failures
 */
export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new ApiRequestError(
      {
        code: 'NETWORK_ERROR',
        userMessage: 'Unable to connect. Please check your internet connection and try again.',
        retryable: true,
      },
      0,
    );
  }

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let errorBody: ApiErrorResponse;
  try {
    errorBody = (await response.json()) as ApiErrorResponse;
  } catch {
    throw new ApiRequestError(
      {
        code: response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN',
        userMessage:
          response.status >= 500
            ? 'Something went wrong on our end. Please try again.'
            : 'An unexpected error occurred. Please try again.',
        retryable: response.status >= 500,
      },
      response.status,
    );
  }

  throw new ApiRequestError(errorBody.error, response.status);
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}

export interface SignupData {
  userId: string;
  organizationId: string;
  role: string;
  name: string;
  email: string;
}

/**
 * Creates a new owner account and organization.
 *
 * Throws ApiRequestError on failure — callers should catch and map to UI state.
 */
export async function signup(payload: SignupPayload): Promise<SignupData> {
  const { data } = await apiRequest<ApiSuccessResponse<SignupData>>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data;
}
