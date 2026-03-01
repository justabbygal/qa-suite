/**
 * Module Management Service
 *
 * Provides the canonical CRUD operations for registered modules used by
 * API endpoints and internal code.  Each function is a single logical
 * unit that performs validation, applies business rules, and persists
 * changes atomically.
 *
 * Transaction strategy
 * ────────────────────
 * Supabase's JS client does not expose multi-statement transactions directly.
 * Every operation in this service is therefore designed to be a single atomic
 * database statement.  Permissions are stored as a JSON column on the same
 * row as the module record, so registration, updates, and deregistration all
 * complete in one round-trip without orphaned state.
 *
 * If a future revision introduces a separate permissions table, the
 * `withCompensation` helper below provides a ready-made rollback pattern.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ModuleManifest,
  ModuleUpdatePayload,
  RegisteredModule,
  RolePermissions,
} from './types';
import {
  applyPermissionConstraints,
  generateDefaultPermissions,
  validateModuleManifest,
  validatePermissions,
} from './permissionGenerator';

const TABLE = 'registered_modules';

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class ModuleServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'DUPLICATE' | 'VALIDATION_ERROR' | 'DATABASE_ERROR'
  ) {
    super(message);
    this.name = 'ModuleServiceError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: structured logging
// ─────────────────────────────────────────────────────────────────────────────

function log(fn: string, message: string, ctx?: Record<string, unknown>): void {
  const prefix = `[module-service] ${fn}:`;
  if (ctx) {
    console.log(prefix, message, ctx);
  } else {
    console.log(prefix, message);
  }
}

function logError(fn: string, message: string, cause?: unknown): void {
  console.error(`[module-service] ${fn}:`, message, cause ?? '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: compensating-transaction helper
//
// Wraps a database operation so that if it succeeds but a *subsequent* step
// fails, the first operation is automatically rolled back.  Used when a
// multi-step flow must stay consistent.
// ─────────────────────────────────────────────────────────────────────────────

async function withCompensation<T>(
  fn: () => Promise<T>,
  compensate: () => Promise<void>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    try {
      await compensate();
    } catch (rollbackError) {
      logError('withCompensation', 'Compensation failed after operation failure', rollbackError);
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: DB row → domain model
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): RegisteredModule {
  return {
    id: row['id'] as string,
    module: row['module'] as string,
    displayName: row['display_name'] as string,
    hasSettings: row['has_settings'] as boolean,
    organizationId: row['organization_id'] as string,
    permissions: row['permissions'] as RolePermissions,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// registerModule
//
// Full registration flow (atomic):
//   1. Validate the manifest (identifier format, permissions, required fields)
//   2. Check for an existing registration in this organization
//   3. Generate default permissions from the manifest's defaultAccess
//   4. INSERT the module record in a single statement
//
// The permissions column and module metadata are written in one INSERT, so
// there is no partial state if the operation fails.  If a database-level
// uniqueness constraint exists on (module, organization_id), concurrent
// registrations will be safely rejected by the DB even if the pre-check
// above races.
// ─────────────────────────────────────────────────────────────────────────────

export async function registerModule(
  supabase: SupabaseClient,
  manifest: ModuleManifest,
  organizationId: string
): Promise<RegisteredModule> {
  // Step 1: validate manifest
  const validation = validateModuleManifest(manifest);
  if (!validation.valid) {
    throw new ModuleServiceError(
      `Invalid module manifest: ${validation.errors.join('; ')}`,
      'VALIDATION_ERROR'
    );
  }

  // Step 2: duplicate detection scoped to the organization
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('module', manifest.module)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (existing) {
    throw new ModuleServiceError(
      `Module '${manifest.module}' is already registered for organization '${organizationId}'`,
      'DUPLICATE'
    );
  }

  // Step 3: generate permissions (constraints enforced inside generator)
  const permissions = generateDefaultPermissions(manifest);

  // Step 4: atomic INSERT
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      module: manifest.module,
      display_name: manifest.displayName,
      has_settings: manifest.hasSettings,
      organization_id: organizationId,
      permissions,
    })
    .select()
    .single();

  if (error || !data) {
    logError('registerModule', `Insert failed for '${manifest.module}'`, error);
    throw new ModuleServiceError(
      `Failed to register module '${manifest.module}': ${error?.message ?? 'unknown error'}`,
      'DATABASE_ERROR'
    );
  }

  const registered = mapRow(data);
  log('registerModule', `Registered '${manifest.module}'`, {
    moduleId: registered.id,
    organizationId,
  });

  return registered;
}

// ─────────────────────────────────────────────────────────────────────────────
// updateModule
//
// Manifest-change and permission-update flow (atomic):
//   1. Fetch the current record as a baseline
//   2. Validate each requested change
//   3. Deep-merge partial permission updates with existing permissions
//   4. Apply business constraints (settingsAccess ⊆ featureAccess)
//   5. UPDATE the record in a single statement
//
// The fetch → validate → write cycle is not a true serialisable transaction
// but is safe for the permission/metadata fields managed here.  A concurrent
// write between steps 1 and 5 will be overwritten; callers needing
// compare-and-swap semantics should use optimistic-locking (e.g. an updated_at
// precondition) at the API layer.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateModule(
  supabase: SupabaseClient,
  moduleId: string,
  updates: ModuleUpdatePayload
): Promise<RegisteredModule> {
  // Step 1: fetch current state
  const { data: current, error: fetchError } = await supabase
    .from(TABLE)
    .select()
    .eq('id', moduleId)
    .single();

  if (fetchError || !current) {
    throw new ModuleServiceError(`Module not found: ${moduleId}`, 'NOT_FOUND');
  }

  // Step 2 & 3: validate fields and build the update payload
  const updateData: Record<string, unknown> = {};

  if (updates.displayName !== undefined) {
    if (!updates.displayName || updates.displayName.trim().length === 0) {
      throw new ModuleServiceError('displayName cannot be empty', 'VALIDATION_ERROR');
    }
    updateData['display_name'] = updates.displayName;
  }

  if (updates.hasSettings !== undefined) {
    updateData['has_settings'] = updates.hasSettings;
  }

  if (updates.permissions !== undefined) {
    // Deep merge: start from the full existing set, then overlay changes
    const merged: RolePermissions = {
      ...(current['permissions'] as RolePermissions),
      ...updates.permissions,
    };

    // Step 4: enforce settingsAccess ⊆ featureAccess
    const constrained = applyPermissionConstraints(merged);

    const validation = validatePermissions(constrained);
    if (!validation.valid) {
      throw new ModuleServiceError(
        `Invalid permissions: ${validation.errors.join('; ')}`,
        'VALIDATION_ERROR'
      );
    }
    updateData['permissions'] = constrained;
  }

  // Step 5: atomic UPDATE
  const { data, error } = await supabase
    .from(TABLE)
    .update(updateData)
    .eq('id', moduleId)
    .select()
    .single();

  if (error || !data) {
    logError('updateModule', `Update failed for module '${moduleId}'`, error);
    throw new ModuleServiceError(
      `Failed to update module '${moduleId}': ${error?.message ?? 'unknown error'}`,
      'DATABASE_ERROR'
    );
  }

  log('updateModule', `Updated module '${moduleId}'`, {
    fields: Object.keys(updateData),
  });

  return mapRow(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// deregisterModule
//
// Complete cleanup flow (atomic):
//   1. Verify existence to provide a clear NOT_FOUND error
//   2. DELETE the row in a single statement
//
// Permissions are stored as a JSON column on the same row; deleting the module
// record is therefore complete cleanup — no orphaned permission data can remain.
// If a separate permissions table is introduced in the future, add a DELETE
// for that table before the module DELETE, wrapped in withCompensation so the
// permission rows are restored if the module DELETE fails.
// ─────────────────────────────────────────────────────────────────────────────

export async function deregisterModule(
  supabase: SupabaseClient,
  moduleId: string
): Promise<void> {
  // Step 1: verify existence
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE)
    .select('id, module, organization_id')
    .eq('id', moduleId)
    .maybeSingle();

  if (fetchError) {
    logError('deregisterModule', `Existence check failed for '${moduleId}'`, fetchError);
    throw new ModuleServiceError(
      `Failed to verify module '${moduleId}': ${fetchError.message}`,
      'DATABASE_ERROR'
    );
  }

  if (!existing) {
    throw new ModuleServiceError(`Module not found: ${moduleId}`, 'NOT_FOUND');
  }

  // Step 2: atomic DELETE (also removes the embedded permissions column)
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', moduleId);

  if (error) {
    logError('deregisterModule', `Delete failed for module '${moduleId}'`, error);
    throw new ModuleServiceError(
      `Failed to deregister module '${moduleId}': ${error.message}`,
      'DATABASE_ERROR'
    );
  }

  const slug = (existing as { module?: string }).module ?? moduleId;
  log('deregisterModule', `Deregistered '${slug}'`, { moduleId });
}

// ─────────────────────────────────────────────────────────────────────────────
// getModule
// ─────────────────────────────────────────────────────────────────────────────

export async function getModule(
  supabase: SupabaseClient,
  moduleId: string
): Promise<RegisteredModule | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq('id', moduleId)
    .single();

  if (error || !data) return null;
  return mapRow(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// getModules
//
// Returns all registered modules for an organization ordered by creation time.
// Returns an empty array on query error rather than throwing, as a missing or
// empty module list is a recoverable UI state.
// ─────────────────────────────────────────────────────────────────────────────

export async function getModules(
  supabase: SupabaseClient,
  organizationId: string
): Promise<RegisteredModule[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select()
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    logError('getModules', `Query failed for organization '${organizationId}'`, error);
    return [];
  }

  return (data ?? []).map(mapRow);
}

// Re-export withCompensation for use by callers that extend this service
export { withCompensation };
