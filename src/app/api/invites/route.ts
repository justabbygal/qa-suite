/**
 * POST /api/invites  — create a new invitation
 * GET  /api/invites  — list invitations for the caller's organisation
 *
 * Auth is expected to be resolved by the Better Auth middleware (not yet wired)
 * and forwarded as request headers:
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
  InviteErrorCode,
  RateLimitError,
  InviteAlreadyExistsError,
  InvalidEmailError,
  InvalidRoleError,
  UnauthorizedError,
  DatabaseError,
  toInviteError,
} from "@/lib/errors/invite-errors";
import { inviteMonitor } from "@/lib/invite-monitor";
import { withRetry } from "@/lib/email/retry";
import { checkCanManageInvite } from "@/lib/services/admin-restrictions";
import type { Role } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ROLES = ["Owner", "Admin", "User"] as const;
type InviteRole = (typeof VALID_ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INVITE_EXPIRY_DAYS = 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function validateEmail(email: string): void {
  if (!EMAIL_RE.test(email)) throw new InvalidEmailError(email);
}

function validateRole(role: string): InviteRole {
  if (!VALID_ROLES.includes(role as InviteRole)) throw new InvalidRoleError(role);
  return role as InviteRole;
}

function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendInviteEmail(
  email: string,
  token: string,
  inviterName: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    // Development fallback: log the invite URL instead of sending an email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: "invite-email",
        event: "dev_fallback",
        to: email,
        inviteUrl: `${appUrl}/invite/${token}`,
        invitedBy: inviterName,
      })
    );
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "noreply@qa-suite.app",
      to: email,
      subject: `You've been invited to join QA Suite`,
      html: `<p><strong>${inviterName}</strong> has invited you to join the QA Suite workspace.</p>
             <p><a href="${appUrl}/invite/${token}">Accept invitation</a></p>
             <p>This link expires in ${INVITE_EXPIRY_DAYS} days.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
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
    const rawUserRole = request.headers.get("x-user-role");

    if (!authHeader?.startsWith("Bearer ") || !userId || !organizationId) {
      throw new UnauthorizedError();
    }

    // Only Owners and Admins may send invitations
    if (!rawUserRole || !["Owner", "Admin"].includes(rawUserRole)) {
      throw new InviteError({
        code: InviteErrorCode.FORBIDDEN,
        message: "Insufficient permissions to create invitations",
        userMessage: "You do not have permission to send invitations.",
        httpStatus: 403,
        retryable: false,
      });
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
    validateEmail(rawEmail);
    const role = validateRole(rawRole);
    const email = rawEmail.toLowerCase();

    // Enforce admin restriction: admins can only invite User-role accounts
    const actorRole = rawUserRole.toLowerCase() as Role;
    const inviteRole = role.toLowerCase() as Role;
    const inviteRestriction = checkCanManageInvite(actorRole, inviteRole);
    if (!inviteRestriction.allowed) {
      throw new InviteError({
        code: InviteErrorCode.FORBIDDEN,
        message: `Admin restriction: ${inviteRestriction.message}`,
        userMessage:
          inviteRestriction.message ??
          "You do not have permission to invite users with this role.",
        httpStatus: 403,
        retryable: false,
      });
    }

    const supabase = getSupabaseAdmin();

    // Check for an existing pending invite to the same address
    const { data: existing, error: checkErr } = await supabase
      .from("invitations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (checkErr) {
      throw new DatabaseError("check existing invite", new Error(checkErr.message));
    }
    if (existing) {
      throw new InviteAlreadyExistsError(email);
    }

    // Create the invite record
    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: invite, error: insertErr } = await supabase
      .from("invitations")
      .insert({
        organization_id: organizationId,
        email,
        role,
        invited_by: userId,
        token,
        expires_at: expiresAt,
      })
      .select("id, email, role, expires_at, created_at")
      .single();

    if (insertErr || !invite) {
      inviteMonitor.recordInviteFailed(insertErr?.message ?? "insert failed");
      throw new DatabaseError("create invite", new Error(insertErr?.message));
    }

    // Send email with exponential-backoff retry
    const emailResult = await withRetry(
      () => sendInviteEmail(email, token, userId),
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
          // Graceful degradation: inform the caller when email couldn't be sent
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

    let query = supabase
      .from("invitations")
      .select("id, email, role, invited_by, expires_at, used_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    const now = new Date().toISOString();
    if (status === "pending") {
      query = query.is("used_at", null).gt("expires_at", now);
    } else if (status === "accepted") {
      query = query.not("used_at", "is", null);
    } else if (status === "expired") {
      query = query.is("used_at", null).lt("expires_at", now);
    }

    const { data: invites, error } = await query;

    if (error) {
      throw new DatabaseError("list invites", new Error(error.message));
    }

    // Annotate each invite with a derived status field
    const now2 = new Date();
    const annotated = (invites ?? []).map((inv) => ({
      ...inv,
      status: inv.used_at
        ? "accepted"
        : new Date(inv.expires_at) < now2
          ? "expired"
          : "pending",
    }));

    return NextResponse.json({ data: { invites: annotated } });
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
