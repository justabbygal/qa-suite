/**
 * User management API routes:
 *
 * DELETE /api/users/[id]  — remove a user from the organization
 * PATCH  /api/users/[id]  — change a user's role within the organization
 *
 * Required headers (injected by Better Auth middleware):
 *   Authorization: Bearer <token>
 *   x-user-id:          <uuid>   (the actor performing the action)
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 *
 * DELETE role restrictions:
 *   - Owner can remove Admin or User (not themselves).
 *   - Admin can remove User only (not Owner, Admin, or themselves).
 *   - User cannot remove anyone.
 *
 * PATCH role restrictions:
 *   - Owner can change Admin or User to any assignable role (not themselves).
 *   - Admin can change User to User only (not themselves, not Admin/Owner).
 *   - User cannot change anyone's role.
 *
 * PATCH request body: { newRole: "Owner" | "Admin" | "User" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  UserError,
  UserNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  SelfRemovalError,
  SelfRoleChangeError,
  InvalidRoleError,
  DatabaseError,
  toUserError,
} from "@/lib/errors/user-errors";

// ---------------------------------------------------------------------------
// Role hierarchy
// ---------------------------------------------------------------------------

type UserRole = "Owner" | "Admin" | "User";

const VALID_ROLES = new Set<UserRole>(["Owner", "Admin", "User"]);

const ROLE_LEVELS: Record<UserRole, number> = {
  Owner: 3,
  Admin: 2,
  User: 1,
};

function isValidRole(role: string | null): role is UserRole {
  return role !== null && VALID_ROLES.has(role as UserRole);
}

/** Returns true when `actorRole` can manage a user with `targetRole`. */
function canManage(actorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_LEVELS[actorRole] > ROLE_LEVELS[targetRole];
}

/**
 * Returns true when `actorRole` can assign `roleToAssign`.
 * Owners can assign any role. Others can only assign strictly lower roles.
 */
function canAssignRole(actorRole: UserRole, roleToAssign: UserRole): boolean {
  if (actorRole === "Owner") return true;
  return ROLE_LEVELS[actorRole] > ROLE_LEVELS[roleToAssign];
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// DELETE /api/users/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const actorId = request.headers.get("x-user-id");
    const organizationId = request.headers.get("x-organization-id");
    const rawActorRole = request.headers.get("x-user-role");

    if (!authHeader?.startsWith("Bearer ") || !actorId || !organizationId) {
      throw new UnauthorizedError();
    }

    if (!isValidRole(rawActorRole)) {
      throw new UnauthorizedError();
    }

    const actorRole = rawActorRole;
    const targetUserId = params.id;

    if (actorRole === "User") {
      throw new ForbiddenError("You do not have permission to remove users.");
    }

    if (actorId === targetUserId) {
      throw new SelfRemovalError();
    }

    const supabase = getSupabaseAdmin();

    const { data: targetProfile, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, user_id, role, avatar_url")
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchErr) {
      throw new DatabaseError("fetch target user", new Error(fetchErr.message));
    }

    if (!targetProfile) {
      throw new UserNotFoundError(targetUserId);
    }

    const targetRole = targetProfile.role as UserRole;

    if (!isValidRole(targetRole)) {
      throw new ForbiddenError("Target user has an unrecognised role.");
    }

    if (!canManage(actorRole, targetRole)) {
      throw new ForbiddenError(
        `A${actorRole === "Admin" ? "n" : ""} ${actorRole} cannot remove a ${targetRole}.`
      );
    }

    // Delete avatar from storage (best-effort)
    if (targetProfile.avatar_url) {
      const avatarPath = targetProfile.avatar_url.split("/").pop();
      if (avatarPath) {
        await supabase.storage
          .from("avatars")
          .remove([`${organizationId}/${targetUserId}/${avatarPath}`])
          .catch((err: unknown) =>
            console.warn(
              JSON.stringify({
                ts: new Date().toISOString(),
                service: "users-api",
                event: "avatar_delete_failed",
                userId: targetUserId,
                error: err instanceof Error ? err.message : String(err),
              })
            )
          );
      }
    }

    const { error: deleteProfileErr } = await supabase
      .from("profiles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId);

    if (deleteProfileErr) {
      throw new DatabaseError("delete profile", new Error(deleteProfileErr.message));
    }

    // Remove org membership (best-effort — table may not exist yet)
    const { error: memberDeleteErr } = await supabase
      .from("organization_members")
      .delete()
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId);

    if (memberDeleteErr) {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "users-api",
          event: "org_member_delete_failed",
          userId: targetUserId,
          error: memberDeleteErr.message,
        })
      );
    }

    // Cancel pending invites associated with the removed user (best-effort)
    await supabase
      .from("invitations")
      .delete()
      .eq("organization_id", organizationId)
      .eq("invited_by", targetUserId)
      .is("used_at", null)
      .catch((err: unknown) =>
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            service: "users-api",
            event: "pending_invites_cleanup_failed",
            userId: targetUserId,
            error: err instanceof Error ? err.message : String(err),
          })
        )
      );

    return NextResponse.json({
      data: { message: "User removed successfully.", userId: targetUserId },
    });
  } catch (error) {
    const ue = toUserError(error);

    if (!(error instanceof UserError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "users-api",
          event: "delete_user_error",
          userId: params.id,
          error: ue.message,
        })
      );
    }

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/users/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const actorId = request.headers.get("x-user-id");
    const organizationId = request.headers.get("x-organization-id");
    const rawActorRole = request.headers.get("x-user-role");

    if (!authHeader?.startsWith("Bearer ") || !actorId || !organizationId) {
      throw new UnauthorizedError();
    }

    if (!isValidRole(rawActorRole)) {
      throw new UnauthorizedError();
    }

    const actorRole = rawActorRole;
    const targetUserId = params.id;

    if (actorRole === "User") {
      throw new ForbiddenError("You do not have permission to change user roles.");
    }

    if (actorId === targetUserId) {
      throw new SelfRoleChangeError();
    }

    // Parse and validate the requested new role
    let body: { newRole?: unknown };
    try {
      body = (await request.json()) as { newRole?: unknown };
    } catch {
      throw new InvalidRoleError("(unparseable body)");
    }

    const rawNewRole = body.newRole;
    if (!rawNewRole || !isValidRole(String(rawNewRole))) {
      throw new InvalidRoleError(String(rawNewRole ?? ""));
    }

    const newRole = rawNewRole as UserRole;

    const supabase = getSupabaseAdmin();

    // Fetch the target user's current role
    const { data: targetProfile, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, user_id, role")
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchErr) {
      throw new DatabaseError("fetch target user", new Error(fetchErr.message));
    }

    if (!targetProfile) {
      throw new UserNotFoundError(targetUserId);
    }

    const targetRole = targetProfile.role as UserRole;

    if (!isValidRole(targetRole)) {
      throw new ForbiddenError("Target user has an unrecognised role.");
    }

    // Actor must outrank target to manage them
    if (!canManage(actorRole, targetRole)) {
      throw new ForbiddenError(
        `A${actorRole === "Admin" ? "n" : ""} ${actorRole} cannot change the role of a ${targetRole}.`
      );
    }

    // Actor must be allowed to assign the requested new role
    if (!canAssignRole(actorRole, newRole)) {
      throw new ForbiddenError(
        `A${actorRole === "Admin" ? "n" : ""} ${actorRole} cannot assign the ${newRole} role.`
      );
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ role: newRole.toLowerCase() })
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId);

    if (updateErr) {
      throw new DatabaseError("update user role", new Error(updateErr.message));
    }

    return NextResponse.json({
      data: {
        message: "Role updated successfully.",
        userId: targetUserId,
        newRole,
      },
    });
  } catch (error) {
    const ue = toUserError(error);

    if (!(error instanceof UserError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "users-api",
          event: "update_role_error",
          userId: params.id,
          error: ue.message,
        })
      );
    }

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}
