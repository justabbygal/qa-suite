import { SupabaseClient } from "@supabase/supabase-js";
import { RegisteredModule } from "@/lib/modules/types";
import { getModules } from "@/lib/modules/moduleService";
import {
  getPermissions,
  getModulePermissions as fetchModulePermissions,
} from "@/lib/models/permissions";
import type { Permission } from "@/lib/types/permissions";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ModuleListingError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_INPUT" | "DATABASE_ERROR"
  ) {
    super(message);
    this.name = "ModuleListingError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A registered module enriched with its per-role permission override rows
 * from the `module_permissions` table.
 *
 * `permissionOverrides` contains up to three rows (one per role: owner, admin,
 * user) for the module within the organization.  An empty array means no
 * explicit overrides have been written yet, and the system falls back to the
 * JSONB `permissions` defaults stored in `registered_modules`.
 */
export interface ModuleWithPermissions extends RegisteredModule {
  permissionOverrides: Permission[];
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Returns all modules registered for the given organization, ordered by
 * creation time (oldest first).
 *
 * Each module's JSONB `permissions` field contains the two-layer default
 * access for all three roles.  For explicit per-role override rows see
 * `getModulesWithPermissions`.
 */
export async function getRegisteredModules(
  supabase: SupabaseClient,
  organizationId: string
): Promise<RegisteredModule[]> {
  if (!organizationId) {
    throw new ModuleListingError("organizationId is required", "INVALID_INPUT");
  }

  try {
    return await getModules(supabase, organizationId);
  } catch (error) {
    throw new ModuleListingError(
      `Failed to fetch registered modules: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      "DATABASE_ERROR"
    );
  }
}

/**
 * Returns permission override rows from the `module_permissions` table for
 * the given organization, optionally filtered to a single module.
 *
 * Each row represents the effective two-layer permission (feature_access +
 * settings_access) for one org + module + role triplet.
 *
 * @param moduleName - When provided only rows for that module are returned.
 */
export async function getModulePermissions(
  supabase: SupabaseClient,
  organizationId: string,
  moduleName?: string
): Promise<Permission[]> {
  if (!organizationId) {
    throw new ModuleListingError("organizationId is required", "INVALID_INPUT");
  }

  try {
    if (moduleName) {
      return await fetchModulePermissions(supabase, organizationId, moduleName);
    }
    return await getPermissions(supabase, organizationId);
  } catch (error) {
    throw new ModuleListingError(
      `Failed to fetch module permissions: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      "DATABASE_ERROR"
    );
  }
}

/**
 * Returns all registered modules for the organization, each enriched with
 * their explicit permission override rows from `module_permissions`.
 *
 * Both queries are executed in parallel for efficiency.  The resulting
 * `permissionOverrides` array on each module contains up to three rows
 * (owner, admin, user) and is empty when no overrides exist.
 */
export async function getModulesWithPermissions(
  supabase: SupabaseClient,
  organizationId: string
): Promise<ModuleWithPermissions[]> {
  if (!organizationId) {
    throw new ModuleListingError("organizationId is required", "INVALID_INPUT");
  }

  try {
    const [modules, allPermissions] = await Promise.all([
      getModules(supabase, organizationId),
      getPermissions(supabase, organizationId),
    ]);

    // Group permission rows by module slug for O(n) lookup.
    const permissionsByModule = new Map<string, Permission[]>();
    for (const permission of allPermissions) {
      const bucket = permissionsByModule.get(permission.module) ?? [];
      bucket.push(permission);
      permissionsByModule.set(permission.module, bucket);
    }

    return modules.map((module) => ({
      ...module,
      permissionOverrides: permissionsByModule.get(module.module) ?? [],
    }));
  } catch (error) {
    if (error instanceof ModuleListingError) throw error;
    throw new ModuleListingError(
      `Failed to fetch modules with permissions: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      "DATABASE_ERROR"
    );
  }
}
