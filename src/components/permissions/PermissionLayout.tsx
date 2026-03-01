"use client";

import { Shield } from "lucide-react";

import type { Role } from "@/lib/modules/types";
import { useUserRole, canAccessPermissions } from "@/hooks/useUserRole";
import { PermissionProvider } from "./PermissionProvider";
import { ModulePermissions } from "./module-permissions";

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
// Public component
// ---------------------------------------------------------------------------

export interface PermissionLayoutProps {
  organizationId: string;
}

export function PermissionLayout({ organizationId }: PermissionLayoutProps) {
  const userRole = useUserRole();
  const editableRoles = getEditableRoles(userRole);

  // Access gate — users without permission see a clear denial message
  if (!canAccessPermissions(userRole)) {
    return (
      <div className="w-full max-w-4xl">
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
    <div className="w-full max-w-4xl space-y-6">
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

      {/* Module permission cards */}
      <PermissionProvider organizationId={organizationId}>
        <ModulePermissions editableRoles={editableRoles} />
      </PermissionProvider>
    </div>
  );
}
