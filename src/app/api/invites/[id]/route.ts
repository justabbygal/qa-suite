/**
 * GET    /api/invites/[id]  — fetch a single invitation
 * DELETE /api/invites/[id]  — cancel (delete) an invitation
 *
 * Required headers (injected by auth middleware):
 *   Authorization: Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User   (needed for DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  InviteError,
  UnauthorizedError,
  ForbiddenError,
  toInviteError,
} from "@/lib/errors/invite-errors";
import { logAuditEventFireAndForget } from "@/lib/audit/logger";
import { cancelInvite, getInviteById } from "@/lib/invites";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// GET /api/invites/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const organizationId = request.headers.get("x-organization-id");

    if (!authHeader?.startsWith("Bearer ") || !organizationId) {
      throw new UnauthorizedError();
    }

    const supabase = getSupabaseAdmin();
    const invite = await getInviteById(supabase, {
      inviteId: params.id,
      organizationId,
    });

    return NextResponse.json({ data: { invite } });
  } catch (error) {
    const ie = toInviteError(error);

    if (!(error instanceof InviteError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "invites-api",
          event: "get_error",
          inviteId: params.id,
          error: ie.message,
        })
      );
    }

    return NextResponse.json(ie.toApiResponse(), { status: ie.httpStatus });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/invites/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
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

    // Only Owners and Admins may cancel invitations
    if (!userRole || !["Owner", "Admin"].includes(userRole)) {
      throw new ForbiddenError();
    }

    const supabase = getSupabaseAdmin();
    const cancelled = await cancelInvite(supabase, {
      inviteId: params.id,
      organizationId,
    });

    logAuditEventFireAndForget({
      organization_id: organizationId,
      actor_id: userId,
      actor_email: userId,
      actor_name: userId,
      action: "invite.cancel",
      resource_type: "invitation",
      resource_id: cancelled.id,
      resource_name: cancelled.email,
      changes: null,
      ip_address:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        null,
      user_agent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({
      data: { message: "Invitation cancelled successfully." },
    });
  } catch (error) {
    const ie = toInviteError(error);

    if (!(error instanceof InviteError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "invites-api",
          event: "delete_error",
          inviteId: params.id,
          error: ie.message,
        })
      );
    }

    return NextResponse.json(ie.toApiResponse(), { status: ie.httpStatus });
  }
}
