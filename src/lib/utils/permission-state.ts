import { RegisteredModule, Role, RolePermissions } from '@/lib/modules/types';

export type PermissionField = 'featureAccess' | 'settingsAccess';

export interface PermissionUpdatePayload {
  role: Role;
  field: PermissionField;
  value: boolean;
}

export interface BulkUpdateItem {
  moduleId: string;
  role: Role;
  field: PermissionField;
  value: boolean;
}

export interface BulkUpdateResult {
  succeeded: BulkUpdateItem[];
  failed: BulkUpdateItem[];
}

export function snapshotModules(modules: RegisteredModule[]): RegisteredModule[] {
  return modules.map((m) => ({
    ...m,
    permissions: {
      Owner: { ...m.permissions.Owner },
      Admin: { ...m.permissions.Admin },
      User: { ...m.permissions.User },
    },
  }));
}

export function permissionKey(moduleId: string, role: Role, field: PermissionField): string {
  return `${moduleId}:${role}:${field}`;
}

export function applyOptimisticUpdate(
  modules: RegisteredModule[],
  moduleId: string,
  update: PermissionUpdatePayload
): RegisteredModule[] {
  return modules.map((m) => {
    if (m.id !== moduleId) return m;
    const updatedPerms: RolePermissions = {
      ...m.permissions,
      [update.role]: {
        ...m.permissions[update.role],
        [update.field]: update.value,
        ...(update.field === 'featureAccess' && !update.value ? { settingsAccess: false } : {}),
      },
    };
    return { ...m, permissions: updatedPerms };
  });
}

export function applyBulkOptimisticUpdates(
  modules: RegisteredModule[],
  items: BulkUpdateItem[]
): RegisteredModule[] {
  return items.reduce(
    (acc, item) =>
      applyOptimisticUpdate(acc, item.moduleId, {
        role: item.role,
        field: item.field,
        value: item.value,
      }),
    modules
  );
}

export function revertModule(
  modules: RegisteredModule[],
  snapshot: RegisteredModule[]
): RegisteredModule[] {
  const snapshotMap = new Map(snapshot.map((m) => [m.id, m]));
  return modules.map((m) => snapshotMap.get(m.id) ?? m);
}
