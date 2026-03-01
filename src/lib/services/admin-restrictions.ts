/**
 * Admin restriction logic for user management.
 *
 * Business rules enforced here:
 * - Admins can only view and manage User-role accounts.
 * - Admins cannot view or manage other Admins or Owners.
 * - No user (including Admins) can change their own role.
 * - No user can modify their own permissions.
 * - Owners retain full management capabilities over all users.
 */

import type { OrgUser, Role } from "@/lib/permissions/types";
import { getRoleLevel } from "@/lib/permissions/service";

export interface RestrictionResult {
  allowed: boolean;
  /** Machine-readable reason code for API responses */
  code?: string;
  /** Human-readable message for UI display */
  message?: string;
}

const ALLOWED: RestrictionResult = { allowed: true };

function denied(code: string, message: string): RestrictionResult {
  return { allowed: false, code, message };
}

/**
 * Checks if an actor can view a target user in user management contexts.
 * Admins cannot view Admins or Owners — only User-role accounts.
 * Owners can view all users.
 */
export function checkCanViewUser(
  actorRole: Role,
  targetRole: Role
): RestrictionResult {
  if (actorRole === "admin" && targetRole !== "user") {
    return denied(
      "ADMIN_PEER_RESTRICTED",
      "Admins can only view and manage User-role accounts."
    );
  }
  return ALLOWED;
}

/**
 * Checks if an actor can manage (edit role, remove, update) a specific target user.
 * Combines self-management restriction with role-hierarchy check.
 */
export function checkCanManageUser(
  actorId: string,
  actorRole: Role,
  targetId: string,
  targetRole: Role
): RestrictionResult {
  if (actorId === targetId) {
    return denied("SELF_MANAGEMENT", "You cannot manage your own account.");
  }

  const viewCheck = checkCanViewUser(actorRole, targetRole);
  if (!viewCheck.allowed) return viewCheck;

  if (getRoleLevel(actorRole) <= getRoleLevel(targetRole)) {
    return denied(
      "INSUFFICIENT_ROLE",
      `Your role does not have permission to manage ${targetRole}-level users.`
    );
  }

  return ALLOWED;
}

/**
 * Checks if an actor can change a target user's role.
 * Blocks self-role changes and enforces the role hierarchy for both the
 * current and the new role.
 */
export function checkCanChangeRole(
  actorId: string,
  actorRole: Role,
  targetId: string,
  targetRole: Role,
  newRole: Role
): RestrictionResult {
  if (actorId === targetId) {
    return denied("SELF_ROLE_CHANGE", "You cannot change your own role.");
  }

  const manageCheck = checkCanManageUser(actorId, actorRole, targetId, targetRole);
  if (!manageCheck.allowed) return manageCheck;

  if (getRoleLevel(actorRole) <= getRoleLevel(newRole)) {
    return denied(
      "INSUFFICIENT_ROLE",
      `You cannot assign the "${newRole}" role.`
    );
  }

  return ALLOWED;
}

/**
 * Checks if an actor can edit a target user's module permissions.
 * Prevents editing own permissions and enforces role-hierarchy restrictions.
 */
export function checkCanEditPermissions(
  actorId: string,
  actorRole: Role,
  targetId: string,
  targetRole: Role
): RestrictionResult {
  if (actorId === targetId) {
    return denied(
      "SELF_PERMISSION_EDIT",
      "You cannot modify your own permissions."
    );
  }

  return checkCanManageUser(actorId, actorRole, targetId, targetRole);
}

/**
 * Checks if an actor can manage an invitation for a given role.
 * Admins can only manage (create, resend, cancel) invites for User-role.
 */
export function checkCanManageInvite(
  actorRole: Role,
  inviteRole: Role
): RestrictionResult {
  if (actorRole === "admin" && inviteRole !== "user") {
    return denied(
      "ADMIN_INVITE_RESTRICTED",
      "Admins can only manage invitations for the User role."
    );
  }
  return ALLOWED;
}

/**
 * Filters a user list to only those visible to the actor in management views.
 * - Owners see all users except themselves.
 * - Admins see only User-role accounts (not other Admins or Owners).
 */
export function filterViewableUsers(
  actorId: string,
  actorRole: Role,
  users: OrgUser[]
): OrgUser[] {
  return users.filter((user) => {
    if (user.id === actorId) return false;
    return checkCanViewUser(actorRole, user.role).allowed;
  });
}

/**
 * Filters a user list to only those the actor can actively manage
 * (change role, remove, edit permissions).
 * Equivalent to filterViewableUsers since visibility and manageability
 * follow the same rules.
 */
export function filterManageableUsers(
  actorId: string,
  actorRole: Role,
  users: OrgUser[]
): OrgUser[] {
  return users.filter(
    (user) => checkCanManageUser(actorId, actorRole, user.id, user.role).allowed
  );
}
