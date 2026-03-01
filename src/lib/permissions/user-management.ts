import type { OrgUser, Role, OperationResult } from "./types";
import { canManageUser, canAssignRole } from "./service";
import { filterViewableUsers } from "@/lib/services/admin-restrictions";

/**
 * Validates and processes an invitation to a new user with a given role.
 * The actor must have permission to assign the requested role.
 */
export function inviteUser(
  actor: OrgUser,
  email: string,
  role: Role
): OperationResult<{ email: string; role: Role }> {
  if (!canAssignRole(actor.role, role)) {
    return {
      success: false,
      error: `Role "${actor.role}" cannot invite users with role "${role}".`,
    };
  }

  return {
    success: true,
    data: { email, role },
  };
}

/**
 * Updates a target user's role within the organization.
 * The actor must be able to manage the target's current role and assign the new one.
 */
export function updateUserRole(
  actor: OrgUser,
  target: OrgUser,
  newRole: Role
): OperationResult<{ userId: string; newRole: Role }> {
  if (actor.id === target.id) {
    return { success: false, error: "Users cannot change their own role." };
  }

  if (!canManageUser(actor.role, target.role)) {
    return {
      success: false,
      error: `Role "${actor.role}" cannot manage users with role "${target.role}".`,
    };
  }

  if (!canAssignRole(actor.role, newRole)) {
    return {
      success: false,
      error: `Role "${actor.role}" cannot assign role "${newRole}".`,
    };
  }

  return {
    success: true,
    data: { userId: target.id, newRole },
  };
}

/**
 * Removes a user from the organization.
 * The actor must have permission to manage the target user's role.
 */
export function removeUser(
  actor: OrgUser,
  target: OrgUser
): OperationResult<{ userId: string }> {
  if (actor.id === target.id) {
    return { success: false, error: "Users cannot remove themselves." };
  }

  if (!canManageUser(actor.role, target.role)) {
    return {
      success: false,
      error: `Role "${actor.role}" cannot remove users with role "${target.role}".`,
    };
  }

  return {
    success: true,
    data: { userId: target.id },
  };
}

/**
 * Returns users in the actor's organization that the actor is permitted to see.
 * Owners see all other members. Admins see only User-role members.
 */
export function listUsers(actor: OrgUser, users: OrgUser[]): OrgUser[] {
  const orgUsers = users.filter((u) => u.organizationId === actor.organizationId);
  return filterViewableUsers(actor.id, actor.role, orgUsers);
}
