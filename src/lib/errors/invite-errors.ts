/**
 * Custom error types for the invite system.
 *
 * Every public API route catches these errors and converts them into a
 * consistent JSON response via `toApiResponse()`. Unknown errors are wrapped
 * by `toInviteError()` so callers always get a typed InviteError back.
 */

export enum InviteErrorCode {
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INVITE_NOT_FOUND = "INVITE_NOT_FOUND",
  INVITE_EXPIRED = "INVITE_EXPIRED",
  INVITE_ALREADY_USED = "INVITE_ALREADY_USED",
  INVITE_ALREADY_EXISTS = "INVITE_ALREADY_EXISTS",
  EMAIL_SEND_FAILED = "EMAIL_SEND_FAILED",
  EMAIL_SERVICE_UNAVAILABLE = "EMAIL_SERVICE_UNAVAILABLE",
  INVALID_EMAIL = "INVALID_EMAIL",
  INVALID_ROLE = "INVALID_ROLE",
  INVALID_REQUEST = "INVALID_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  DATABASE_ERROR = "DATABASE_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/** Shape returned by every error response from the invite API. */
export interface ApiErrorResponse {
  error: {
    code: InviteErrorCode;
    /** Internal message suitable for logs */
    message: string;
    /** Human-readable message to display in the UI */
    userMessage: string;
    /** Whether the client should retry the request */
    retryable: boolean;
    /** Seconds until the client may retry (only present when retryable) */
    retryAfter?: number;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export class InviteError extends Error {
  public readonly code: InviteErrorCode;
  public readonly httpStatus: number;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly retryAfter?: number;
  public readonly details?: Record<string, unknown>;

  constructor({
    code,
    message,
    userMessage,
    httpStatus,
    retryable = false,
    retryAfter,
    details,
  }: {
    code: InviteErrorCode;
    message: string;
    userMessage: string;
    httpStatus: number;
    retryable?: boolean;
    retryAfter?: number;
    details?: Record<string, unknown>;
  }) {
    super(message);
    this.name = "InviteError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.userMessage = userMessage;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
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
        ...(this.retryAfter !== undefined && { retryAfter: this.retryAfter }),
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Concrete error classes
// ---------------------------------------------------------------------------

export class RateLimitError extends InviteError {
  constructor(retryAfter: number) {
    const minutes = Math.ceil(retryAfter / 60);
    super({
      code: InviteErrorCode.RATE_LIMIT_EXCEEDED,
      message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      userMessage: `You've sent too many invitations. Please wait ${minutes} minute${minutes !== 1 ? "s" : ""} before sending more.`,
      httpStatus: 429,
      retryable: true,
      retryAfter,
    });
    this.name = "RateLimitError";
  }
}

export class InviteNotFoundError extends InviteError {
  constructor(inviteId?: string) {
    super({
      code: InviteErrorCode.INVITE_NOT_FOUND,
      message: `Invite not found${inviteId ? `: ${inviteId}` : ""}`,
      userMessage:
        "This invitation could not be found. It may have been cancelled or never existed.",
      httpStatus: 404,
      retryable: false,
    });
    this.name = "InviteNotFoundError";
  }
}

export class InviteExpiredError extends InviteError {
  constructor() {
    super({
      code: InviteErrorCode.INVITE_EXPIRED,
      message: "Invite has expired",
      userMessage:
        "This invitation has expired. Please ask the admin to send a new invitation.",
      httpStatus: 410,
      retryable: false,
    });
    this.name = "InviteExpiredError";
  }
}

export class InviteAlreadyUsedError extends InviteError {
  constructor() {
    super({
      code: InviteErrorCode.INVITE_ALREADY_USED,
      message: "Invite has already been used",
      userMessage:
        "This invitation has already been accepted. Please sign in or contact support.",
      httpStatus: 409,
      retryable: false,
    });
    this.name = "InviteAlreadyUsedError";
  }
}

export class InviteAlreadyExistsError extends InviteError {
  constructor(email: string) {
    super({
      code: InviteErrorCode.INVITE_ALREADY_EXISTS,
      message: `An active invitation already exists for ${email}`,
      userMessage: `An invitation has already been sent to ${email}. Please wait for them to accept or cancel the existing invitation.`,
      httpStatus: 409,
      retryable: false,
      details: { email },
    });
    this.name = "InviteAlreadyExistsError";
  }
}

export class EmailSendError extends InviteError {
  constructor(email: string, cause?: Error) {
    super({
      code: InviteErrorCode.EMAIL_SEND_FAILED,
      message: `Failed to send invite email to ${email}${cause ? `: ${cause.message}` : ""}`,
      userMessage:
        "The invitation was created but the email could not be sent. Please try resending or share the invite link directly.",
      httpStatus: 502,
      retryable: true,
      details: { email, cause: cause?.message },
    });
    this.name = "EmailSendError";
  }
}

export class EmailServiceUnavailableError extends InviteError {
  constructor() {
    super({
      code: InviteErrorCode.EMAIL_SERVICE_UNAVAILABLE,
      message: "Email service is currently unavailable",
      userMessage:
        "The email service is temporarily unavailable. Your invitation has been saved and will be sent when the service recovers. You can also share the invite link directly.",
      httpStatus: 503,
      retryable: true,
    });
    this.name = "EmailServiceUnavailableError";
  }
}

export class InvalidEmailError extends InviteError {
  constructor(email: string) {
    super({
      code: InviteErrorCode.INVALID_EMAIL,
      message: `Invalid email address: ${email}`,
      userMessage: `"${email}" is not a valid email address. Please check and try again.`,
      httpStatus: 400,
      retryable: false,
      details: { email },
    });
    this.name = "InvalidEmailError";
  }
}

export class InvalidRoleError extends InviteError {
  constructor(role: string) {
    super({
      code: InviteErrorCode.INVALID_ROLE,
      message: `Invalid role: ${role}`,
      userMessage: `"${role}" is not a valid role. Allowed roles are: Owner, Admin, User.`,
      httpStatus: 400,
      retryable: false,
      details: { role },
    });
    this.name = "InvalidRoleError";
  }
}

export class UnauthorizedError extends InviteError {
  constructor() {
    super({
      code: InviteErrorCode.UNAUTHORIZED,
      message: "Authentication required",
      userMessage: "You must be signed in to perform this action.",
      httpStatus: 401,
      retryable: false,
    });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends InviteError {
  constructor() {
    super({
      code: InviteErrorCode.FORBIDDEN,
      message: "Insufficient permissions",
      userMessage: "You do not have permission to manage invitations.",
      httpStatus: 403,
      retryable: false,
    });
    this.name = "ForbiddenError";
  }
}

export class DatabaseError extends InviteError {
  constructor(operation: string, cause?: Error) {
    super({
      code: InviteErrorCode.DATABASE_ERROR,
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
 * Wrap any unknown thrown value in an InviteError so every catch block
 * can safely call `.toApiResponse()` and `.httpStatus`.
 */
export function toInviteError(error: unknown): InviteError {
  if (error instanceof InviteError) return error;

  if (error instanceof Error) {
    return new InviteError({
      code: InviteErrorCode.INTERNAL_ERROR,
      message: error.message,
      userMessage: "An unexpected error occurred. Please try again.",
      httpStatus: 500,
      retryable: false,
    });
  }

  return new InviteError({
    code: InviteErrorCode.INTERNAL_ERROR,
    message: "Unknown error occurred",
    userMessage: "An unexpected error occurred. Please try again.",
    httpStatus: 500,
    retryable: false,
  });
}
