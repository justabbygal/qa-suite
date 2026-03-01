/**
 * Default permission generation for module registration.
 *
 * When a module registers with the system, this service creates explicit
 * permission rows in the `module_permissions` table for all three roles,
 * derived from the module's manifest defaults.
 *
 * Permission key convention (used by the dynamic resolver):
 *   {module-slug}.featureAccess   — whether the role can use the feature
 *   {module-slug}.settingsAccess  — whether the role can configure settings
 *
 * Business rules enforced:
 *   1. Feature access permissions are always created for all three roles.
 *   2. Settings access is only set to true when hasSettings=true AND the
 *      manifest grants the role settingsAccess. When hasSettings=false,
 *      settingsAccess is forced to false for all roles.
 *   3. If any permission row fails to create, all rows created in the
 *      same batch are rolled back (deleted) before the error is thrown.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { RegisteredModule, Role } from '@/lib/modules/types';
import type { Permission, PermissionRole } from '@/lib/types/permissions';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PermissionGeneratorError extends Error {
  constructor(
    message: string,
    public readonly code: 'CREATION_FAILED' | 'CLEANUP_FAILED' | 'ROLLBACK_FAILED'
  ) {
    super(message);
    this.name = 'PermissionGeneratorError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERMISSIONS_TABLE = 'module_permissions';

/** Maps capitalized role (RegisteredModule format) to lowercase DB format. */
const ROLE_MAP: Record<Role, PermissionRole> = {
  Owner: 'owner',
  Admin: 'admin',
  User: 'user',
};

const ROLES: Role[] = ['Owner', 'Admin', 'User'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates default `module_permissions` rows for all three roles when a module
 * registers.
 *
 * - Feature access rows are always created for all three roles.
 * - Settings access is forced to false when `module.hasSettings` is false,
 *   regardless of what the manifest specifies for that role.
 * - On partial failure, all already-created rows are rolled back before
 *   throwing {@link PermissionGeneratorError}.
 *
 * @returns The created {@link Permission} rows (one per role, in Owner→Admin→User order).
 */
export async function generateDefaultPermissions(
  supabase: SupabaseClient,
  module: RegisteredModule
): Promise<Permission[]> {
  const created: Permission[] = [];

  try {
    for (const role of ROLES) {
      const access = module.permissions[role];
      const row = await insertPermissionRow(supabase, {
        organizationId: module.organizationId,
        module: module.module,
        role: ROLE_MAP[role],
        featureAccess: access.featureAccess,
        // Settings access is only meaningful when hasSettings=true.
        settingsAccess: module.hasSettings ? access.settingsAccess : false,
      });
      created.push(row);
    }
  } catch (error) {
    // Rollback: delete any rows already inserted before re-throwing.
    if (created.length > 0) {
      await rollbackPermissions(supabase, created.map((p) => p.id));
    }
    throw new PermissionGeneratorError(
      `Failed to create default permissions for module '${module.module}': ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
      'CREATION_FAILED'
    );
  }

  return created;
}

/**
 * Deletes all `module_permissions` rows for a module within an organization.
 *
 * Called during module deregistration to ensure no orphaned permission rows
 * remain after a module is removed from the system.
 *
 * @throws {@link PermissionGeneratorError} if the database deletion fails.
 */
export async function cleanupModulePermissions(
  supabase: SupabaseClient,
  organizationId: string,
  moduleName: string
): Promise<void> {
  const { error } = await supabase
    .from(PERMISSIONS_TABLE)
    .delete()
    .eq('organization_id', organizationId)
    .eq('module', moduleName);

  if (error) {
    throw new PermissionGeneratorError(
      `Failed to clean up permissions for module '${moduleName}': ${error.message}`,
      'CLEANUP_FAILED'
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PermissionInsertInput {
  organizationId: string;
  module: string;
  role: PermissionRole;
  featureAccess: boolean;
  settingsAccess: boolean;
}

async function insertPermissionRow(
  supabase: SupabaseClient,
  input: PermissionInsertInput
): Promise<Permission> {
  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .insert({
      organization_id: input.organizationId,
      module: input.module,
      role: input.role,
      feature_access: input.featureAccess,
      settings_access: input.settingsAccess,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to insert permission row for role '${input.role}': ${
        error?.message ?? 'no data returned'
      }`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as Record<string, any>;
  return {
    id: row['id'] as string,
    organizationId: row['organization_id'] as string,
    module: row['module'] as string,
    role: row['role'] as PermissionRole,
    featureAccess: row['feature_access'] as boolean,
    settingsAccess: row['settings_access'] as boolean,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

/**
 * Best-effort rollback: deletes permission rows by their primary-key IDs.
 * Errors are logged but never re-thrown, to avoid masking the original failure.
 */
async function rollbackPermissions(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase.from(PERMISSIONS_TABLE).delete().in('id', ids);

  if (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'permission-generator',
        event: 'rollback_failed',
        permissionIds: ids,
        error: error.message,
      })
    );
  }
}
