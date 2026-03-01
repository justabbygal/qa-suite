/**
 * Database schema type definitions — raw row shapes returned by Supabase.
 *
 * These interfaces use snake_case column names to match the PostgreSQL schema
 * exactly. Application-level code should use the camelCase types from
 * `src/lib/types/user.ts` instead; these types are intended for mapping
 * layers, migrations, and low-level database utilities.
 *
 * Tables covered by this file:
 *   - users          (see: supabase/migrations/001_create_users_schema.sql)
 *   - invitations    (see: supabase/migrations/001_create_users_schema.sql)
 *   - module_permissions  (see: supabase/migrations/20260301000001_permission_management.sql)
 *   - permission_audit_log (see above)
 */

// ---------------------------------------------------------------------------
// Shared scalar types
// ---------------------------------------------------------------------------

/** Capitalized role enum stored in the `user_role` DB type. */
export type DbUserRole = "Owner" | "Admin" | "User";

/** Status enum stored in the `user_status` DB type. */
export type DbUserStatus = "active" | "invited" | "expired";

/** Lowercase role enum stored in the `permission_role` DB type. */
export type DbPermissionRole = "owner" | "admin" | "user";

/** Permission layer enum stored in the `permission_level` DB type. */
export type DbPermissionLevel = "feature_access" | "settings_access";

// ---------------------------------------------------------------------------
// users table
// ---------------------------------------------------------------------------

/** Raw row shape for the `users` table. */
export interface DbUser {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: DbUserRole;
  status: DbUserStatus;
  created_at: string;
  updated_at: string;
}

/** Insert payload for the `users` table (timestamps default to now()). */
export type DbUserInsert = Omit<DbUser, "created_at" | "updated_at">;

/** Update payload for the `users` table. */
export type DbUserUpdate = Partial<Pick<DbUser, "name" | "role" | "status" | "updated_at">>;

// ---------------------------------------------------------------------------
// invitations table
// ---------------------------------------------------------------------------

/** Raw row shape for the `invitations` table. */
export interface DbInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: DbUserRole;
  invited_by: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/** Insert payload for the `invitations` table (id and created_at default). */
export type DbInvitationInsert = Omit<DbInvitation, "id" | "created_at">;

/** Update payload for the `invitations` table (used when accepting or rotating). */
export type DbInvitationUpdate = Partial<Pick<DbInvitation, "token" | "expires_at" | "used_at">>;

// ---------------------------------------------------------------------------
// module_permissions table
// ---------------------------------------------------------------------------

/** Raw row shape for the `module_permissions` table. */
export interface DbModulePermission {
  id: string;
  organization_id: string;
  module: string;
  role: DbPermissionRole;
  feature_access: boolean;
  settings_access: boolean;
  created_at: string;
  updated_at: string;
}

/** Insert payload for the `module_permissions` table. */
export type DbModulePermissionInsert = Omit<DbModulePermission, "id" | "created_at" | "updated_at">;

/** Update payload for the `module_permissions` table. */
export type DbModulePermissionUpdate = Partial<
  Pick<DbModulePermission, "feature_access" | "settings_access" | "updated_at">
>;

// ---------------------------------------------------------------------------
// permission_audit_log table
// ---------------------------------------------------------------------------

/** Raw row shape for the `permission_audit_log` table. */
export interface DbPermissionAuditLog {
  id: string;
  organization_id: string;
  module: string;
  role: DbPermissionRole;
  actor_id: string;
  actor_email: string;
  actor_name: string;
  changed_field: DbPermissionLevel;
  previous_value: boolean;
  new_value: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Insert payload for the `permission_audit_log` table (id and created_at default). */
export type DbPermissionAuditLogInsert = Omit<DbPermissionAuditLog, "id" | "created_at">;

// ---------------------------------------------------------------------------
// Column-to-camelCase mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw DbUser row to camelCase field names.
 * Use this in repository/service layers when converting DB results.
 */
export function mapDbUser(row: DbUser) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as const;
}

/**
 * Maps a raw DbInvitation row to camelCase field names.
 * The token field is included here; callers must strip it before external exposure.
 */
export function mapDbInvitation(row: DbInvitation) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    token: row.token,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  } as const;
}
