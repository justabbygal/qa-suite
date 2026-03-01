/**
 * Custom error types for the user management system.
 *
 * Every public API route catches these errors and converts them into a
 * consistent JSON response via `toApiResponse()`. Unknown errors are wrapped
 * by `toUserError()` so callers always get a typed UserError back.
 */

export enum UserErrorCode {
  USER_NOT_FOUND = "USER_NOT_FOUND",
  SELF_REMOVAL = "SELF_REMOVAL",
  SELF_ROLE_CHANGE = "SELF_ROLE_CHANGE",
  INVALID_ROLE = "INVALID_ROLE",
  INVALID_REQUEST = "INVALID_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  DATABASE_ERROR = "DATABASE_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/** Shape returned by every error response from the user management API. */
export interface ApiErrorResponse {
  error: {
    code: UserErrorCode;
    /** Internal message suitable for logs */
    message: string;
    /** Human-readable message to display in the UI */
    userMessage: string;
    /** Whether the client should retry the request */
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export class UserError extends Error {
  public readonly code: UserErrorCode;
  public readonly httpStatus: number;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor({
    code,
    message,
    userMessage,
    httpStatus,
    retryable = false,
    details,
  }: {
    code: UserErrorCode;
    message: string;
    userMessage: string;
    httpStatus: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(message);
    this.name = "UserError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.userMessage = userMessage;
    this.retryable = retryable;
    this.details = details;

    // Maintain proper prototype chain in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toApiResponse(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        userMessage: this.userMessage,
        retryable: this.retryable,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Concrete error classes
// ---------------------------------------------------------------------------

export class UnauthorizedError extends UserError {
  constructor() {
    super({
      code: UserErrorCode.UNAUTHORIZED,
      message: "Authentication required",
      userMessage: "You must be signed in to perform this action.",
      httpStatus: 401,
      retryable: false,
    });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends UserError {
  constructor(message = "Insufficient permissions") {
    super({
      code: UserErrorCode.FORBIDDEN,
      message,
      userMessage: message,
      httpStatus: 403,
      retryable: false,
    });
    this.name = "ForbiddenError";
  }
}

export class UserNotFoundError extends UserError {
  constructor(userId?: string) {
    super({
      code: UserErrorCode.USER_NOT_FOUND,
      message: `User not found${userId ? `: ${userId}` : ""}`,
      userMessage: "This user could not be found in your organization.",
      httpStatus: 404,
      retryable: false,
      details: userId ? { userId } : undefined,
    });
    this.name = "UserNotFoundError";
  }
}

export class SelfRemovalError extends UserError {
  constructor() {
    super({
      code: UserErrorCode.SELF_REMOVAL,
      message: "Users cannot remove themselves from the organization",
      userMessage: "You cannot remove yourself from the organization.",
      httpStatus: 403,
      retryable: false,
    });
    this.name = "SelfRemovalError";
  }
}

export class SelfRoleChangeError extends UserError {
  constructor() {
    super({
      code: UserErrorCode.SELF_ROLE_CHANGE,
      message: "Users cannot change their own role",
      userMessage: "You cannot change your own role.",
      httpStatus: 403,
      retryable: false,
    });
    this.name = "SelfRoleChangeError";
  }
}

export class InvalidRoleError extends UserError {
  constructor(role: string) {
    super({
      code: UserErrorCode.INVALID_ROLE,
      message: `Invalid role: ${role}`,
      userMessage: `"${role}" is not a valid role. Allowed roles are: Owner, Admin, User.`,
      httpStatus: 400,
      retryable: false,
      details: { role },
    });
    this.name = "InvalidRoleError";
  }
}

export class DatabaseError extends UserError {
  constructor(operation: string, cause?: Error) {
    super({
      code: UserErrorCode.DATABASE_ERROR,
      message: `Database error during ${operation}${cause ? `: ${cause.message}` : ""}`,
      userMessage: "A database error occurred. Please try again in a moment.",
      httpStatus: 503,
      retryable: true,
      details: { operation, cause: cause?.message },
    });
    this.name = "DatabaseError";
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Wrap any unknown thrown value in a UserError so every catch block
 * can safely call `.toApiResponse()` and `.httpStatus`.
 */
export function toUserError(error: unknown): UserError {
  if (error instanceof UserError) return error;

  if (error instanceof Error) {
    return new UserError({
      code: UserErrorCode.INTERNAL_ERROR,
      message: error.message,
      userMessage: "An unexpected error occurred. Please try again.",
      httpStatus: 500,
      retryable: false,
    });
  }

  return new UserError({
    code: UserErrorCode.INTERNAL_ERROR,
    message: "Unknown error occurred",
    userMessage: "An unexpected error occurred. Please try again.",
    httpStatus: 500,
    retryable: false,
  });
}
