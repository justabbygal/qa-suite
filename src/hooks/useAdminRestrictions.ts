"use client";

import { useCallback } from "react";
import type { OrgUser, Role } from "@/lib/permissions/types";
import {
  checkCanViewUser,
  checkCanManageUser,
  checkCanChangeRole,
  checkCanEditPermissions,
  checkCanManageInvite,
  filterViewableUsers,
  filterManageableUsers,
  type RestrictionResult,
} from "@/lib/services/admin-restrictions";

interface UseAdminRestrictionsOptions {
  actorId: string;
  actorRole: Role;
}

/**
 * React hook that exposes admin restriction checks bound to the current user.
 * All functions are memoised and safe to use in render or event handlers.
 *
 * Usage:
 *   const { canViewUser, canManageUser, getViewableUsers } = useAdminRestrictions({
 *     actorId: session.userId,
 *     actorRole: session.role,
 *   });
 */
export function useAdminRestrictions({
  actorId,
  actorRole,
}: UseAdminRestrictionsOptions) {
  /** Whether the actor can see a user with the given role in management views. */
  const canViewUser = useCallback(
    (targetRole: Role): RestrictionResult =>
      checkCanViewUser(actorRole, targetRole),
    [actorRole]
  );

  /** Whether the actor can manage (edit/remove) a specific user. */
  const canManageUser = useCallback(
    (targetId: string, targetRole: Role): RestrictionResult =>
      checkCanManageUser(actorId, actorRole, targetId, targetRole),
    [actorId, actorRole]
  );

  /** Whether the actor can change a target user's role. */
  const canChangeRole = useCallback(
    (targetId: string, targetRole: Role, newRole: Role): RestrictionResult =>
      checkCanChangeRole(actorId, actorRole, targetId, targetRole, newRole),
    [actorId, actorRole]
  );

  /** Whether the actor can edit a target user's module permissions. */
  const canEditPermissions = useCallback(
    (targetId: string, targetRole: Role): RestrictionResult =>
      checkCanEditPermissions(actorId, actorRole, targetId, targetRole),
    [actorId, actorRole]
  );

  /** Whether the actor can manage (create/resend/cancel) invites for a given role. */
  const canManageInvite = useCallback(
    (inviteRole: Role): RestrictionResult =>
      checkCanManageInvite(actorRole, inviteRole),
    [actorRole]
  );

  /** Returns only the users the actor is permitted to see in management views. */
  const getViewableUsers = useCallback(
    (users: OrgUser[]): OrgUser[] =>
      filterViewableUsers(actorId, actorRole, users),
    [actorId, actorRole]
  );

  /** Returns only the users the actor is permitted to actively manage. */
  const getManageableUsers = useCallback(
    (users: OrgUser[]): OrgUser[] =>
      filterManageableUsers(actorId, actorRole, users),
    [actorId, actorRole]
  );

  return {
    canViewUser,
    canManageUser,
    canChangeRole,
    canEditPermissions,
    canManageInvite,
    getViewableUsers,
    getManageableUsers,
  };
}
