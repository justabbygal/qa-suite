import type { Role, RegisteredModule } from '@/lib/modules/types';
import { ROLES } from '@/lib/modules/types';
import type { PermissionField } from './permission-warnings';
import { isDestructiveChange } from './permission-warnings';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * How severe a permission change is.
 * - `safe`        — no access is being removed; no confirmation needed.
 * - `destructive` — access is being removed from one or more roles.
 * - `critical`    — access is being removed from an Owner (highest-privilege role).
 */
export type PermissionChangeSeverity = 'safe' | 'destructive' | 'critical';

export interface PermissionValidationResult {
  severity: PermissionChangeSeverity;
  /** When true the UI must show a confirmation dialog before applying the change. */
  requiresConfirmation: boolean;
  /** Human-readable reason — useful for aria-descriptions and test assertions. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Input contexts
// ---------------------------------------------------------------------------

export interface PermissionChangeValidationContext {
  module: RegisteredModule;
  role: Role;
  field: PermissionField;
  currentValue: boolean;
  newValue: boolean;
}

export interface BulkPermissionChangeValidationContext {
  module: RegisteredModule;
  /** The new desired state: `true` = enable all, `false` = disable all. */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Critical-role logic
// ---------------------------------------------------------------------------

/**
 * Roles whose feature access removal is treated as a critical (highest-severity)
 * change. Currently only Owner, as they are the super-admin of the organisation.
 */
const CRITICAL_ROLES: readonly Role[] = ['Owner'];

/**
 * Returns true when removing feature access for a role that is considered
 * critical (Owner). Settings-only changes on critical roles are destructive
 * but not critical.
 */
export function isCriticalPermissionChange(
  role: Role,
  field: PermissionField,
  currentValue: boolean,
  newValue: boolean
): boolean {
  if (!isDestructiveChange(currentValue, newValue)) return false;
  return CRITICAL_ROLES.includes(role) && field === 'featureAccess';
}

// ---------------------------------------------------------------------------
// Single-toggle validation
// ---------------------------------------------------------------------------

/**
 * Validates a single permission toggle change and returns the severity level
 * and whether a confirmation dialog is required before applying it.
 *
 * @example
 * ```ts
 * const result = validatePermissionChange({
 *   module, role: 'Admin', field: 'featureAccess',
 *   currentValue: true, newValue: false,
 * });
 * // result.severity === 'destructive', result.requiresConfirmation === true
 * ```
 */
export function validatePermissionChange(
  ctx: PermissionChangeValidationContext
): PermissionValidationResult {
  const { role, field, currentValue, newValue, module } = ctx;

  if (!isDestructiveChange(currentValue, newValue)) {
    return { severity: 'safe', requiresConfirmation: false };
  }

  if (isCriticalPermissionChange(role, field, currentValue, newValue)) {
    return {
      severity: 'critical',
      requiresConfirmation: true,
      reason: `Removing ${field === 'featureAccess' ? 'feature' : 'settings'} access from ${role} in ${module.displayName} is a critical change`,
    };
  }

  return {
    severity: 'destructive',
    requiresConfirmation: true,
    reason: `Removing ${field === 'featureAccess' ? 'feature' : 'settings'} access from ${role} in ${module.displayName}`,
  };
}

// ---------------------------------------------------------------------------
// Bulk-disable validation
// ---------------------------------------------------------------------------

/**
 * Returns the list of roles that currently have feature access enabled for
 * the given module. Used to determine the scope of a bulk-disable operation.
 */
export function getAffectedRoles(module: RegisteredModule): Role[] {
  return ROLES.filter((r) => module.permissions[r]?.featureAccess);
}

/**
 * Validates a bulk enable/disable operation that affects all roles at once.
 *
 * Enabling is never destructive. Disabling is at minimum destructive if any
 * role currently has feature access, and critical if the Owner role does.
 *
 * @example
 * ```ts
 * const result = validateBulkPermissionChange({ module, enabled: false });
 * // result.severity === 'critical' if Owner has feature access
 * ```
 */
export function validateBulkPermissionChange(
  ctx: BulkPermissionChangeValidationContext
): PermissionValidationResult {
  const { module, enabled } = ctx;

  if (enabled) {
    return { severity: 'safe', requiresConfirmation: false };
  }

  const affected = getAffectedRoles(module);
  if (affected.length === 0) {
    return { severity: 'safe', requiresConfirmation: false };
  }

  const affectsOwner = affected.includes('Owner');
  if (affectsOwner) {
    return {
      severity: 'critical',
      requiresConfirmation: true,
      reason: `Disabling ${module.displayName} will remove access from the Owner role`,
    };
  }

  return {
    severity: 'destructive',
    requiresConfirmation: true,
    reason: `Disabling ${module.displayName} will remove access for ${affected.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Convenience helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a validation result means a confirmation dialog must be
 * shown before the change is applied.
 */
export function shouldRequireConfirmation(
  result: PermissionValidationResult
): boolean {
  return result.requiresConfirmation;
}
