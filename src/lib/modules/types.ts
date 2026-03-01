export type Role = 'Owner' | 'Admin' | 'User';

export const ROLES: Role[] = ['Owner', 'Admin', 'User'];

export interface PermissionAccess {
  featureAccess: boolean;
  settingsAccess: boolean;
}

export type RolePermissions = Record<Role, PermissionAccess>;

export interface ModuleManifest {
  module: string;
  displayName: string;
  hasSettings: boolean;
  defaultAccess: RolePermissions;
}

export interface RegisteredModule {
  id: string;
  module: string;
  displayName: string;
  hasSettings: boolean;
  organizationId: string;
  permissions: RolePermissions;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleUpdatePayload {
  displayName?: string;
  hasSettings?: boolean;
  permissions?: Partial<RolePermissions>;
}
