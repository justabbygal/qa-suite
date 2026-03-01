'use client';

import { type Role } from '@/lib/modules/types';
import { usePermissionContext } from './PermissionProvider';
import { ModuleSection } from './ModuleSection';
import { ErrorMessage } from '@/components/ui/error-message';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Loading skeleton — mirrors ModuleSection card structure
// ---------------------------------------------------------------------------

function ModulePermissionsLoading() {
  return (
    <div aria-label="Loading permissions" aria-busy="true" className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-1 h-4 w-56 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="p-0">
            {[1, 2, 3].map((j, idx) => (
              <div
                key={j}
                className={`flex items-start gap-4 px-6 py-4${idx < 2 ? ' border-b border-border/60' : ''}`}
              >
                {/* Role badge placeholder */}
                <div className="w-20 shrink-0 space-y-1 pt-0.5">
                  <div className="h-5 w-12 animate-pulse rounded-md bg-muted" />
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                </div>
                {/* Toggle rows placeholder */}
                <div className="flex-1 space-y-1">
                  <div className="flex min-h-[44px] items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function ModulePermissionsEmpty() {
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
// Public component
// ---------------------------------------------------------------------------

export interface ModulePermissionsProps {
  /**
   * Roles whose permission toggles are interactive. Roles outside this list
   * are rendered read-only (visible but not editable). Pass an empty array to
   * make the entire view read-only.
   */
  editableRoles: Role[];
}

/**
 * Renders the full list of registered modules, each showing per-role
 * permission controls. Must be rendered inside a `<PermissionProvider>`.
 *
 * Handles loading, error, and empty states internally, sourcing all data
 * from the nearest `PermissionProvider` context.
 */
export function ModulePermissions({ editableRoles }: ModulePermissionsProps) {
  const { modules, isLoading, loadError, pendingModuleIds, updatePermission, refresh } =
    usePermissionContext();

  if (isLoading) {
    return <ModulePermissionsLoading />;
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
    return <ModulePermissionsEmpty />;
  }

  return (
    <div className="space-y-4">
      {modules.map((mod) => (
        <ModuleSection
          key={mod.id}
          module={mod}
          editableRoles={editableRoles}
          pending={pendingModuleIds.has(mod.id)}
          onPermissionChange={updatePermission}
        />
      ))}
    </div>
  );
}
