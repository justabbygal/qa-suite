/**
 * POST /api/auth/signup
 *
 * Creates a new owner account and bootstraps the organization.
 *
 * Request body:
 *   { name, email, password, organizationName }
 *
 * Success response (201):
 *   { data: { userId, organizationId, role, name, email } }
 *
 * Error response shape matches SignupApiErrorBody in lib/utils/errors.ts so
 * the SignupForm's parseSignupApiError() can handle all error cases.
 *
 * Rate limiting: 5 signups per hour per IP (in-memory, resets on cold start).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

/** 5 signups per IP per hour — generous enough for legitimate use. */
const SIGNUP_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

function errorResponse(
  code: string,
  userMessage: string,
  httpStatus: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, userMessage, retryable: httpStatus >= 500, ...extra } },
    { status: httpStatus },
  );
}

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Rate limiting (IP-based — no user session exists yet at signup) ---
  const ip = getClientIp(request);
  const rl = checkRateLimit(`signup:${ip}`, SIGNUP_RATE_LIMIT);
  const rlHeaders = getRateLimitHeaders(rl, SIGNUP_RATE_LIMIT);

  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          userMessage: 'Too many signup attempts. Please wait a moment before trying again.',
          retryable: true,
          retryAfter: rl.retryAfter,
        },
      },
      { status: 429, headers: rlHeaders },
    );
  }

  // --- Parse body ---
  let body: {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    organizationName?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'Request body must be valid JSON.', 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const organizationName =
    typeof body.organizationName === 'string' ? body.organizationName.trim() : '';

  // --- Server-side validation (mirrors client-side rules) ---
  const fieldErrors: { field: string; message: string }[] = [];

  if (!name) {
    fieldErrors.push({ field: 'name', message: 'Full name is required.' });
  }
  if (!email) {
    fieldErrors.push({ field: 'email', message: 'Email address is required.' });
  } else if (!EMAIL_RE.test(email)) {
    fieldErrors.push({ field: 'email', message: 'Please enter a valid email address.' });
  }
  if (!organizationName) {
    fieldErrors.push({ field: 'organizationName', message: 'Organization name is required.' });
  } else if (organizationName.length < 2) {
    fieldErrors.push({
      field: 'organizationName',
      message: 'Organization name must be at least 2 characters.',
    });
  }
  if (!password) {
    fieldErrors.push({ field: 'password', message: 'Password is required.' });
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    fieldErrors.push({
      field: 'password',
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    });
  }

  if (fieldErrors.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          userMessage: 'Please review the highlighted fields and try again.',
          retryable: false,
          details: { fields: fieldErrors },
        },
      },
      { status: 400, headers: rlHeaders },
    );
  }

  const supabase = getSupabaseAdmin();

  // --- Check for duplicate organization name ---
  const { data: existingOrg, error: orgCheckErr } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', organizationName)
    .maybeSingle();

  if (orgCheckErr) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'auth-signup',
        event: 'org_check_failed',
        error: orgCheckErr.message,
      }),
    );
    return errorResponse(
      'DATABASE_ERROR',
      "We're having trouble processing your request. Please try again in a moment.",
      503,
    );
  }

  if (existingOrg) {
    return NextResponse.json(
      {
        error: {
          code: 'DUPLICATE_ORG',
          userMessage:
            'An organization with this name already exists. Please choose a different name.',
          retryable: false,
        },
      },
      { status: 409, headers: rlHeaders },
    );
  }

  // --- Create Supabase auth user ---
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Owner accounts skip email verification
    user_metadata: { name },
  });

  if (authError || !authData.user) {
    // Supabase returns a descriptive message when the email is already registered
    const msg = authError?.message?.toLowerCase() ?? '';
    const isDuplicate =
      msg.includes('already registered') ||
      msg.includes('already exists') ||
      msg.includes('duplicate');

    if (isDuplicate) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_EMAIL',
            userMessage:
              'An account with this email already exists. Please sign in or use a different email.',
            retryable: false,
          },
        },
        { status: 409, headers: rlHeaders },
      );
    }

    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'auth-signup',
        event: 'create_user_failed',
        error: authError?.message,
      }),
    );
    return errorResponse(
      'DATABASE_ERROR',
      "We're having trouble creating your account. Please try again in a moment.",
      503,
    );
  }

  const userId = authData.user.id;

  // --- Create organization ---
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: organizationName, owner_id: userId })
    .select('id')
    .single();

  if (orgError || !org) {
    // Roll back: delete auth user (best-effort)
    await supabase.auth.admin.deleteUser(userId).catch((err: unknown) =>
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: 'auth-signup',
          event: 'rollback_user_delete_failed',
          userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    );

    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'auth-signup',
        event: 'create_org_failed',
        userId,
        error: orgError?.message,
      }),
    );
    return errorResponse(
      'DATABASE_ERROR',
      "We're having trouble setting up your organization. Please try again.",
      503,
    );
  }

  const organizationId = org.id;

  // --- Create owner profile ---
  const { error: profileError } = await supabase.from('profiles').insert({
    user_id: userId,
    organization_id: organizationId,
    name,
    email,
    role: 'owner',
  });

  if (profileError) {
    // Roll back: delete org and auth user (best-effort)
    await supabase.from('organizations').delete().eq('id', organizationId).catch(() => {});
    await supabase.auth.admin.deleteUser(userId).catch(() => {});

    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'auth-signup',
        event: 'create_profile_failed',
        userId,
        organizationId,
        error: profileError.message,
      }),
    );
    return errorResponse(
      'DATABASE_ERROR',
      "We're having trouble completing your signup. Please try again.",
      503,
    );
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: 'auth-signup',
      event: 'signup_success',
      userId,
      organizationId,
    }),
  );

  return NextResponse.json(
    {
      data: {
        userId,
        organizationId,
        role: 'Owner',
        name,
        email,
      },
    },
    { status: 201, headers: rlHeaders },
  );
}
