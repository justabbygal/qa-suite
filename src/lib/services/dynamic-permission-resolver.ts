/**
 * Dynamic permission resolver for database-backed registered modules.
 *
 * Resolves feature and settings access for the organization's registered
 * module list. Falls back to the in-memory manifest registry for modules
 * that have not yet migrated to database registration (backward compatibility).
 *
 * Permission keys use dot-notation:
 *   "<moduleId>.featureAccess"  — can the role use this feature?
 *   "<moduleId>.settingsAccess" — can the role configure this feature?
 *
 * Both kebab-case module slugs (e.g. "analytics") and UUIDs are accepted
 * as the moduleId segment of a permission key.
 *
 * Caching:
 *   Module lists are cached per-organization with a configurable TTL to
 *   avoid redundant database fetches. Call `invalidateModuleCache()` after
 *   any permission write to ensure guards see fresh data.
 */

import type { RegisteredModule } from "@/lib/modules/types";
import type { Role as LowercaseRole } from "@/lib/permissions/types";
import { getModule as getRegistryModule } from "@/lib/permissions/registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Capitalized role matching RegisteredModule.permissions keys. */
export type ModuleRole = "Owner" | "Admin" | "User";

/** The two permission fields supported in dot-notation keys. */
export type PermissionField = "featureAccess" | "settingsAccess";

/** Parsed components of a dot-notation permission key. */
export interface ParsedPermissionKey {
  /** Kebab-case module identifier or UUID. */
  moduleId: string;
  /** Which permission layer is being checked. */
  field: PermissionField;
}

/** Effective permission resolved for a specific role on a specific module. */
export interface ResolvedModulePermission {
  /** Whether the role can access the module's feature. */
  canUse: boolean;
  /**
   * Whether the role can configure the module's settings.
   * Only true when canUse is also true.
   */
  canConfigure: boolean;
  /** Kebab-case module slug (normalized from slug or UUID lookup). */
  moduleSlug: string;
  /** The role this was resolved for. */
  role: ModuleRole;
  /**
   * Whether the module was found in either the DB-backed list or the
   * in-memory registry. When false the result is a safe deny-all default.
   */
  found: boolean;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** Error codes for permission resolution failures. */
export type DynamicPermissionResolverErrorCode =
  | "INVALID_KEY"
  | "INVALID_ROLE"
  | "RESOLUTION_FAILED";

/**
 * Thrown when a permission key is malformed or a role string is unrecognized.
 * Never thrown for unregistered modules — those fail gracefully with
 * `found: false` and deny-all access.
 */
export class DynamicPermissionResolverError extends Error {
  constructor(
    message: string,
    public readonly code: DynamicPermissionResolverErrorCode
  ) {
    super(message);
    this.name = "DynamicPermissionResolverError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_MODULE_ROLES = new Set<string>(["Owner", "Admin", "User"]);

/** Default cache TTL: 60 seconds. */
export const DEFAULT_CACHE_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  modules: RegisteredModule[];
  expiresAt: number;
}

/** In-process module cache keyed by organizationId. Resets on cold starts. */
const moduleCache = new Map<string, CacheEntry>();

/**
 * Stores a fetched module list in the resolver cache.
 * Call this after loading registered modules from the database.
 *
 * @param organizationId - The organization the modules belong to.
 * @param modules        - The fetched module list.
 * @param ttlMs          - Cache TTL in milliseconds. Defaults to 60 seconds.
 */
export function cacheModules(
  organizationId: string,
  modules: RegisteredModule[],
  ttlMs = DEFAULT_CACHE_TTL_MS
): void {
  moduleCache.set(organizationId, {
    modules,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Returns cached modules for an organization, or null when the entry has
 * expired or was never populated.
 *
 * @param organizationId - The organization to look up.
 */
export function getCachedModules(
  organizationId: string
): RegisteredModule[] | null {
  const entry = moduleCache.get(organizationId);
  if (!entry || Date.now() > entry.expiresAt) {
    moduleCache.delete(organizationId);
    return null;
  }
  return entry.modules;
}

/**
 * Evicts cached modules for an organization.
 * Call this after any permission write so the next check fetches fresh data.
 *
 * @param organizationId - The organization whose cache entry should be purged.
 */
export function invalidateModuleCache(organizationId: string): void {
  moduleCache.delete(organizationId);
}

/** Clears all cache entries. Intended for use in tests and cold-start resets. */
export function clearModuleCache(): void {
  moduleCache.clear();
}

// ---------------------------------------------------------------------------
// Role normalization
// ---------------------------------------------------------------------------

/**
 * Converts a lowercase role ("owner" | "admin" | "user") to the capitalized
 * form used as keys in RegisteredModule.permissions ("Owner" | "Admin" | "User").
 */
export function toModuleRole(role: LowercaseRole): ModuleRole {
  return (role.charAt(0).toUpperCase() + role.slice(1)) as ModuleRole;
}

/**
 * Converts a capitalized ModuleRole to the lowercase form used by the
 * service-layer Role type.
 */
export function toLowercaseRole(role: ModuleRole): LowercaseRole {
  return role.toLowerCase() as LowercaseRole;
}

/**
 * Accepts either a lowercase ("owner") or capitalized ("Owner") role string
 * and returns the canonical capitalized ModuleRole.
 *
 * @throws {DynamicPermissionResolverError} When the value is not a recognized role.
 */
export function normalizeToModuleRole(role: string): ModuleRole {
  const candidate =
    role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  if (!VALID_MODULE_ROLES.has(candidate)) {
    throw new DynamicPermissionResolverError(
      `Invalid role: "${role}". Must be one of: Owner, Admin, User (or lowercase equivalents).`,
      "INVALID_ROLE"
    );
  }
  return candidate as ModuleRole;
}

// ---------------------------------------------------------------------------
// Permission key parsing
// ---------------------------------------------------------------------------

/**
 * Parses a dot-notation permission key into its moduleId and field components.
 *
 * @param key - Dot-notation key, e.g. `"analytics.featureAccess"`.
 * @returns   Parsed `{ moduleId, field }`.
 * @throws {DynamicPermissionResolverError} When the format is invalid.
 *
 * @example
 *   parsePermissionKey("analytics.featureAccess")
 *   // → { moduleId: "analytics", field: "featureAccess" }
 *
 *   parsePermissionKey("user-management.settingsAccess")
 *   // → { moduleId: "user-management", field: "settingsAccess" }
 */
export function parsePermissionKey(key: string): ParsedPermissionKey {
  const dotIndex = key.lastIndexOf(".");
  if (dotIndex <= 0) {
    throw new DynamicPermissionResolverError(
      `Invalid permission key: "${key}". Expected format: "<moduleId>.featureAccess" or "<moduleId>.settingsAccess".`,
      "INVALID_KEY"
    );
  }

  const moduleId = key.slice(0, dotIndex);
  const field = key.slice(dotIndex + 1);

  if (field !== "featureAccess" && field !== "settingsAccess") {
    throw new DynamicPermissionResolverError(
      `Invalid permission key: "${key}". Field must be "featureAccess" or "settingsAccess", got "${field}".`,
      "INVALID_KEY"
    );
  }

  return { moduleId, field: field as PermissionField };
}

// ---------------------------------------------------------------------------
// Core resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the effective permission for a role on a single module.
 *
 * Resolution order:
 * 1. Look up the module in the DB-backed `modules` list by slug, then by UUID.
 * 2. If not in the DB list, fall back to the in-memory manifest registry
 *    (backward compatibility for modules that pre-date database registration).
 * 3. If found nowhere, return a safe deny-all result with `found: false`.
 *
 * @param modules  - DB-backed registered module list for the organization.
 * @param role     - Capitalized role to resolve for.
 * @param moduleId - Module slug (kebab-case) or UUID.
 */
export function resolveModulePermission(
  modules: RegisteredModule[],
  role: ModuleRole,
  moduleId: string
): ResolvedModulePermission {
  // 1. DB-backed registered modules — slug match first, then UUID.
  const dbModule = modules.find(
    (m) => m.module === moduleId || m.id === moduleId
  );

  if (dbModule) {
    const rolePerms = dbModule.permissions[role];
    return {
      canUse: rolePerms.featureAccess,
      canConfigure: rolePerms.featureAccess && rolePerms.settingsAccess,
      moduleSlug: dbModule.module,
      role,
      found: true,
    };
  }

  // 2. In-memory registry fallback for backward compatibility.
  const manifest = getRegistryModule(moduleId);
  if (manifest) {
    const lowRole = toLowercaseRole(role);
    const access = manifest.defaultAccess[lowRole];
    return {
      canUse: access.featureAccess,
      canConfigure: access.featureAccess && access.settingsAccess,
      moduleSlug: manifest.module,
      role,
      found: true,
    };
  }

  // 3. Unregistered module — deny all access, fail gracefully.
  return {
    canUse: false,
    canConfigure: false,
    moduleSlug: moduleId,
    role,
    found: false,
  };
}

// ---------------------------------------------------------------------------
// hasPermission and helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a role has a specific permission identified by a
 * dot-notation key.
 *
 * @param modules       - DB-backed registered module list for the organization.
 * @param role          - Role to check. Accepts both capitalized and lowercase forms.
 * @param permissionKey - Dot-notation key, e.g. `"analytics.featureAccess"`.
 * @returns `true` if the role has the permission, `false` otherwise.
 * @throws {DynamicPermissionResolverError} When the key format is invalid or
 *         the role string is unrecognized.
 *
 * @example
 *   hasPermission(modules, "Admin", "analytics.featureAccess")   // → true/false
 *   hasPermission(modules, "user", "analytics.settingsAccess")   // lowercase role accepted
 */
export function hasPermission(
  modules: RegisteredModule[],
  role: string,
  permissionKey: string
): boolean {
  const { moduleId, field } = parsePermissionKey(permissionKey);
  const moduleRole = normalizeToModuleRole(role);
  const resolved = resolveModulePermission(modules, moduleRole, moduleId);
  return field === "settingsAccess" ? resolved.canConfigure : resolved.canUse;
}

/**
 * Returns `true` if the role has feature access (can use the feature) for
 * the given module.
 *
 * @param modules  - DB-backed registered module list.
 * @param role     - Role to check (capitalized or lowercase).
 * @param moduleId - Module slug or UUID.
 */
export function hasFeatureAccess(
  modules: RegisteredModule[],
  role: string,
  moduleId: string
): boolean {
  return hasPermission(modules, role, `${moduleId}.featureAccess`);
}

/**
 * Returns `true` if the role has settings access (can configure the feature)
 * for the given module. This also requires featureAccess to be true.
 *
 * @param modules  - DB-backed registered module list.
 * @param role     - Role to check (capitalized or lowercase).
 * @param moduleId - Module slug or UUID.
 */
export function hasSettingsAccess(
  modules: RegisteredModule[],
  role: string,
  moduleId: string
): boolean {
  return hasPermission(modules, role, `${moduleId}.settingsAccess`);
}

/**
 * Returns a map of all resolved permissions for a role across every module
 * in the provided list. Useful for building permission summaries or
 * performing bulk access checks.
 *
 * @param modules - DB-backed registered module list.
 * @param role    - Capitalized role to resolve for.
 * @returns Map keyed by module slug → ResolvedModulePermission.
 */
export function getAllPermissionsForRole(
  modules: RegisteredModule[],
  role: ModuleRole
): Map<string, ResolvedModulePermission> {
  const result = new Map<string, ResolvedModulePermission>();
  for (const mod of modules) {
    result.set(mod.module, resolveModulePermission(modules, role, mod.module));
  }
  return result;
}

/**
 * Checks a list of permission keys and returns the first key that is denied,
 * or `null` if all keys are granted.
 *
 * Useful for validating that a caller satisfies all required permissions
 * before proceeding with an action.
 *
 * @param modules         - DB-backed registered module list.
 * @param role            - Role to check (capitalized or lowercase).
 * @param permissionKeys  - Array of dot-notation permission keys to check.
 * @returns The first denied key, or `null` if every key is allowed.
 * @throws {DynamicPermissionResolverError} When any key has an invalid format.
 *
 * @example
 *   const denied = findFirstDeniedPermission(modules, "admin", [
 *     "analytics.featureAccess",
 *     "reports.settingsAccess",
 *   ]);
 *   if (denied) console.error(`Access denied for: ${denied}`);
 */
export function findFirstDeniedPermission(
  modules: RegisteredModule[],
  role: string,
  permissionKeys: string[]
): string | null {
  for (const key of permissionKeys) {
    if (!hasPermission(modules, role, key)) {
      return key;
    }
  }
  return null;
}
