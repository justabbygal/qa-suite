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
  InviteNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  toInviteError,
} from "@/lib/errors/invite-errors";

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

    const { data: invite, error } = await supabase
      .from("invitations")
      .select("id, email, role, invited_by, expires_at, used_at, created_at")
      .eq("id", params.id)
      .eq("organization_id", organizationId)
      .single();

    if (error || !invite) {
      throw new InviteNotFoundError(params.id);
    }

    const now = new Date();
    const status = invite.used_at
      ? "accepted"
      : new Date(invite.expires_at) < now
        ? "expired"
        : "pending";

    return NextResponse.json({ data: { invite: { ...invite, status } } });
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

    // Confirm the invite exists within this organisation before deleting
    const { data: invite, error: fetchErr } = await supabase
      .from("invitations")
      .select("id")
      .eq("id", params.id)
      .eq("organization_id", organizationId)
      .single();

    if (fetchErr || !invite) {
      throw new InviteNotFoundError(params.id);
    }

    const { error: deleteErr } = await supabase
      .from("invitations")
      .delete()
      .eq("id", params.id)
      .eq("organization_id", organizationId);

    if (deleteErr) {
      throw new DatabaseError("cancel invite", new Error(deleteErr.message));
    }

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
