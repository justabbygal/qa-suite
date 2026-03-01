/**
 * POST /api/invites/[id]/accept
 *
 * Validates an invite token and marks the invitation as used.
 * This endpoint is public (no auth header required) — the token itself
 * acts as the credential.
 *
 * Body: { token: string }
 *
 * On success, the caller receives the invite's role and organization so the
 * auth layer can complete account creation / org membership.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  InviteError,
  InviteNotFoundError,
  InviteExpiredError,
  InviteAlreadyUsedError,
  DatabaseError,
  toInviteError,
} from "@/lib/errors/invite-errors";
import { inviteMonitor } from "@/lib/invite-monitor";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
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
            userMessage: "An invitation token is required to accept this invitation.",
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch the invite — deliberately avoid leaking whether the id or the
    // token is wrong by returning the same 404 in both cases.
    const { data: invite, error: fetchErr } = await supabase
      .from("invitations")
      .select("id, email, role, organization_id, expires_at, used_at, token")
      .eq("id", params.id)
      .single();

    if (fetchErr || !invite || invite.token !== token) {
      throw new InviteNotFoundError(params.id);
    }

    // Guard: already used
    if (invite.used_at) {
      throw new InviteAlreadyUsedError();
    }

    // Guard: expired
    if (new Date(invite.expires_at) < new Date()) {
      throw new InviteExpiredError();
    }

    // Mark as accepted
    const { error: updateErr } = await supabase
      .from("invitations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", params.id);

    if (updateErr) {
      throw new DatabaseError("accept invite", new Error(updateErr.message));
    }

    inviteMonitor.recordInviteAccepted();

    return NextResponse.json({
      data: {
        message: "Invitation accepted successfully.",
        invite: {
          email: invite.email,
          role: invite.role,
          organizationId: invite.organization_id,
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
          inviteId: params.id,
          error: ie.message,
        })
      );
      inviteMonitor.recordInviteFailed("accept_error");
    }

    return NextResponse.json(ie.toApiResponse(), { status: ie.httpStatus });
  }
}
