/**
 * Permission change audit service.
 *
 * Provides a thin layer over the permission model that computes before/after
 * diffs and dispatches audit log entries for every changed (role × field) pair.
 *
 * Design principles:
 * - Non-blocking: all writes use fire-and-forget so audit failures never
 *   disrupt the permission-change flow.
 * - Granular: one audit entry per atomic change (one per role × field pair).
 * - Immutable: audit entries are insert-only (the permission_audit_log table
 *   has no UPDATE or DELETE grants in RLS).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { RolePermissions, Role } from "@/lib/modules/types";
import type {
  CreatePermissionAuditLogEntry,
  PermissionLevel,
  PermissionRole,
} from "@/lib/types/permissions";
import { logPermissionChangeFireAndForget } from "@/lib/models/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context about the user who initiated the permission change. */
export interface PermissionChangeActor {
  /** ID of the user from the authentication system. */
  id: string;
  /** Email address — denormalized for audit log readability. */
  email: string;
  /** Display name — denormalized for audit log readability. */
  name: string;
  /** Client IP address extracted from request headers, if available. */
  ipAddress?: string | null;
  /** User-Agent string from the request, if available. */
  userAgent?: string | null;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const ROLE_MAP: { capitalized: Role; db: PermissionRole }[] = [
  { capitalized: "Owner", db: "owner" },
  { capitalized: "Admin", db: "admin" },
  { capitalized: "User", db: "user" },
];

const FIELD_MAP: {
  key: "featureAccess" | "settingsAccess";
  dbField: PermissionLevel;
}[] = [
  { key: "featureAccess", dbField: "feature_access" },
  { key: "settingsAccess", dbField: "settings_access" },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the diff between two permission states and dispatches audit log
 * entries for every changed (role × field) pair.
 *
 * Uses fire-and-forget so an audit write failure never blocks the caller.
 * If `before` and `after` are identical, no entries are written.
 *
 * For a bulk toggle that changes featureAccess across all three roles,
 * this produces up to six entries (3 roles × 2 fields), but only writes
 * entries for fields that actually changed — so a bulk featureAccess-only
 * change produces exactly 3 entries, one per role.
 *
 * @param supabase      - Admin Supabase client (bypasses RLS for inserts).
 * @param organizationId - Organization scope for the log entries.
 * @param module        - Kebab-case module identifier (e.g. "user-management").
 * @param before        - Full permission state before the change.
 * @param after         - Full permission state after the change.
 * @param actor         - Identity of the user who made the change.
 */
export function logPermissionChanges(
  supabase: SupabaseClient,
  organizationId: string,
  module: string,
  before: RolePermissions,
  after: RolePermissions,
  actor: PermissionChangeActor
): void {
  for (const { capitalized, db } of ROLE_MAP) {
    for (const { key, dbField } of FIELD_MAP) {
      const previousValue = before[capitalized][key];
      const newValue = after[capitalized][key];

      if (previousValue === newValue) continue;

      const entry: CreatePermissionAuditLogEntry = {
        organizationId,
        module,
        role: db,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        changedField: dbField,
        previousValue,
        newValue,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      };

      logPermissionChangeFireAndForget(supabase, entry);
    }
  }
}

/**
 * Looks up the email and display name for a user from the public users table.
 *
 * Returns placeholder strings if the lookup fails so that audit logging can
 * still proceed — a missing actor name is better than blocking the request.
 *
 * @param supabase - Admin Supabase client.
 * @param userId   - ID of the user to look up.
 */
export async function resolveActorInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<{ email: string; name: string }> {
  try {
    const { data } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", userId)
      .maybeSingle();

    if (data?.email) {
      return { email: data.email as string, name: (data.name as string) ?? "" };
    }
  } catch {
    // Fall through to placeholder
  }

  return { email: "unknown@unknown", name: "Unknown User" };
}
