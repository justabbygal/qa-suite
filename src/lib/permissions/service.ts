import type { Role, ResolvedPermission, PermissionOverride } from "./types";
import { getModule } from "./registry";
import type { RegisteredModule } from "@/lib/modules/types";
import {
  parsePermissionKey as parseDynamicKey,
  resolveModulePermission,
  hasPermission as dynamicHasPermission,
  normalizeToModuleRole,
  type ParsedPermissionKey,
  type ResolvedModulePermission,
} from "@/lib/services/dynamic-permission-resolver";

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

// ---------------------------------------------------------------------------
// Module-aware helpers (DB-backed registered modules)
// ---------------------------------------------------------------------------

// Re-export the parsed key type for callers that import from this module.
export type { ParsedPermissionKey, ResolvedModulePermission };

/**
 * Parses a dot-notation permission key into its moduleId and field.
 *
 * @param key - Dot-notation key, e.g. `"analytics.featureAccess"`.
 * @returns   Parsed `{ moduleId, field }`.
 * @throws {DynamicPermissionResolverError} When the format is invalid.
 *
 * @example
 *   parsePermissionKey("user-management.settingsAccess")
 *   // → { moduleId: "user-management", field: "settingsAccess" }
 */
export function parsePermissionKey(key: string): ParsedPermissionKey {
  return parseDynamicKey(key);
}

/**
 * Resolves the effective permission for a (lowercase) role on a module using
 * the organization's DB-backed registered module list.
 *
 * This bridges the lowercase `Role` type used by the service layer to the
 * capitalized `ModuleRole` type used by `RegisteredModule.permissions`.
 *
 * Falls back to the in-memory manifest registry when the module is not found
 * in the provided `modules` list (backward compatibility).
 *
 * @param modules  - DB-backed registered module list for the organization.
 * @param role     - Lowercase role ("owner" | "admin" | "user").
 * @param moduleId - Module slug (kebab-case) or UUID.
 */
export function resolvePermissionFromModules(
  modules: RegisteredModule[],
  role: Role,
  moduleId: string
): ResolvedPermission {
  const moduleRole = normalizeToModuleRole(role);
  const resolved = resolveModulePermission(modules, moduleRole, moduleId);
  return {
    canUse: resolved.canUse,
    canConfigure: resolved.canConfigure,
  };
}

/**
 * Checks a specific permission for a (lowercase) role against the
 * organization's registered module list using a dot-notation key.
 *
 * @param key     - Dot-notation permission key, e.g. `"analytics.featureAccess"`.
 * @param role    - Lowercase role ("owner" | "admin" | "user").
 * @param modules - DB-backed registered module list for the organization.
 * @returns `true` if the role has the permission.
 * @throws {DynamicPermissionResolverError} When the key format is invalid.
 *
 * @example
 *   checkPermissionByKey("analytics.featureAccess", "admin", modules)
 */
export function checkPermissionByKey(
  key: string,
  role: Role,
  modules: RegisteredModule[]
): boolean {
  return dynamicHasPermission(modules, role, key);
}
