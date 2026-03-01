'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type RegisteredModule, type Role, ROLES } from '@/lib/modules/types';
import { useUserRole, canAccessPermissions, type UserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorMessage } from '@/components/ui/error-message';
import { PermissionToggle } from './PermissionToggle';
import { PermissionProvider, usePermissionContext } from './PermissionProvider';
import { RoleSelector } from './RoleSelector';
import { getPermissionChangeWarning } from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEditableRoles(userRole: UserRole): Role[] {
  if (userRole === 'owner') return ['Owner', 'Admin', 'User'];
  if (userRole === 'admin') return ['User'];
  return [];
}

function getDefaultSelectedRole(editableRoles: Role[]): Role {
  return editableRoles[0] ?? 'User';
}

// Role badge classes — consistent with ModuleSection ROLE_META coloring
const ROLE_BADGE_CLASS: Record<Role, string> = {
  Owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  User: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const USER_ROLE_BADGE_CLASS: Record<UserRole, string> = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  user: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

// ---------------------------------------------------------------------------
// Loading skeleton — matches the grid card layout
// ---------------------------------------------------------------------------

function PermissionManagerSkeleton() {
  return (
    <div
      aria-label="Loading permissions"
      aria-busy="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-1 h-5 w-14 animate-pulse rounded-md bg-muted" />
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            <div className="flex min-h-[44px] items-center justify-between">
              <div className="space-y-1">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function PermissionManagerEmpty() {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center sm:p-10">
      <p className="text-sm font-medium text-foreground">No modules registered</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Modules will appear here once they are registered with the system.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module role card — compact card for a single module + single role
// ---------------------------------------------------------------------------

interface ModuleRoleCardProps {
  module: RegisteredModule;
  role: Role;
  isEditable: boolean;
  pending: boolean;
  onPermissionChange: (
    moduleId: string,
    role: Role,
    field: 'featureAccess' | 'settingsAccess',
    value: boolean
  ) => void;
}

function ModuleRoleCard({
  module,
  role,
  isEditable,
  pending,
  onPermissionChange,
}: ModuleRoleCardProps) {
  const perms = module.permissions[role] ?? {
    featureAccess: false,
    settingsAccess: false,
  };

  return (
    <Card
      className={cn(
        'overflow-hidden transition-opacity',
        pending && 'opacity-70'
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold leading-tight">
          {module.displayName}
        </CardTitle>
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium',
            ROLE_BADGE_CLASS[role]
          )}
        >
          {role}
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <PermissionToggle
          featureEnabled={perms.featureAccess}
          settingsEnabled={perms.settingsAccess}
          hasSettings={module.hasSettings}
          disabled={!isEditable}
          pending={pending}
          onFeatureChange={(value) =>
            onPermissionChange(module.id, role, 'featureAccess', value)
          }
          onSettingsChange={(value) =>
            onPermissionChange(module.id, role, 'settingsAccess', value)
          }
          featureWarningInfo={getPermissionChangeWarning({
            role,
            field: 'featureAccess',
            currentValue: perms.featureAccess,
            newValue: !perms.featureAccess,
            moduleDisplayName: module.displayName,
          })}
          settingsWarningInfo={getPermissionChangeWarning({
            role,
            field: 'settingsAccess',
            currentValue: perms.settingsAccess,
            newValue: !perms.settingsAccess,
            moduleDisplayName: module.displayName,
          })}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Grid content — reads from PermissionProvider context
// ---------------------------------------------------------------------------

interface PermissionManagerContentProps {
  selectedRole: Role;
  editableRoles: Role[];
}

function PermissionManagerContent({
  selectedRole,
  editableRoles,
}: PermissionManagerContentProps) {
  const { modules, isLoading, loadError, pendingModuleIds, updatePermission, refresh } =
    usePermissionContext();

  const isEditable = editableRoles.includes(selectedRole);

  if (isLoading) {
    return <PermissionManagerSkeleton />;
  }

  if (loadError) {
    return (
      <ErrorMessage
        title="Failed to load permissions"
        message={loadError}
        retryable
        onRetry={refresh}
      />
    );
  }

  if (modules.length === 0) {
    return <PermissionManagerEmpty />;
  }

  return (
    <div
      id={`role-panel-${selectedRole.toLowerCase()}`}
      role="tabpanel"
      aria-labelledby={`role-tab-${selectedRole.toLowerCase()}`}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {modules.map((mod) => (
        <ModuleRoleCard
          key={mod.id}
          module={mod}
          role={selectedRole}
          isEditable={isEditable}
          pending={pendingModuleIds.has(mod.id)}
          onPermissionChange={updatePermission}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface PermissionManagerProps {
  organizationId: string;
}

/**
 * Main permission management interface with role tabs and module grid layout.
 *
 * Features:
 * - Role tabs to switch between Owner/Admin/User views
 * - Compact grid of module cards showing the selected role's permissions
 * - Admin users can only edit User permissions (Owner/Admin tabs are read-only)
 * - Loading skeletons, error states, and empty state handling
 * - Current user's role is clearly indicated with a "You" badge and role chip
 */
export function PermissionManager({ organizationId }: PermissionManagerProps) {
  const userRole = useUserRole();
  const editableRoles = getEditableRoles(userRole);
  const [selectedRole, setSelectedRole] = useState<Role>(() =>
    getDefaultSelectedRole(editableRoles)
  );

  // Access gate — users without permission see a clear denial message
  if (!canAccessPermissions(userRole)) {
    return (
      <div className="w-full max-w-5xl">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-8 text-center sm:p-12">
          <Shield className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              Permission management is available to Owners and Admins only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Permissions</h2>
          <p className="text-sm text-muted-foreground">
            Control what each role can access and configure across modules.
            {userRole === 'admin' && (
              <span className="ml-1">
                As an Admin, you can only modify User permissions.
              </span>
            )}
          </p>
        </div>

        {/* Current user role chip */}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
            USER_ROLE_BADGE_CLASS[userRole]
          )}
        >
          Your role:{' '}
          <span className="font-semibold capitalize">{userRole}</span>
        </span>
      </div>

      {/* Role selector tabs */}
      <RoleSelector
        roles={ROLES}
        selectedRole={selectedRole}
        editableRoles={editableRoles}
        currentUserRole={userRole}
        onRoleChange={setSelectedRole}
      />

      {/* Module permission grid */}
      <PermissionProvider organizationId={organizationId}>
        <PermissionManagerContent
          selectedRole={selectedRole}
          editableRoles={editableRoles}
        />
      </PermissionProvider>
    </div>
  );
}
