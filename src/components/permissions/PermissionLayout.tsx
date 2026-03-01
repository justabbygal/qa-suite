"use client";

import { useState } from "react";
import { Shield } from "lucide-react";

import type { Role } from "@/lib/modules/types";
import { useUserRole, canAccessPermissions } from "@/hooks/useUserRole";
import { PermissionProvider, usePermissionContext } from "./PermissionProvider";
import { RoleTabs } from "./RoleTabs";
import { PermissionToggle } from "./PermissionToggle";
import { ErrorMessage } from "@/components/ui/error-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Roles a given user is allowed to edit. */
function getEditableRoles(userRole: "owner" | "admin" | "user"): Role[] {
  if (userRole === "owner") return ["Owner", "Admin", "User"];
  if (userRole === "admin") return ["User"];
  return [];
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PermissionsLoadingSkeleton() {
  return (
    <div aria-label="Loading permissions" aria-busy="true" className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-4 w-36 animate-pulse rounded bg-muted" />
              <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner content — must be rendered inside PermissionProvider
// ---------------------------------------------------------------------------

interface PermissionsContentProps {
  selectedRole: Role;
}

function PermissionsContent({ selectedRole }: PermissionsContentProps) {
  const { modules, isLoading, loadError, pendingModuleIds, updatePermission, refresh } =
    usePermissionContext();

  if (isLoading) {
    return <PermissionsLoadingSkeleton />;
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
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No modules are registered yet. Modules will appear here once they are
          added to the system.
        </p>
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id={`role-panel-${selectedRole.toLowerCase()}`}
      aria-labelledby={`role-tab-${selectedRole.toLowerCase()}`}
      className="space-y-4"
    >
      {modules.map((mod) => {
        const perms = mod.permissions[selectedRole] ?? {
          featureAccess: false,
          settingsAccess: false,
        };
        const isPending = pendingModuleIds.has(mod.id);

        return (
          <Card
            key={mod.id}
            aria-label={`${mod.displayName} permissions for ${selectedRole}`}
            className={isPending ? "opacity-70" : undefined}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{mod.displayName}</CardTitle>
              <p className="font-mono text-xs text-muted-foreground">{mod.module}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Feature Access */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Feature Access</p>
                  <p className="text-xs text-muted-foreground">
                    Allow {selectedRole} role to use this module
                  </p>
                </div>
                <PermissionToggle
                  label={`${selectedRole} feature access for ${mod.displayName}`}
                  enabled={perms.featureAccess}
                  disabled={isPending}
                  onChange={(value) =>
                    updatePermission(mod.id, selectedRole, "featureAccess", value)
                  }
                  warningInfo={null}
                />
              </div>

              {/* Settings Access — only relevant when module has settings */}
              {mod.hasSettings && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Settings Access</p>
                    <p className="text-xs text-muted-foreground">
                      Allow {selectedRole} role to configure this module
                    </p>
                  </div>
                  <PermissionToggle
                    label={`${selectedRole} settings access for ${mod.displayName}`}
                    enabled={perms.settingsAccess}
                    disabled={isPending || !perms.featureAccess}
                    onChange={(value) =>
                      updatePermission(mod.id, selectedRole, "settingsAccess", value)
                    }
                    warningInfo={null}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface PermissionLayoutProps {
  organizationId: string;
}

export function PermissionLayout({ organizationId }: PermissionLayoutProps) {
  const userRole = useUserRole();
  const editableRoles = getEditableRoles(userRole);
  const [selectedRole, setSelectedRole] = useState<Role>(
    editableRoles[0] ?? "User"
  );

  // Access gate — users without permission see a clear denial message
  if (!canAccessPermissions(userRole)) {
    return (
      <div className="max-w-4xl">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-12 text-center">
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
    <div className="max-w-4xl space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-semibold">Permissions</h2>
        <p className="text-sm text-muted-foreground">
          Control what each role can access and configure across modules.
          {userRole === "admin" && (
            <span className="ml-1">
              As an Admin, you can only modify User permissions.
            </span>
          )}
        </p>
      </div>

      {/* Role tabs + module sections */}
      <PermissionProvider organizationId={organizationId}>
        <div className="space-y-4">
          <RoleTabs
            roles={editableRoles}
            selectedRole={selectedRole}
            onRoleChange={setSelectedRole}
          />
          <PermissionsContent selectedRole={selectedRole} />
        </div>
      </PermissionProvider>
    </div>
  );
}
