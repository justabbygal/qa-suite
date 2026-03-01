/**
 * POST /api/invites/accept
 *
 * Token-only invite acceptance endpoint. This is the route called when a user
 * clicks the link from their invitation email (format: /invite/{token}).
 *
 * Unlike POST /api/invites/[id]/accept, this endpoint requires only the
 * invitation token — no invite ID is needed. This matches the URL pattern
 * used in email links where the token alone is the credential.
 *
 * Body: { token: string }
 *
 * This endpoint is public (no auth header required). On success, the caller
 * receives the invite data needed for Better Auth to complete account creation
 * and organisation membership assignment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  InviteError,
  toInviteError,
} from "@/lib/errors/invite-errors";
import { inviteMonitor } from "@/lib/invite-monitor";
import { logAuditEventFireAndForget } from "@/lib/audit/logger";
import { acceptInviteByToken } from "@/lib/invites";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse body
    let body: { token?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Request body must be valid JSON",
            userMessage: "The request body is invalid.",
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing required field: token",
            userMessage:
              "An invitation token is required to accept this invitation.",
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const result = await acceptInviteByToken(supabase, { token });

    inviteMonitor.recordInviteAccepted();

    // Audit log — actor is the invitee (pre-registration, use email as identifier).
    // Once Better Auth creates the user account, the actor_id should be updated
    // to reference the actual user record.
    logAuditEventFireAndForget({
      organization_id: result.organizationId,
      actor_id: result.email,
      actor_email: result.email,
      actor_name: result.email,
      action: "invite.accept",
      resource_type: "invitation",
      resource_id: result.inviteId,
      resource_name: result.email,
      changes: null,
      ip_address:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        null,
      user_agent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({
      data: {
        message: "Invitation accepted successfully.",
        invite: {
          email: result.email,
          role: result.role,
          organizationId: result.organizationId,
        },
      },
    });
  } catch (error) {
    const ie = toInviteError(error);

    if (!(error instanceof InviteError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "invites-api",
          event: "accept_error",
          error: ie.message,
        })
      );
      inviteMonitor.recordInviteFailed("accept_error");
    }

    return NextResponse.json(ie.toApiResponse(), { status: ie.httpStatus });
  }
}
