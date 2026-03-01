import type {
  Role,
  ResolvedPermission,
  PermissionOverride,
  PermissionKey,
  PermissionKeyField,
} from "./types";
import { getModule } from "./registry";
import type { RegisteredModule, Role as ModuleRole } from "@/lib/modules/types";

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
// Dynamic module resolution (database-backed)
// ---------------------------------------------------------------------------

/**
 * Converts a lowercase service Role ("owner" | "admin" | "user") to the
 * capitalized variant used as keys in RegisteredModule.permissions.
 */
function toModuleRole(role: Role): ModuleRole {
  return (role.charAt(0).toUpperCase() + role.slice(1)) as ModuleRole;
}

/**
 * Resolves the effective permission for a role on a module using a list of
 * RegisteredModule objects loaded from the database, rather than the
 * in-memory registry.
 *
 * This is the preferred resolution path when modules have been fetched from
 * the database, as it reflects any org-level permission overrides stored
 * in the modules table. Org-level overrides (e.g. from a separate overrides
 * table) still take precedence when provided.
 *
 * @param role      - The user's role (lowercase).
 * @param moduleId  - The module's kebab-case identifier (e.g. "user-management").
 * @param modules   - Registered modules loaded for the current organization.
 * @param overrides - Optional org-level permission overrides to check first.
 * @returns The resolved permission. Defaults to no access for unregistered modules.
 */
export function resolvePermissionFromModules(
  role: Role,
  moduleId: string,
  modules: RegisteredModule[],
  overrides: PermissionOverride[] = []
): ResolvedPermission {
  // Org-level overrides take precedence.
  const override = overrides.find(
    (o) => o.module === moduleId && o.role === role
  );
  if (override) {
    return {
      canUse: override.featureAccess,
      canConfigure: override.featureAccess && override.settingsAccess,
    };
  }

  // Find the module by its kebab-case identifier.
  const registeredModule = modules.find((m) => m.module === moduleId);
  if (!registeredModule) {
    return { canUse: false, canConfigure: false };
  }

  const capRole = toModuleRole(role);
  const access = registeredModule.permissions[capRole];
  if (!access) {
    return { canUse: false, canConfigure: false };
  }

  return {
    canUse: access.featureAccess,
    canConfigure: access.featureAccess && access.settingsAccess,
  };
}

// ---------------------------------------------------------------------------
// Dot-notation permission key utilities
// ---------------------------------------------------------------------------

/**
 * Parses a dot-notation permission key into its constituent parts.
 *
 * @param key - A key in the format "module-id.featureAccess" or
 *              "module-id.settingsAccess".
 * @returns An object with `moduleId` and `field`.
 *
 * @example
 *   parsePermissionKey("user-management.featureAccess")
 *   // → { moduleId: "user-management", field: "featureAccess" }
 */
export function parsePermissionKey(key: PermissionKey): {
  moduleId: string;
  field: PermissionKeyField;
} {
  const lastDot = key.lastIndexOf(".");
  return {
    moduleId: key.slice(0, lastDot),
    field: key.slice(lastDot + 1) as PermissionKeyField,
  };
}

/**
 * Checks a single permission using a dot-notation key against a list of
 * database-loaded modules.
 *
 * @param key      - Dot-notation key, e.g. "user-management.featureAccess".
 * @param role     - The user's role (lowercase).
 * @param modules  - Registered modules for the current organization.
 * @param overrides - Optional org-level overrides (checked first).
 * @returns `true` if the role has the specified access, `false` otherwise.
 *
 * @example
 *   checkPermissionByKey("integrations.settingsAccess", "admin", modules)
 *   // → false (admin cannot configure integrations settings)
 */
export function checkPermissionByKey(
  key: PermissionKey,
  role: Role,
  modules: RegisteredModule[],
  overrides: PermissionOverride[] = []
): boolean {
  const { moduleId, field } = parsePermissionKey(key);
  const resolved = resolvePermissionFromModules(role, moduleId, modules, overrides);
  return field === "featureAccess" ? resolved.canUse : resolved.canConfigure;
}
