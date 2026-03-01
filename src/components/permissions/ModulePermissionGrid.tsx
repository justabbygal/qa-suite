'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissionContext } from './PermissionProvider';
import { PermissionToggle } from './PermissionToggle';
import { ErrorMessage } from '@/components/ui/error-message';
import { ROLES } from '@/lib/modules/types';
import type { RegisteredModule, Role } from '@/lib/modules/types';
import type { PermissionField } from '@/lib/utils/permission-state';
import { getPermissionChangeWarning } from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ModuleSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg border bg-card p-4"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-3 w-28 rounded bg-muted" />
        </div>
        <div className="h-4 w-4 rounded bg-muted" />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div
      className="space-y-3"
      aria-label="Loading permissions"
      aria-busy="true"
    >
      <ModuleSkeleton />
      <ModuleSkeleton />
      <ModuleSkeleton />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm font-medium">No modules registered</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Modules will appear here once they have been registered with the system.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission row (one role within a module section)
// ---------------------------------------------------------------------------

interface PermissionRowProps {
  module: RegisteredModule;
  role: Role;
  isPending: boolean;
  onPermissionChange: (
    moduleId: string,
    role: Role,
    field: PermissionField,
    value: boolean
  ) => void;
}

function PermissionRow({
  module,
  role,
  isPending,
  onPermissionChange,
}: PermissionRowProps) {
  const perms = module.permissions[role] ?? {
    featureAccess: false,
    settingsAccess: false,
  };

  const featureWarning = getPermissionChangeWarning({
    role,
    field: 'featureAccess',
    currentValue: perms.featureAccess,
    newValue: !perms.featureAccess,
    moduleDisplayName: module.displayName,
  });

  const settingsWarning = module.hasSettings
    ? getPermissionChangeWarning({
        role,
        field: 'settingsAccess',
        currentValue: perms.settingsAccess,
        newValue: !perms.settingsAccess,
        moduleDisplayName: module.displayName,
      })
    : null;

  return (
    <tr className="border-b last:border-0" aria-label={`${role} role permissions`}>
      <td className="py-3 pr-6">
        <span className="text-sm font-medium">{role}</span>
      </td>
      <td className="py-3 pr-6">
        <PermissionToggle
          label={`${role} feature access for ${module.displayName}`}
          enabled={perms.featureAccess}
          pending={isPending}
          onChange={(v) => onPermissionChange(module.id, role, 'featureAccess', v)}
          warningInfo={featureWarning}
        />
      </td>
      {module.hasSettings && (
        <td className="py-3">
          <PermissionToggle
            label={`${role} settings access for ${module.displayName}`}
            enabled={perms.settingsAccess}
            disabled={!perms.featureAccess}
            pending={isPending}
            onChange={(v) =>
              onPermissionChange(module.id, role, 'settingsAccess', v)
            }
            warningInfo={settingsWarning}
          />
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Permission table (all roles for one module)
// ---------------------------------------------------------------------------

interface ModulePermissionTableProps {
  module: RegisteredModule;
  isPending: boolean;
  onPermissionChange: (
    moduleId: string,
    role: Role,
    field: PermissionField,
    value: boolean
  ) => void;
}

function ModulePermissionTable({
  module,
  isPending,
  onPermissionChange,
}: ModulePermissionTableProps) {
  return (
    <div role="region" aria-label={`${module.displayName} permission settings`}>
      <table className="w-full text-sm">
        <caption className="sr-only">
          {module.displayName} permission settings
        </caption>
        <thead>
          <tr className="border-b text-left">
            <th
              scope="col"
              className="py-2 pr-6 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Role
            </th>
            <th
              scope="col"
              className="py-2 pr-6 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Feature Access
            </th>
            {module.hasSettings && (
              <th
                scope="col"
                className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Settings Access
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => (
            <PermissionRow
              key={role}
              module={module}
              role={role}
              isPending={isPending}
              onPermissionChange={onPermissionChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible module section
// ---------------------------------------------------------------------------

interface ModuleSectionProps {
  module: RegisteredModule;
  isPending: boolean;
  defaultOpen?: boolean;
  onPermissionChange: (
    moduleId: string,
    role: Role,
    field: PermissionField,
    value: boolean
  ) => void;
}

function ModuleSection({
  module,
  isPending,
  defaultOpen = true,
  onPermissionChange,
}: ModuleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = `module-panel-${module.id}`;
  const headerId = `module-header-${module.id}`;

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-4 px-4 py-3 text-left',
          'transition-colors hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          open ? 'rounded-t-lg' : 'rounded-lg'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{module.displayName}</span>
            {isPending && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                aria-label="Saving changes"
              />
            )}
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {module.module}
          </p>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          {!module.hasSettings && (
            <span className="hidden text-xs sm:inline">Feature only</span>
          )}
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </div>
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="border-t px-4 pb-4 pt-3"
        >
          <ModulePermissionTable
            module={module}
            isPending={isPending}
            onPermissionChange={onPermissionChange}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface ModulePermissionGridProps {
  className?: string;
}

/**
 * Dynamically renders collapsible permission management sections for every
 * registered module. Must be rendered inside a `<PermissionProvider>`.
 *
 * Handles loading skeletons, error states with retry, empty states, and
 * per-module pending indicators for optimistic updates.
 */
export function ModulePermissionGrid({ className }: ModulePermissionGridProps) {
  const {
    modules,
    isLoading,
    loadError,
    pendingModuleIds,
    updatePermission,
    refresh,
  } = usePermissionContext();

  if (isLoading) {
    return <LoadingSkeleton />;
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
    return <EmptyState />;
  }

  return (
    <div
      className={cn('space-y-3', className)}
      role="list"
      aria-label="Module permissions"
    >
      {modules.map((module) => (
        <div key={module.id} role="listitem">
          <ModuleSection
            module={module}
            isPending={pendingModuleIds.has(module.id)}
            onPermissionChange={updatePermission}
          />
        </div>
      ))}
    </div>
  );
}
