import type { Role, PermissionAccess } from "./types";
import type { Role as ModuleRole, RolePermissions } from "@/lib/modules/types";
import type { AuditLog } from "@/lib/audit/export";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Action strings for permission-related audit events. */
export const PERMISSION_ACTIONS = {
  ROLE_CHANGED: "permission.role_changed",
  FEATURE_PERMISSION_CHANGED: "permission.feature_permission_changed",
  MODULE_PERMISSIONS_UPDATED: "permission.module_permissions_updated",
} as const;

export type PermissionAction =
  (typeof PERMISSION_ACTIONS)[keyof typeof PERMISSION_ACTIONS];

/** Resource types used in permission audit entries. */
export const PERMISSION_RESOURCE_TYPES = {
  USER: "user",
  MODULE: "module",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single field-level change capturing before and after values. */
export interface FieldChange<T = unknown> {
  before: T;
  after: T;
}

/** The changes map persisted to `audit_logs.changes`. */
export type ChangesMap = Record<string, FieldChange>;

/** Actor context required for every audit entry. */
export interface PermissionAuditContext {
  organizationId: string;
  actorId: string;
  actorEmail: string;
  actorName: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Parameters for tracking a user role change. */
export interface RoleChangeParams {
  context: PermissionAuditContext;
  targetUserId: string;
  targetUserEmail: string;
  targetUserName: string;
  previousRole: Role;
  newRole: Role;
}

/** Parameters for tracking a single permission field toggle on a module. */
export interface FeaturePermissionChangeParams {
  context: PermissionAuditContext;
  moduleId: string;
  moduleDisplayName: string;
  role: ModuleRole;
  field: "featureAccess" | "settingsAccess";
  previousValue: boolean;
  newValue: boolean;
}

/** Parameters for tracking a full module-level permissions update. */
export interface ModulePermissionChangeParams {
  context: PermissionAuditContext;
  moduleId: string;
  moduleDisplayName: string;
  previousPermissions: RolePermissions;
  newPermissions: RolePermissions;
}

/**
 * A permission audit entry ready to be inserted into `audit_logs`.
 * Excludes auto-generated fields (`id`, `created_at`).
 */
export type PermissionAuditEntry = Omit<AuditLog, "id" | "created_at">;

// ---------------------------------------------------------------------------
// Diff utilities
// ---------------------------------------------------------------------------

/**
 * Compares two `PermissionAccess` objects and returns a map of field-level
 * changes. Returns an empty object when the values are identical.
 */
export function diffPermissionAccess(
  previous: PermissionAccess,
  next: PermissionAccess
): Partial<Record<keyof PermissionAccess, FieldChange<boolean>>> {
  const diff: Partial<Record<keyof PermissionAccess, FieldChange<boolean>>> =
    {};

  if (previous.featureAccess !== next.featureAccess) {
    diff.featureAccess = {
      before: previous.featureAccess,
      after: next.featureAccess,
    };
  }
  if (previous.settingsAccess !== next.settingsAccess) {
    diff.settingsAccess = {
      before: previous.settingsAccess,
      after: next.settingsAccess,
    };
  }

  return diff;
}

/**
 * Compares two `RolePermissions` objects and returns a map keyed by role,
 * containing only roles where at least one permission field changed.
 */
export function diffRolePermissions(
  previous: RolePermissions,
  next: RolePermissions
): Partial<
  Record<
    ModuleRole,
    Partial<Record<keyof PermissionAccess, FieldChange<boolean>>>
  >
> {
  const roles: ModuleRole[] = ["Owner", "Admin", "User"];
  const result: Partial<
    Record<
      ModuleRole,
      Partial<Record<keyof PermissionAccess, FieldChange<boolean>>>
    >
  > = {};

  for (const role of roles) {
    const diff = diffPermissionAccess(previous[role], next[role]);
    if (Object.keys(diff).length > 0) {
      result[role] = diff;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Human-readable description generators
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable description for a user role change.
 *
 * @example "Changed Alice's role from user to admin"
 */
export function formatRoleChangeDescription(
  targetName: string,
  previousRole: Role,
  newRole: Role
): string {
  return `Changed ${targetName}'s role from ${previousRole} to ${newRole}`;
}

/**
 * Returns a human-readable description for a single permission field toggle.
 *
 * @example "Enabled feature access for Admin role on Analytics"
 */
export function formatFeaturePermissionDescription(
  role: ModuleRole,
  field: "featureAccess" | "settingsAccess",
  newValue: boolean,
  moduleDisplayName: string
): string {
  const action = newValue ? "Enabled" : "Disabled";
  const fieldLabel =
    field === "featureAccess" ? "feature access" : "settings access";
  return `${action} ${fieldLabel} for ${role} role on ${moduleDisplayName}`;
}

/**
 * Returns a human-readable summary for a module-level permissions update,
 * listing which roles were affected.
 *
 * @example "Updated permissions for Analytics (Admin, User roles)"
 */
export function formatModulePermissionDescription(
  moduleDisplayName: string,
  changedRoles: ModuleRole[]
): string {
  if (changedRoles.length === 0) {
    return `Updated permissions for ${moduleDisplayName} (no changes)`;
  }
  const roleList = changedRoles.join(", ");
  const plural = changedRoles.length > 1 ? "roles" : "role";
  return `Updated permissions for ${moduleDisplayName} (${roleList} ${plural})`;
}

// ---------------------------------------------------------------------------
// Audit entry builders
// ---------------------------------------------------------------------------

/**
 * Builds a single audit entry for a user role change.
 */
export function buildRoleChangeEntry(
  params: RoleChangeParams
): PermissionAuditEntry {
  const {
    context,
    targetUserId,
    targetUserEmail,
    targetUserName,
    previousRole,
    newRole,
  } = params;

  return {
    organization_id: context.organizationId,
    actor_id: context.actorId,
    actor_email: context.actorEmail,
    actor_name: context.actorName,
    action: PERMISSION_ACTIONS.ROLE_CHANGED,
    resource_type: PERMISSION_RESOURCE_TYPES.USER,
    resource_id: targetUserId,
    resource_name: `${targetUserName} (${targetUserEmail})`,
    changes: {
      role: { before: previousRole, after: newRole },
    },
    ip_address: context.ipAddress ?? null,
    user_agent: context.userAgent ?? null,
  };
}

/**
 * Builds an audit entry for a single feature permission field toggle on a
 * module role. Tracks the specific field and captures before/after values.
 */
export function buildFeaturePermissionEntry(
  params: FeaturePermissionChangeParams
): PermissionAuditEntry {
  const {
    context,
    moduleId,
    moduleDisplayName,
    role,
    field,
    previousValue,
    newValue,
  } = params;

  return {
    organization_id: context.organizationId,
    actor_id: context.actorId,
    actor_email: context.actorEmail,
    actor_name: context.actorName,
    action: PERMISSION_ACTIONS.FEATURE_PERMISSION_CHANGED,
    resource_type: PERMISSION_RESOURCE_TYPES.MODULE,
    resource_id: moduleId,
    resource_name: moduleDisplayName,
    changes: {
      [`${role}.${field}`]: { before: previousValue, after: newValue },
    },
    ip_address: context.ipAddress ?? null,
    user_agent: context.userAgent ?? null,
  };
}

/**
 * Builds individual audit entries for a module-level permissions update.
 * Bulk changes are tracked granularly — one entry per changed role — so that
 * each role's before/after state is independently queryable.
 *
 * Returns an empty array when no permissions actually changed.
 */
export function buildModulePermissionEntries(
  params: ModulePermissionChangeParams
): PermissionAuditEntry[] {
  const {
    context,
    moduleId,
    moduleDisplayName,
    previousPermissions,
    newPermissions,
  } = params;

  const diff = diffRolePermissions(previousPermissions, newPermissions);
  const changedRoles = Object.keys(diff) as ModuleRole[];

  if (changedRoles.length === 0) {
    return [];
  }

  // One entry per changed role for granular queryability.
  return changedRoles.map((role) => {
    const roleDiff = diff[role]!;
    const changes: ChangesMap = {};

    for (const [field, change] of Object.entries(roleDiff)) {
      changes[`${role}.${field}`] = change as FieldChange;
    }

    return {
      organization_id: context.organizationId,
      actor_id: context.actorId,
      actor_email: context.actorEmail,
      actor_name: context.actorName,
      action: PERMISSION_ACTIONS.MODULE_PERMISSIONS_UPDATED,
      resource_type: PERMISSION_RESOURCE_TYPES.MODULE,
      resource_id: moduleId,
      resource_name: moduleDisplayName,
      changes,
      ip_address: context.ipAddress ?? null,
      user_agent: context.userAgent ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Description resolver (for display without a full AuditLog fetch)
// ---------------------------------------------------------------------------

/**
 * Generates a human-readable description string from a persisted audit entry.
 * Useful for rendering change summaries in UI without re-fetching context.
 */
export function describePermissionEntry(entry: PermissionAuditEntry): string {
  if (entry.action === PERMISSION_ACTIONS.ROLE_CHANGED) {
    const change = entry.changes?.["role"] as FieldChange<Role> | undefined;
    if (change && entry.resource_name) {
      return formatRoleChangeDescription(
        entry.resource_name,
        change.before,
        change.after
      );
    }
  }

  if (
    entry.action === PERMISSION_ACTIONS.FEATURE_PERMISSION_CHANGED ||
    entry.action === PERMISSION_ACTIONS.MODULE_PERMISSIONS_UPDATED
  ) {
    const moduleName = entry.resource_name ?? entry.resource_id;
    const changedKeys = Object.keys(entry.changes ?? {});

    if (changedKeys.length === 0) {
      return `Updated permissions for ${moduleName}`;
    }

    // Derive affected roles from keys like "Admin.featureAccess"
    const roles = [
      ...new Set(changedKeys.map((k) => k.split(".")[0])),
    ] as ModuleRole[];

    return formatModulePermissionDescription(moduleName, roles);
  }

  return `Permission change: ${entry.action}`;
}
