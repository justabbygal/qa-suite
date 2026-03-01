/**
 * POST /api/invites  — create a new invitation
 * GET  /api/invites  — list invitations for the caller's organisation
 *
 * Auth is expected to be resolved by the Better Auth middleware and forwarded
 * as request headers:
 *   Authorization: Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 *
 * Rate limits (per authenticated user, sliding window):
 *   POST — 10 invites per hour
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkRateLimit,
  getRateLimitHeaders,
  INVITE_RATE_LIMIT,
} from "@/lib/rate-limit";
import {
  InviteError,
  RateLimitError,
  InvalidEmailError,
  InvalidRoleError,
  UnauthorizedError,
  ForbiddenError,
  toInviteError,
} from "@/lib/errors/invite-errors";
import { inviteMonitor } from "@/lib/invite-monitor";
import { withRetry } from "@/lib/email/retry";
import { logAuditEventFireAndForget } from "@/lib/audit/logger";
import {
  VALID_ROLES,
  EMAIL_REGEX,
  type InviteRole,
  createInvite,
  listInvitesByOrg,
  sendInviteEmail,
} from "@/lib/invites";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// POST /api/invites
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth check
    const authHeader = request.headers.get("authorization");
    const userId = request.headers.get("x-user-id");
    const organizationId = request.headers.get("x-organization-id");
    const userRole = request.headers.get("x-user-role");

    if (!authHeader?.startsWith("Bearer ") || !userId || !organizationId) {
      throw new UnauthorizedError();
    }

    // Only Owners and Admins may create invitations
    if (!userRole || !["Owner", "Admin"].includes(userRole)) {
      throw new ForbiddenError();
    }

    // Per-user rate limiting
    const rlResult = checkRateLimit(`invite:${userId}`, INVITE_RATE_LIMIT);
    const rlHeaders = getRateLimitHeaders(rlResult, INVITE_RATE_LIMIT);

    if (!rlResult.allowed) {
      inviteMonitor.recordRateLimitHit(userId);
      throw new RateLimitError(rlResult.retryAfter!);
    }

    // Parse body
    let body: { email?: unknown; role?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Request body must be valid JSON",
            userMessage: "The request body is invalid. Please check your input.",
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
    const rawRole = typeof body.role === "string" ? body.role.trim() : "";

    if (!rawEmail || !rawRole) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing required fields: email, role",
            userMessage: "Please provide both an email address and a role.",
            retryable: false,
          },
        },
        { status: 400, headers: rlHeaders }
      );
    }

    // Validate inputs
    if (!EMAIL_REGEX.test(rawEmail)) throw new InvalidEmailError(rawEmail);
    if (!VALID_ROLES.includes(rawRole as InviteRole)) {
      throw new InvalidRoleError(rawRole);
    }

    const email = rawEmail.toLowerCase();
    const role = rawRole as InviteRole;

    // Admins cannot invite Owners
    if (userRole === "Admin" && role === "Owner") {
      throw new ForbiddenError();
    }

    const supabase = getSupabaseAdmin();

    // Create the invite record
    const invite = await createInvite(supabase, {
      organizationId,
      email,
      role,
      invitedBy: userId,
    });

    // Send email with exponential-backoff retry
    const emailResult = await withRetry(
      () => sendInviteEmail(email, invite.token, userId),
      { maxAttempts: 3, initialDelayMs: 1_000, maxDelayMs: 10_000 }
    );

    if (emailResult.success) {
      inviteMonitor.recordEmailSent();
    } else {
      const errMsg = emailResult.error?.message ?? "unknown";
      inviteMonitor.recordEmailFailed(errMsg);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "invite-email",
          event: "all_retries_failed",
          email,
          attempts: emailResult.attempts,
          error: errMsg,
        })
      );
    }

    inviteMonitor.recordInviteSent();

    // Audit log — actor_email/actor_name use userId as placeholder until
    // the Better Auth middleware injects the full user profile into headers.
    logAuditEventFireAndForget({
      organization_id: organizationId,
      actor_id: userId,
      actor_email: userId,
      actor_name: userId,
      action: "invite.create",
      resource_type: "invitation",
      resource_id: invite.id,
      resource_name: invite.email,
      changes: null,
      ip_address:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        null,
      user_agent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json(
      {
        data: {
          invite: {
            id: invite.id,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expires_at,
            createdAt: invite.created_at,
          },
          emailSent: emailResult.success,
          ...(!emailResult.success && {
            warning:
              "Invitation created but the email could not be sent. Share the invite link directly if needed.",
          }),
        },
      },
      { status: 201, headers: rlHeaders }
    );
  } catch (error) {
    const ie = toInviteError(error);

    if (!(error instanceof InviteError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "invites-api",
          event: "unhandled_error",
          error: ie.message,
        })
      );
    }

    if (!(error instanceof RateLimitError)) {
      inviteMonitor.recordInviteFailed(ie.code);
    }

    return NextResponse.json(ie.toApiResponse(), {
      status: ie.httpStatus,
      ...(ie.retryAfter !== undefined && {
        headers: { "Retry-After": ie.retryAfter.toString() },
      }),
    });
  }
}

// ---------------------------------------------------------------------------
// GET /api/invites
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const organizationId = request.headers.get("x-organization-id");

    if (!authHeader?.startsWith("Bearer ") || !organizationId) {
      throw new UnauthorizedError();
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status"); // pending | accepted | expired

    const invites = await listInvitesByOrg(supabase, { organizationId, status });

    return NextResponse.json({ data: { invites } });
  } catch (error) {
    const ie = toInviteError(error);

    if (!(error instanceof InviteError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "invites-api",
          event: "list_error",
          error: ie.message,
        })
      );
    }

    return NextResponse.json(ie.toApiResponse(), { status: ie.httpStatus });
  }
}
