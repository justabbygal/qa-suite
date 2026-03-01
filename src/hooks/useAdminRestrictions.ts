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

/**
 * React hook that binds all admin-restriction checks to a specific actor
 * (current user). Wraps the pure functions from admin-restrictions service.
 */
export function useAdminRestrictions({
  actorId,
  actorRole,
}: {
  actorId: string;
  actorRole: Role;
}) {
  const canViewUser = useCallback(
    (targetRole: Role): RestrictionResult =>
      checkCanViewUser(actorRole, targetRole),
    [actorRole]
  );

  const canManageUser = useCallback(
    (targetId: string, targetRole: Role): RestrictionResult =>
      checkCanManageUser(actorId, actorRole, targetId, targetRole),
    [actorId, actorRole]
  );

  const canChangeRole = useCallback(
    (targetId: string, targetRole: Role, newRole: Role): RestrictionResult =>
      checkCanChangeRole(actorId, actorRole, targetId, targetRole, newRole),
    [actorId, actorRole]
  );

  const canEditPermissions = useCallback(
    (targetId: string, targetRole: Role): RestrictionResult =>
      checkCanEditPermissions(actorId, actorRole, targetId, targetRole),
    [actorId, actorRole]
  );

  const canManageInvite = useCallback(
    (inviteRole: Role): RestrictionResult =>
      checkCanManageInvite(actorRole, inviteRole),
    [actorRole]
  );

  const getViewableUsers = useCallback(
    (users: OrgUser[]): OrgUser[] =>
      filterViewableUsers(actorId, actorRole, users),
    [actorId, actorRole]
  );

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
