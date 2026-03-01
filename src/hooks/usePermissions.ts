"use client";

import { useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/permissions/types";
import type { Role as ModuleRole, RolePermissions } from "@/lib/modules/types";
import {
  trackRoleChange,
  trackFeaturePermissionChange,
  trackModulePermissionUpdate,
  updateAndTrackRole,
  updateAndTrackModulePermissions,
  type UpdateAndTrackRoleParams,
  type UpdateAndTrackModulePermissionsParams,
} from "@/lib/permissions/permission-service";
import type { PermissionAuditContext } from "@/lib/permissions/audit-tracker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePermissionsOptions {
  /** Organization the actor belongs to. */
  organizationId: string;
  /** Actor performing the permission changes. */
  actor: {
    id: string;
    email: string;
    name: string;
  };
}

export interface UsePermissionsReturn {
  /** True while any permission operation is in progress. */
  isTracking: boolean;
  /** Last error from a track/update operation, or null. */
  trackingError: string | null;
  /**
   * Records a user role change audit entry without persisting the role
   * itself (use when the persist step is handled elsewhere).
   */
  recordRoleChange: (params: {
    targetUserId: string;
    targetUserEmail: string;
    targetUserName: string;
    previousRole: Role;
    newRole: Role;
  }) => Promise<boolean>;
  /**
   * Records a single feature or settings permission toggle for a module role.
   */
  recordFeaturePermissionChange: (params: {
    moduleId: string;
    moduleDisplayName: string;
    role: ModuleRole;
    field: "featureAccess" | "settingsAccess";
    previousValue: boolean;
    newValue: boolean;
  }) => Promise<boolean>;
  /**
   * Diffs two full `RolePermissions` objects and records per-role audit
   * entries for every changed role.
   */
  recordModulePermissionUpdate: (params: {
    moduleId: string;
    moduleDisplayName: string;
    previousPermissions: RolePermissions;
    newPermissions: RolePermissions;
  }) => Promise<boolean>;
  /**
   * Persists a role change (via `persist` callback) and then records the
   * audit entry. The audit entry is only written if `persist` succeeds.
   */
  updateRole: (
    params: Omit<UpdateAndTrackRoleParams, "context">
  ) => Promise<boolean>;
  /**
   * Persists module permission changes (via `persist` callback) and then
   * records granular per-role audit entries. No audit entries are written
   * when nothing actually changed.
   */
  updateModulePermissions: (
    params: Omit<UpdateAndTrackModulePermissionsParams, "context">
  ) => Promise<boolean>;
  /** Clears the last tracking error. */
  clearTrackingError: () => void;
}

// ---------------------------------------------------------------------------
// Supabase client (browser-side)
// ---------------------------------------------------------------------------

function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that wraps the permission change tracking service with React state
 * for loading and error management.
 *
 * All functions return `true` on success and `false` on failure. On failure,
 * the `trackingError` state is populated with a human-readable message.
 *
 * @example
 * ```tsx
 * const { recordFeaturePermissionChange, isTracking } = usePermissions({
 *   organizationId: org.id,
 *   actor: { id: user.id, email: user.email, name: user.name },
 * });
 *
 * await recordFeaturePermissionChange({
 *   moduleId: "analytics",
 *   moduleDisplayName: "Analytics",
 *   role: "Admin",
 *   field: "featureAccess",
 *   previousValue: true,
 *   newValue: false,
 * });
 * ```
 */
export function usePermissions({
  organizationId,
  actor,
}: UsePermissionsOptions): UsePermissionsReturn {
  const [isTracking, setIsTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const buildContext = useCallback((): PermissionAuditContext => ({
    organizationId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name,
  }), [organizationId, actor.id, actor.email, actor.name]);

  const run = useCallback(
    async (op: () => Promise<{ success: boolean; error?: string }>): Promise<boolean> => {
      setIsTracking(true);
      setTrackingError(null);

      const result = await op();

      setIsTracking(false);

      if (!result.success) {
        setTrackingError(result.error ?? "An unknown error occurred");
        return false;
      }

      return true;
    },
    []
  );

  const recordRoleChange = useCallback(
    (params: {
      targetUserId: string;
      targetUserEmail: string;
      targetUserName: string;
      previousRole: Role;
      newRole: Role;
    }) =>
      run(() =>
        trackRoleChange(createBrowserClient(), {
          context: buildContext(),
          ...params,
        })
      ),
    [run, buildContext]
  );

  const recordFeaturePermissionChange = useCallback(
    (params: {
      moduleId: string;
      moduleDisplayName: string;
      role: ModuleRole;
      field: "featureAccess" | "settingsAccess";
      previousValue: boolean;
      newValue: boolean;
    }) =>
      run(() =>
        trackFeaturePermissionChange(createBrowserClient(), {
          context: buildContext(),
          ...params,
        })
      ),
    [run, buildContext]
  );

  const recordModulePermissionUpdate = useCallback(
    (params: {
      moduleId: string;
      moduleDisplayName: string;
      previousPermissions: RolePermissions;
      newPermissions: RolePermissions;
    }) =>
      run(() =>
        trackModulePermissionUpdate(createBrowserClient(), {
          context: buildContext(),
          ...params,
        })
      ),
    [run, buildContext]
  );

  const updateRole = useCallback(
    (params: Omit<UpdateAndTrackRoleParams, "context">) =>
      run(() =>
        updateAndTrackRole(createBrowserClient(), {
          context: buildContext(),
          ...params,
        })
      ),
    [run, buildContext]
  );

  const updateModulePermissions = useCallback(
    (params: Omit<UpdateAndTrackModulePermissionsParams, "context">) =>
      run(() =>
        updateAndTrackModulePermissions(createBrowserClient(), {
          context: buildContext(),
          ...params,
        })
      ),
    [run, buildContext]
  );

  const clearTrackingError = useCallback(() => setTrackingError(null), []);

  return {
    isTracking,
    trackingError,
    recordRoleChange,
    recordFeaturePermissionChange,
    recordModulePermissionUpdate,
    updateRole,
    updateModulePermissions,
    clearTrackingError,
  };
}
