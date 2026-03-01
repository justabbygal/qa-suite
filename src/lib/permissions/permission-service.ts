import { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./types";
import type { RolePermissions } from "@/lib/modules/types";
import type { OperationResult } from "./types";
import {
  buildRoleChangeEntry,
  buildFeaturePermissionEntry,
  buildModulePermissionEntries,
  diffRolePermissions,
  type PermissionAuditContext,
  type PermissionAuditEntry,
  type RoleChangeParams,
  type FeaturePermissionChangeParams,
  type ModulePermissionChangeParams,
} from "./audit-tracker";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Persists a single audit entry to the `audit_logs` table.
 * Returns an error message on failure, or null on success.
 */
async function insertAuditEntry(
  supabase: SupabaseClient,
  entry: PermissionAuditEntry
): Promise<string | null> {
  const { error } = await supabase.from("audit_logs").insert(entry);
  return error?.message ?? null;
}

/**
 * Persists multiple audit entries in a single batch insert.
 * Returns an error message on failure, or null on success.
 */
async function insertAuditEntries(
  supabase: SupabaseClient,
  entries: PermissionAuditEntry[]
): Promise<string | null> {
  if (entries.length === 0) return null;
  const { error } = await supabase.from("audit_logs").insert(entries);
  return error?.message ?? null;
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/**
 * Tracks a user role change by writing a granular audit entry.
 *
 * This should be called after validating the role change via
 * `updateUserRole` from `./user-management`, just before (or after)
 * persisting the role change to the database.
 */
export async function trackRoleChange(
  supabase: SupabaseClient,
  params: RoleChangeParams
): Promise<OperationResult<void>> {
  const entry = buildRoleChangeEntry(params);
  const error = await insertAuditEntry(supabase, entry);

  if (error) {
    return { success: false, error: `Failed to record role change: ${error}` };
  }

  return { success: true };
}

/**
 * Tracks a single feature or settings permission toggle on a module role.
 *
 * Call this after confirming the toggle with the user (e.g., after the
 * PermissionToggle's confirmation dialog resolves).
 */
export async function trackFeaturePermissionChange(
  supabase: SupabaseClient,
  params: FeaturePermissionChangeParams
): Promise<OperationResult<void>> {
  const entry = buildFeaturePermissionEntry(params);
  const error = await insertAuditEntry(supabase, entry);

  if (error) {
    return {
      success: false,
      error: `Failed to record permission change: ${error}`,
    };
  }

  return { success: true };
}

/**
 * Tracks a module-level permissions update, diffing old vs new state and
 * writing one audit entry per changed role. Bulk changes are therefore
 * captured individually for granular querying.
 *
 * Returns `{ success: true }` immediately when no permissions changed.
 */
export async function trackModulePermissionUpdate(
  supabase: SupabaseClient,
  params: ModulePermissionChangeParams
): Promise<OperationResult<void>> {
  const entries = buildModulePermissionEntries(params);

  if (entries.length === 0) {
    return { success: true };
  }

  const error = await insertAuditEntries(supabase, entries);

  if (error) {
    return {
      success: false,
      error: `Failed to record module permission update: ${error}`,
    };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Composite operations
// ---------------------------------------------------------------------------

/** Parameters for a combined role-update-and-track call. */
export interface UpdateAndTrackRoleParams {
  context: PermissionAuditContext;
  targetUserId: string;
  targetUserEmail: string;
  targetUserName: string;
  previousRole: Role;
  newRole: Role;
  /** Callback that performs the actual role update in the database. */
  persist: () => Promise<void>;
}

/**
 * Updates a user's role and records the change in the audit log.
 *
 * The `persist` callback is called first; if it throws, no audit entry is
 * written (fail-open: we never log changes that didn't happen).
 */
export async function updateAndTrackRole(
  supabase: SupabaseClient,
  params: UpdateAndTrackRoleParams
): Promise<OperationResult<void>> {
  try {
    await params.persist();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Role update failed: ${message}` };
  }

  return trackRoleChange(supabase, {
    context: params.context,
    targetUserId: params.targetUserId,
    targetUserEmail: params.targetUserEmail,
    targetUserName: params.targetUserName,
    previousRole: params.previousRole,
    newRole: params.newRole,
  });
}

/** Parameters for a combined module-permission-update-and-track call. */
export interface UpdateAndTrackModulePermissionsParams {
  context: PermissionAuditContext;
  moduleId: string;
  moduleDisplayName: string;
  previousPermissions: RolePermissions;
  newPermissions: RolePermissions;
  /** Callback that persists the updated permissions to the database. */
  persist: () => Promise<void>;
}

/**
 * Updates module permissions and records granular per-role audit entries.
 *
 * Diffs old vs new permissions before persisting; only changed roles are
 * logged. The `persist` callback is invoked first — if it throws, no audit
 * entries are written.
 */
export async function updateAndTrackModulePermissions(
  supabase: SupabaseClient,
  params: UpdateAndTrackModulePermissionsParams
): Promise<OperationResult<void>> {
  // Early exit: nothing changed, nothing to do.
  const diff = diffRolePermissions(
    params.previousPermissions,
    params.newPermissions
  );
  if (Object.keys(diff).length === 0) {
    return { success: true };
  }

  try {
    await params.persist();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: `Module permission update failed: ${message}`,
    };
  }

  return trackModulePermissionUpdate(supabase, {
    context: params.context,
    moduleId: params.moduleId,
    moduleDisplayName: params.moduleDisplayName,
    previousPermissions: params.previousPermissions,
    newPermissions: params.newPermissions,
  });
}
