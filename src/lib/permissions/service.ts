import type { Role, ResolvedPermission, PermissionOverride } from "./types";
import { getModule } from "./registry";

/** Numeric privilege level for each role. Higher = more privileged. */
const ROLE_LEVELS: Record<Role, number> = {
  owner: 3,
  admin: 2,
  user: 1,
};

/** Returns the numeric privilege level for a role. */
export function getRoleLevel(role: Role): number {
  return ROLE_LEVELS[role];
}

/** Returns true if `role` has strictly higher privilege than `other`. */
export function hasHigherRole(role: Role, other: Role): boolean {
  return ROLE_LEVELS[role] > ROLE_LEVELS[other];
}

/** Returns true if `role` has privilege equal to or higher than `other`. */
export function hasAtLeastRole(role: Role, other: Role): boolean {
  return ROLE_LEVELS[role] >= ROLE_LEVELS[other];
}

/**
 * Returns true if the actor can manage (edit, remove) a user with the given
 * target role. An actor may only manage users with a strictly lower role level.
 */
export function canManageUser(actorRole: Role, targetRole: Role): boolean {
  return ROLE_LEVELS[actorRole] > ROLE_LEVELS[targetRole];
}

/**
 * Returns true if the actor can assign (invite with) a specific role.
 * Actors may only assign roles strictly below their own level.
 */
export function canAssignRole(actorRole: Role, roleToAssign: Role): boolean {
  return ROLE_LEVELS[actorRole] > ROLE_LEVELS[roleToAssign];
}

/**
 * Resolves the effective permission for a given role on a module, taking
 * org-level overrides into account.
 *
 * @param role      - The user's role.
 * @param moduleId  - The module identifier (kebab-case).
 * @param overrides - Optional org-level permission overrides to check first.
 * @returns The resolved permission. Defaults to no access for unregistered modules.
 */
export function resolvePermission(
  role: Role,
  moduleId: string,
  overrides: PermissionOverride[] = []
): ResolvedPermission {
  // Org-level overrides take precedence over module defaults.
  const override = overrides.find(
    (o) => o.module === moduleId && o.role === role
  );

  if (override) {
    return {
      canUse: override.featureAccess,
      // canConfigure is only meaningful when the feature is accessible.
      canConfigure: override.featureAccess && override.settingsAccess,
    };
  }

  // Fall back to the module's registered default access.
  const manifest = getModule(moduleId);
  if (!manifest) {
    // Unregistered module – deny all access.
    return { canUse: false, canConfigure: false };
  }

  const access = manifest.defaultAccess[role];
  return {
    canUse: access.featureAccess,
    canConfigure: access.featureAccess && access.settingsAccess,
  };
}

/**
 * Determines whether a UI element should be visible to the user based on
 * their resolved permission.
 *
 * @param permission      - The resolved permission for the user.
 * @param requireSettings - When true, also requires canConfigure to be true.
 */
export function shouldShowElement(
  permission: ResolvedPermission,
  requireSettings = false
): boolean {
  if (requireSettings) {
    return permission.canConfigure;
  }
  return permission.canUse;
}
