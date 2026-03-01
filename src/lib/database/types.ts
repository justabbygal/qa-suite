/**
 * Database type definitions for the modules table.
 *
 * These interfaces use snake_case column names to match the PostgreSQL schema
 * exactly. Application-level code should use the camelCase types from the
 * modules service instead; these types are intended for mapping layers and
 * low-level database utilities.
 *
 * Table covered by this file:
 *   - modules  (see: supabase/migrations/20260301000004_create_permissions_tables.sql)
 *
 * For users, invitations, module_permissions, and permission_audit_log types
 * see: src/lib/database/schema.ts
 */

// ---------------------------------------------------------------------------
// modules table
// ---------------------------------------------------------------------------

/**
 * Default access configuration stored as JSON in the `default_access_json`
 * column. Keys are lowercase role names; values are the two-layer access flags.
 *
 * Example:
 *   {
 *     "owner": { "feature_access": true,  "settings_access": true  },
 *     "admin": { "feature_access": true,  "settings_access": false },
 *     "user":  { "feature_access": false, "settings_access": false }
 *   }
 */
export interface DbModuleDefaultAccess {
  feature_access: boolean;
  settings_access: boolean;
}

export type DbModuleDefaultAccessJson = {
  owner?: DbModuleDefaultAccess;
  admin?: DbModuleDefaultAccess;
  user?: DbModuleDefaultAccess;
};

/** Raw row shape for the `modules` table. */
export interface DbModule {
  id: string;
  organization_id: string;
  module_key: string;
  display_name: string;
  has_settings: boolean;
  default_access_json: DbModuleDefaultAccessJson;
  created_at: string;
  updated_at: string;
}

/** Insert payload for the `modules` table (id and timestamps default). */
export type DbModuleInsert = Omit<DbModule, "id" | "created_at" | "updated_at">;

/** Update payload for the `modules` table. */
export type DbModuleUpdate = Partial<
  Pick<DbModule, "display_name" | "has_settings" | "default_access_json" | "updated_at">
>;

// ---------------------------------------------------------------------------
// Column-to-camelCase mapping helper
// ---------------------------------------------------------------------------

/**
 * Maps a raw DbModule row to camelCase field names.
 * Use this in repository/service layers when converting DB results.
 */
export function mapDbModule(row: DbModule) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    moduleKey: row.module_key,
    displayName: row.display_name,
    hasSettings: row.has_settings,
    defaultAccessJson: row.default_access_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as const;
}
