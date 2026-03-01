/**
 * POST /api/invites/[id]/resend — re-issue an invitation with a new token and extended expiry
 *
 * Required headers (injected by auth middleware):
 *   Authorization: Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 *
 * Role restrictions:
 *   Owner — may resend any pending or expired invite
 *   Admin — may only resend invites for the User role
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  InviteError,
  InviteNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  toInviteError,
} from "@/lib/errors/invite-errors";
import { inviteMonitor } from "@/lib/invite-monitor";
import { withRetry } from "@/lib/email/retry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
// POST /api/invites/[id]/resend
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const userId = request.headers.get("x-user-id");
    const organizationId = request.headers.get("x-organization-id");
    const userRole = request.headers.get("x-user-role");

    if (!authHeader?.startsWith("Bearer ") || !userId || !organizationId) {
      throw new UnauthorizedError();
    }

    // Only Owners and Admins may resend invitations
    if (!userRole || !["Owner", "Admin"].includes(userRole)) {
      throw new ForbiddenError();
    }

    const supabase = getSupabaseAdmin();

    // Fetch the invite — also needed to enforce Admin role restriction
    const { data: invite, error: fetchErr } = await supabase
      .from("invitations")
      .select("id, email, role, expires_at, used_at")
      .eq("id", params.id)
      .eq("organization_id", organizationId)
      .single();

    if (fetchErr || !invite) {
      throw new InviteNotFoundError(params.id);
    }

    // Admins cannot resend invites for Admin or Owner roles
    if (userRole === "Admin" && ["Admin", "Owner"].includes(invite.role)) {
      throw new ForbiddenError();
    }

    // Generate a new token and extend expiration 7 days from now
    const newToken = generateToken();
    const newExpiresAt = new Date(
      Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from("invitations")
      .update({ token: newToken, expires_at: newExpiresAt })
      .eq("id", params.id)
      .eq("organization_id", organizationId)
      .select("id, email, role, expires_at, created_at")
      .single();

    if (updateErr || !updated) {
      throw new DatabaseError("resend invite", new Error(updateErr?.message));
    }

    // Re-send email with exponential-backoff retry
    const emailResult = await withRetry(
      () => sendInviteEmail(invite.email, newToken, userId),
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
          event: "resend_all_retries_failed",
          email: invite.email,
          attempts: emailResult.attempts,
          error: errMsg,
        })
      );
    }

    return NextResponse.json({
      data: {
        invite: {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          expiresAt: updated.expires_at,
          createdAt: updated.created_at,
        },
        emailSent: emailResult.success,
        ...(!emailResult.success && {
          warning:
            "Invitation updated but the email could not be sent. Share the invite link directly if needed.",
        }),
      },
    });
  } catch (error) {
    const ie = toInviteError(error);

    if (!(error instanceof InviteError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "invites-api",
          event: "resend_error",
          inviteId: params.id,
          error: ie.message,
        })
      );
    }

    return NextResponse.json(ie.toApiResponse(), { status: ie.httpStatus });
  }
}
