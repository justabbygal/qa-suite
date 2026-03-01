import type { RegisteredModule } from "@/lib/modules/types";
import type { Role } from "@/lib/modules/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionField = "featureAccess" | "settingsAccess";

export interface PermissionUpdatePayload {
  moduleId: string;
  role: Role;
  field: PermissionField;
  value: boolean;
}

export interface BulkUpdateItem {
  moduleId: string;
  role: Role;
  field: PermissionField;
  value: boolean;
}

export interface BulkUpdateResult {
  succeeded: BulkUpdateItem[];
  failed: Array<{ item: BulkUpdateItem; error: string }>;
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

/**
 * Creates a deep clone of the modules array suitable for use as a rollback
 * snapshot. Only the permission-relevant fields are deeply copied.
 */
export function snapshotModules(modules: RegisteredModule[]): RegisteredModule[] {
  return modules.map((m) => ({
    ...m,
    permissions: {
      Owner: { ...m.permissions.Owner },
      Admin: { ...m.permissions.Admin },
      User: { ...m.permissions.User },
    },
  }));
}

// ---------------------------------------------------------------------------
// Optimistic update helpers
// ---------------------------------------------------------------------------

/**
 * Applies a single permission update optimistically to the modules array
 * without mutating the original. Returns a new array.
 *
 * Business rule: if featureAccess is turned off, settingsAccess is
 * automatically disabled as well because settings are meaningless without
 * feature access.
 */
export function applyOptimisticUpdate(
  modules: RegisteredModule[],
  update: PermissionUpdatePayload
): RegisteredModule[] {
  return modules.map((m) => {
    if (m.id !== update.moduleId) return m;

    const currentRole = m.permissions[update.role];
    const updatedRole = {
      ...currentRole,
      [update.field]: update.value,
      // Cascade: disabling featureAccess also disables settingsAccess
      ...(update.field === "featureAccess" && !update.value
        ? { settingsAccess: false }
        : {}),
    };

    return {
      ...m,
      permissions: {
        ...m.permissions,
        [update.role]: updatedRole,
      },
    };
  });
}

/**
 * Applies multiple optimistic updates sequentially, returning the final
 * modules array. Each update is applied to the result of the previous one
 * so cascading rules are respected.
 */
export function applyBulkOptimisticUpdates(
  modules: RegisteredModule[],
  updates: BulkUpdateItem[]
): RegisteredModule[] {
  return updates.reduce(
    (acc, update) => applyOptimisticUpdate(acc, update),
    modules
  );
}

/**
 * Restores a specific module's permissions to the values stored in the
 * snapshot, leaving all other modules untouched.
 */
export function revertModule(
  modules: RegisteredModule[],
  snapshot: RegisteredModule[],
  moduleId: string
): RegisteredModule[] {
  const snapshotModule = snapshot.find((m) => m.id === moduleId);
  if (!snapshotModule) return modules;

  return modules.map((m) =>
    m.id === moduleId
      ? { ...m, permissions: snapshotModule.permissions }
      : m
  );
}

// ---------------------------------------------------------------------------
// Permission key helper (used to key debounce timers)
// ---------------------------------------------------------------------------

/**
 * Returns a stable string key for a specific permission toggle.
 * Used to deduplicate debounce timers when a user clicks the same toggle
 * multiple times in quick succession.
 */
export function permissionKey(
  moduleId: string,
  role: Role,
  field: PermissionField
): string {
  return `${moduleId}::${role}::${field}`;
}
