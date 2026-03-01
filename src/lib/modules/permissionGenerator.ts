import { ModuleManifest, PermissionAccess, Role, RolePermissions, ROLES } from './types';

export function generateDefaultPermissions(manifest: ModuleManifest): RolePermissions {
  return ROLES.reduce((acc, role) => {
    const defaultAccess: PermissionAccess = manifest.defaultAccess[role] ?? {
      featureAccess: false,
      settingsAccess: false,
    };
    acc[role] = {
      featureAccess: defaultAccess.featureAccess,
      settingsAccess: defaultAccess.featureAccess ? defaultAccess.settingsAccess : false,
    };
    return acc;
  }, {} as RolePermissions);
}

export function validatePermissions(permissions: RolePermissions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const role of ROLES) {
    if (!permissions[role]) {
      errors.push(`Missing permissions for role: ${role}`);
      continue;
    }
    const { featureAccess, settingsAccess } = permissions[role];
    if (typeof featureAccess !== 'boolean') {
      errors.push(`featureAccess must be a boolean for role: ${role}`);
    }
    if (typeof settingsAccess !== 'boolean') {
      errors.push(`settingsAccess must be a boolean for role: ${role}`);
    }
    if (settingsAccess && !featureAccess) {
      errors.push(`settingsAccess cannot be true when featureAccess is false for role: ${role}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateModuleManifest(manifest: ModuleManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest.module || typeof manifest.module !== 'string') {
    errors.push('module identifier is required');
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.module)) {
    errors.push('module identifier must be kebab-case (lowercase letters, numbers, hyphens; no leading/trailing hyphens)');
  }
  if (!manifest.displayName || typeof manifest.displayName !== 'string') {
    errors.push('displayName is required');
  } else if (manifest.displayName.trim().length === 0) {
    errors.push('displayName cannot be empty');
  }
  if (typeof manifest.hasSettings !== 'boolean') {
    errors.push('hasSettings must be a boolean');
  }
  if (!manifest.defaultAccess || typeof manifest.defaultAccess !== 'object') {
    errors.push('defaultAccess is required');
  } else {
    const permResult = validatePermissions(manifest.defaultAccess as RolePermissions);
    errors.push(...permResult.errors);
  }
  return { valid: errors.length === 0, errors };
}

export function applyPermissionConstraints(permissions: RolePermissions): RolePermissions {
  return ROLES.reduce((acc, role) => {
    const perm = permissions[role] ?? { featureAccess: false, settingsAccess: false };
    acc[role] = {
      featureAccess: perm.featureAccess,
      settingsAccess: perm.featureAccess ? perm.settingsAccess : false,
    };
    return acc;
  }, {} as RolePermissions);
}

export function hierarchicalDefaultAccess(): RolePermissions {
  return {
    Owner: { featureAccess: true, settingsAccess: true },
    Admin: { featureAccess: true, settingsAccess: false },
    User: { featureAccess: false, settingsAccess: false },
  };
}
