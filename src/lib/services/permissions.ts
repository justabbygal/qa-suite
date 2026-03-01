/**
 * Permission service layer.
 *
 * Provides CRUD operations for permission management with role hierarchy
 * enforcement, audit logging, and organization scoping.
 *
 * Design principles:
 * - Non-blocking audit: all audit writes use fire-and-forget so failures
 *   never disrupt the permission-change flow.
 * - Granular audit: one entry per atomic change (one per role × field pair).
 * - Role hierarchy: Admin cannot edit Owner or Admin permissions.
 * - Immutable audit: entries are insert-only (no UPDATE or DELETE in RLS).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { RolePermissions, Role as ModuleRole, RegisteredModule } from "@/lib/modules/types";
import type { Role as LowercaseRole } from "@/lib/permissions/types";
import type {
  CreatePermissionAuditLogEntry,
  PermissionLevel,
  PermissionRole,
} from "@/lib/types/permissions";
import { logPermissionChangeFireAndForget } from "@/lib/models/permissions";
import {
  getModule as fetchModuleById,
  updateModule,
  getModules as fetchModules,
} from "@/lib/modules/moduleService";
import { applyPermissionConstraints } from "@/lib/modules/permissionGenerator";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PermissionServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "DATABASE_ERROR"
  ) {
    super(message);
    this.name = "PermissionServiceError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MODULE_ROLES = new Set<ModuleRole>(["Owner", "Admin", "User"]);

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

const ROLE_MAP: { capitalized: ModuleRole; db: PermissionRole }[] = [
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

// ---------------------------------------------------------------------------
// Role hierarchy
// ---------------------------------------------------------------------------

/**
 * Returns true if an actor with the given role may modify permissions for the
 * target role.
 *
 * Business rules:
 * - Owner: may edit permissions for any role (Owner, Admin, User).
 * - Admin: may only edit User permissions; cannot edit Owner or Admin.
 * - User: may not edit any permissions.
 *
 * @param actorRole  - Lowercase role of the user making the change.
 * @param targetRole - Lowercase role whose permissions are being changed.
 */
export function canEditPermissions(
  actorRole: LowercaseRole,
  targetRole: LowercaseRole
): boolean {
  switch (actorRole) {
    case "owner":
      return true;
    case "admin":
      return targetRole === "user";
    case "user":
      return false;
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Fetches all registered modules with their current permission state for an
 * organization, ordered by registration time (oldest first).
 *
 * @param supabase        - Supabase client (anon or service role).
 * @param organizationId  - UUID of the organization.
 */
export async function getPermissionsByOrganization(
  supabase: SupabaseClient,
  organizationId: string
): Promise<RegisteredModule[]> {
  if (!organizationId) {
    throw new PermissionServiceError(
      "organizationId is required",
      "INVALID_INPUT"
    );
  }

  try {
    return await fetchModules(supabase, organizationId);
  } catch (error) {
    throw new PermissionServiceError(
      `Failed to fetch permissions: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      "DATABASE_ERROR"
    );
  }
}

/**
 * Fetches registered modules for an organization.
 *
 * Thin alias for `getPermissionsByOrganization` — useful when callers think
 * of the operation as "get modules" rather than "get permissions".
 *
 * @param supabase        - Supabase client.
 * @param organizationId  - UUID of the organization.
 */
export async function getModules(
  supabase: SupabaseClient,
  organizationId: string
): Promise<RegisteredModule[]> {
  return getPermissionsByOrganization(supabase, organizationId);
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/** Parameters for {@link updatePermissions}. */
export interface UpdatePermissionsParams {
  /** UUID of the organization that owns the module. */
  organizationId: string;
  /** UUID of the module registration record. */
  moduleId: string;
  /** Lowercase role of the user making the change (used for hierarchy check). */
  actorRole: LowercaseRole;
  /**
   * Partial permission overrides to merge with the current state.
   * Only the provided roles and fields are changed.
   */
  updates: Partial<RolePermissions>;
  /** Identity of the user making the change (written to audit log). */
  actor: PermissionChangeActor;
}

/**
 * Updates permissions for a module with role hierarchy enforcement and audit
 * logging.
 *
 * Enforced invariants:
 * - Role hierarchy: the actor must have edit access for every target role in
 *   `updates` (Admin cannot edit Owner or Admin permissions).
 * - settingsAccess constraint: automatically forced to false when
 *   featureAccess is false.
 * - Organization scope: the module must belong to the actor's organization.
 *
 * Audit entries are written as fire-and-forget so a logging failure never
 * blocks the caller.
 *
 * @param supabase - Admin Supabase client (service role for bypassing RLS).
 * @param params   - Update parameters.
 * @returns The updated module with its full permission state.
 * @throws {PermissionServiceError} On hierarchy violation, missing module, or
 *         organization mismatch.
 */
export async function updatePermissions(
  supabase: SupabaseClient,
  params: UpdatePermissionsParams
): Promise<RegisteredModule> {
  const { organizationId, moduleId, actorRole, updates, actor } = params;

  if (!organizationId || !moduleId) {
    throw new PermissionServiceError(
      "organizationId and moduleId are required",
      "INVALID_INPUT"
    );
  }

  // Role hierarchy check — validate actor can edit each target role.
  for (const role of Object.keys(updates) as ModuleRole[]) {
    if (!MODULE_ROLES.has(role)) continue;
    const lowercaseRole = role.toLowerCase() as LowercaseRole;
    if (!canEditPermissions(actorRole, lowercaseRole)) {
      throw new PermissionServiceError(
        `Role '${actorRole}' cannot edit permissions for '${role}'`,
        "FORBIDDEN"
      );
    }
  }

  // Fetch the current module state.
  const currentModule = await fetchModuleById(supabase, moduleId);
  if (!currentModule) {
    throw new PermissionServiceError(
      `Module not found: ${moduleId}`,
      "NOT_FOUND"
    );
  }

  // Organization scope check.
  if (currentModule.organizationId !== organizationId) {
    throw new PermissionServiceError(
      "Module does not belong to this organization",
      "FORBIDDEN"
    );
  }

  // Deep-merge the incoming updates with the current permission state.
  const merged: RolePermissions = {
    Owner: { ...currentModule.permissions.Owner },
    Admin: { ...currentModule.permissions.Admin },
    User: { ...currentModule.permissions.User },
  };

  for (const [role, access] of Object.entries(updates)) {
    if (!MODULE_ROLES.has(role as ModuleRole) || !access) continue;
    merged[role as ModuleRole] = { ...merged[role as ModuleRole], ...access };
  }

  // Enforce: settingsAccess must be false when featureAccess is false.
  const constrained = applyPermissionConstraints(merged);

  // Persist the merged, constrained permissions.
  const updated = await updateModule(supabase, moduleId, {
    permissions: constrained,
  });

  // Audit log — fire-and-forget so logging failures never block the caller.
  logPermissionChanges(
    supabase,
    organizationId,
    currentModule.module,
    currentModule.permissions,
    updated.permissions,
    actor
  );

  return updated;
}
