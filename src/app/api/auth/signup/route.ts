/**
 * POST /api/auth/signup
 *
 * Creates an owner account and bootstraps their organization in a single
 * logical transaction with rollback on failure.
 *
 * Request body (JSON):
 *   name            string  – owner's full name
 *   email           string  – owner's email address
 *   password        string  – password (≥8 chars)
 *   organizationName string – organization display name (≥2 chars)
 *
 * Success (201):
 *   { data: { userId, organizationId } }
 *
 * Errors follow the SignupApiErrorBody shape consumed by parseSignupApiError:
 *   { error: { code, userMessage, retryable, details?: { fields? } } }
 */

import { NextRequest, NextResponse } from "next/server";
import { performSignup, SignupError } from "@/lib/auth/signup";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

interface ValidatedInput {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}

interface FieldValidationError {
  field: string;
  message: string;
}

function validateInput(body: Record<string, unknown>): {
  valid: true;
  input: ValidatedInput;
} | {
  valid: false;
  fieldErrors: FieldValidationError[];
} {
  const fieldErrors: FieldValidationError[] = [];

  const name =
    typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password =
    typeof body.password === "string" ? body.password : "";
  const organizationName =
    typeof body.organizationName === "string"
      ? body.organizationName.trim()
      : "";

  if (!name) {
    fieldErrors.push({ field: "name", message: "Full name is required." });
  }

  if (!email) {
    fieldErrors.push({ field: "email", message: "Email address is required." });
  } else if (!EMAIL_RE.test(email)) {
    fieldErrors.push({
      field: "email",
      message: "Please enter a valid email address.",
    });
  }

  if (!organizationName) {
    fieldErrors.push({
      field: "organizationName",
      message: "Organization name is required.",
    });
  } else if (organizationName.length < 2) {
    fieldErrors.push({
      field: "organizationName",
      message: "Organization name must be at least 2 characters.",
    });
  }

  if (!password) {
    fieldErrors.push({ field: "password", message: "Password is required." });
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    fieldErrors.push({
      field: "password",
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    });
  }

  if (fieldErrors.length > 0) {
    return { valid: false, fieldErrors };
  }

  return {
    valid: true,
    input: { name, email, password, organizationName },
  };
}

// ---------------------------------------------------------------------------
// HTTP status mapping for signup error codes
// ---------------------------------------------------------------------------

const HTTP_STATUS_MAP: Record<string, number> = {
  DUPLICATE_EMAIL: 409,
  DUPLICATE_ORG: 409,
  VALIDATION_ERROR: 400,
  DATABASE_ERROR: 503,
  INTERNAL_ERROR: 500,
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          userMessage: "The request body is invalid.",
          retryable: false,
        },
      },
      { status: 400 }
    );
  }

  // Server-side validation
  const validation = validateInput(body);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          userMessage: "Please review the highlighted fields and try again.",
          retryable: false,
          details: { fields: validation.fieldErrors },
        },
      },
      { status: 400 }
    );
  }

  // Execute signup transaction
  try {
    const result = await performSignup(validation.input);

    return NextResponse.json(
      {
        data: {
          userId: result.userId,
          organizationId: result.organizationId,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof SignupError) {
      const status = HTTP_STATUS_MAP[err.code] ?? 500;
      return NextResponse.json(
        {
          error: {
            code: err.code,
            userMessage: err.userMessage,
            retryable: err.retryable,
            ...(err.fieldErrors?.length
              ? { details: { fields: err.fieldErrors } }
              : {}),
          },
        },
        { status }
      );
    }

    // Unexpected error — log and return generic message
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: "auth-signup",
        event: "unhandled_error",
        error: err instanceof Error ? err.message : String(err),
      })
    );

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          userMessage: "An unexpected error occurred. Please try again.",
          retryable: true,
        },
      },
      { status: 500 }
    );
  }
}
