import type { Role } from '@/lib/modules/types';

export type PermissionField = 'featureAccess' | 'settingsAccess';

export interface PermissionChangeContext {
  role: Role;
  field: PermissionField;
  currentValue: boolean;
  newValue: boolean;
  moduleDisplayName: string;
}

export interface BulkDisableContext {
  moduleDisplayName: string;
  affectedRoles: Role[];
}

export interface WarningInfo {
  title: string;
  description: string;
  impacts: string[];
}

/**
 * Returns true when a permission is being disabled (destructive direction only).
 * Enabling permissions is never considered destructive.
 */
export function isDestructiveChange(currentValue: boolean, newValue: boolean): boolean {
  return currentValue === true && newValue === false;
}

/**
 * Generates a specific warning for a single permission toggle change.
 * Returns null for non-destructive changes (enabling permissions).
 */
export function getPermissionChangeWarning(
  ctx: PermissionChangeContext
): WarningInfo | null {
  if (!isDestructiveChange(ctx.currentValue, ctx.newValue)) {
    return null;
  }

  const { role, field, moduleDisplayName } = ctx;

  if (field === 'featureAccess') {
    return {
      title: `Remove ${moduleDisplayName} access for ${role}s?`,
      description: `${role}s will no longer be able to access the ${moduleDisplayName} module.`,
      impacts: [
        `All ${role} users will immediately lose access to ${moduleDisplayName}`,
        `${role}s currently using ${moduleDisplayName} will be blocked`,
        `Settings access for ${role}s will also be revoked automatically`,
      ],
    };
  }

  // settingsAccess
  return {
    title: `Remove ${moduleDisplayName} settings access for ${role}s?`,
    description: `${role}s will no longer be able to configure ${moduleDisplayName}.`,
    impacts: [
      `All ${role} users will lose the ability to change ${moduleDisplayName} settings`,
      `${role}s can still use ${moduleDisplayName} but cannot configure it`,
    ],
  };
}

/**
 * Generates a warning for a bulk disable operation affecting multiple roles.
 * Returns null if no roles are affected.
 */
export function getBulkDisableWarning(ctx: BulkDisableContext): WarningInfo | null {
  if (ctx.affectedRoles.length === 0) {
    return null;
  }

  const { moduleDisplayName, affectedRoles } = ctx;
  const roleList = affectedRoles.join(', ');
  const plural = affectedRoles.length > 1 ? 'roles' : 'role';

  return {
    title: `Disable all permissions for ${moduleDisplayName}?`,
    description: `This will remove all access for the ${roleList} ${plural}.`,
    impacts: affectedRoles.map(
      (role) => `All ${role} users will lose access to ${moduleDisplayName}`
    ),
  };
}
