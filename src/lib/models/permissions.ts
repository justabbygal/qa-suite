import { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreatePermission,
  CreatePermissionAuditLogEntry,
  PaginatedPermissionAuditLog,
  PaginationParams,
  Permission,
  PermissionAuditLogEntry,
  PermissionAuditLogFilters,
  PermissionLookupKey,
  PermissionRole,
  PermissionUpdate,
} from "@/lib/types/permissions";

// ---------------------------------------------------------------------------
// Internal mappers — snake_case DB rows → camelCase TS interfaces
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToPermission(row: Record<string, any>): Permission {
  return {
    id: row["id"] as string,
    organizationId: row["organization_id"] as string,
    module: row["module"] as string,
    role: row["role"] as PermissionRole,
    featureAccess: row["feature_access"] as boolean,
    settingsAccess: row["settings_access"] as boolean,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToAuditLogEntry(row: Record<string, any>): PermissionAuditLogEntry {
  return {
    id: row["id"] as string,
    organizationId: row["organization_id"] as string,
    module: row["module"] as string,
    role: row["role"] as PermissionRole,
    actorId: row["actor_id"] as string,
    actorEmail: row["actor_email"] as string,
    actorName: row["actor_name"] as string,
    changedField: row["changed_field"] as "feature_access" | "settings_access",
    previousValue: row["previous_value"] as boolean,
    newValue: row["new_value"] as boolean,
    ipAddress: (row["ip_address"] as string | null) ?? null,
    userAgent: (row["user_agent"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
  };
}

const PERMISSIONS_TABLE = "module_permissions";
const AUDIT_LOG_TABLE = "permission_audit_log";
const DEFAULT_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// module_permissions queries
// ---------------------------------------------------------------------------

/**
 * Returns all permission rows for an organization.
 * Results are ordered by module then role for stable rendering.
 */
export async function getPermissions(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Permission[]> {
  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .order("module", { ascending: true })
    .order("role", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch permissions: ${error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => mapToPermission(row));
}

/**
 * Returns all permission rows for a specific module within an organization
 * (one row per role).
 */
export async function getModulePermissions(
  supabase: SupabaseClient,
  organizationId: string,
  module: string
): Promise<Permission[]> {
  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("module", module)
    .order("role", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to fetch permissions for module '${module}': ${error.message}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => mapToPermission(row));
}

/**
 * Returns the permission row for a specific org + module + role triplet,
 * or null if no override has been stored.
 */
export async function getPermission(
  supabase: SupabaseClient,
  key: PermissionLookupKey
): Promise<Permission | null> {
  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .select("*")
    .eq("organization_id", key.organizationId)
    .eq("module", key.module)
    .eq("role", key.role)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch permission: ${error.message}`);
  }

  return data ? mapToPermission(data) : null;
}

/**
 * Creates a new permission row.
 * Throws if a row for the same (organizationId, module, role) already exists.
 */
export async function createPermission(
  supabase: SupabaseClient,
  permission: CreatePermission
): Promise<Permission> {
  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .insert({
      organization_id: permission.organizationId,
      module: permission.module,
      role: permission.role,
      feature_access: permission.featureAccess,
      settings_access: permission.settingsAccess,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create permission: ${error?.message ?? "unknown error"}`
    );
  }

  return mapToPermission(data);
}

/**
 * Updates an existing permission row identified by its primary key.
 * Automatically enforces the business rule: if featureAccess is being set
 * to false, settingsAccess is also forced to false.
 */
export async function updatePermission(
  supabase: SupabaseClient,
  id: string,
  updates: PermissionUpdate
): Promise<Permission> {
  const patch: Record<string, boolean> = {};

  if (updates.featureAccess !== undefined) {
    patch["feature_access"] = updates.featureAccess;
    // Enforce the business rule at the model layer as a safety net.
    if (!updates.featureAccess) {
      patch["settings_access"] = false;
    }
  }

  if (updates.settingsAccess !== undefined) {
    patch["settings_access"] = updates.settingsAccess;
  }

  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to update permission: ${error?.message ?? "unknown error"}`
    );
  }

  return mapToPermission(data);
}

/**
 * Inserts a new permission row, or updates the existing row for the same
 * (organizationId, module, role) triplet.  Mirrors Supabase's upsert
 * semantics with the unique constraint as the conflict target.
 *
 * Automatically enforces the featureAccess → settingsAccess business rule.
 */
export async function upsertPermission(
  supabase: SupabaseClient,
  permission: CreatePermission
): Promise<Permission> {
  // Apply the business constraint before writing.
  const featureAccess = permission.featureAccess;
  const settingsAccess = featureAccess ? permission.settingsAccess : false;

  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .upsert(
      {
        organization_id: permission.organizationId,
        module: permission.module,
        role: permission.role,
        feature_access: featureAccess,
        settings_access: settingsAccess,
      },
      { onConflict: "organization_id,module,role" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to upsert permission: ${error?.message ?? "unknown error"}`
    );
  }

  return mapToPermission(data);
}

/**
 * Deletes a permission row by its primary key.
 * After deletion the system falls back to module default access.
 */
export async function deletePermission(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from(PERMISSIONS_TABLE)
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete permission: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// permission_audit_log queries
// ---------------------------------------------------------------------------

/**
 * Appends a new entry to the permission audit log.
 * Non-throwing: errors are logged to console so an audit failure never
 * disrupts the permission-change flow.
 */
export async function logPermissionChange(
  supabase: SupabaseClient,
  entry: CreatePermissionAuditLogEntry
): Promise<void> {
  try {
    const { error } = await supabase.from(AUDIT_LOG_TABLE).insert({
      organization_id: entry.organizationId,
      module: entry.module,
      role: entry.role,
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      actor_name: entry.actorName,
      changed_field: entry.changedField,
      previous_value: entry.previousValue,
      new_value: entry.newValue,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });

    if (error) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "permission-audit-log",
          event: "insert_failed",
          error: error.message,
          organization_id: entry.organizationId,
          module: entry.module,
          role: entry.role,
        })
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: "permission-audit-log",
        event: "unexpected_error",
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/**
 * Dispatches a permission audit log write without blocking the caller.
 * Use in synchronous contexts where you cannot await.
 */
export function logPermissionChangeFireAndForget(
  supabase: SupabaseClient,
  entry: CreatePermissionAuditLogEntry
): void {
  void logPermissionChange(supabase, entry);
}

/**
 * Returns a paginated list of permission audit log entries for an organization.
 * Entries are ordered newest-first by default.
 */
export async function getPermissionAuditLog(
  supabase: SupabaseClient,
  organizationId: string,
  filters: PermissionAuditLogFilters = {},
  pagination: PaginationParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE }
): Promise<PaginatedPermissionAuditLog> {
  const { page, pageSize } = pagination;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from(AUDIT_LOG_TABLE)
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.module) {
    query = query.eq("module", filters.module);
  }
  if (filters.role) {
    query = query.eq("role", filters.role);
  }
  if (filters.actorId) {
    query = query.eq("actor_id", filters.actorId);
  }
  if (filters.changedField) {
    query = query.eq("changed_field", filters.changedField);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch permission audit log: ${error.message}`);
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: (data ?? []).map((row: any) => mapToAuditLogEntry(row)),
    total: count ?? 0,
  };
}
