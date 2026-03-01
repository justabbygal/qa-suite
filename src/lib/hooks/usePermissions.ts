"use client";

/**
 * usePermissions hook.
 *
 * Provides permission management state for the permissions UI, including:
 * - Fetching registered modules with their current permission state.
 * - Updating a single permission toggle with optimistic updates and rollback.
 * - Role hierarchy enforcement (Admin cannot edit Owner or Admin permissions).
 * - Loading and error states for graceful degradation.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { RegisteredModule, Role } from "@/lib/modules/types";
import type { Role as LowercaseRole } from "@/lib/permissions/types";
import type { PermissionField } from "@/lib/utils/permission-state";
import {
  snapshotModules,
  applyOptimisticUpdate,
  revertModule,
} from "@/lib/utils/permission-state";
import { canEditPermissions } from "@/lib/services/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePermissionsOptions {
  /** UUID of the organization whose permissions to manage. */
  organizationId: string;
  /**
   * Lowercase role of the currently authenticated user.
   * Used to enforce the role hierarchy before sending updates.
   */
  actorRole: LowercaseRole;
  /** Called after each mutation attempt with a human-readable outcome. */
  onToast?: (type: "success" | "error", message: string) => void;
}

export interface UsePermissionsReturn {
  /** Current module list, including any pending optimistic updates. */
  modules: RegisteredModule[];
  /** True while the initial load is in progress. */
  isLoading: boolean;
  /** Non-null when the initial load failed. */
  error: string | null;
  /**
   * Toggle a single permission for a role on a module.
   *
   * Applies the change optimistically so the UI responds instantly, then
   * sends a PATCH to the API. On API failure the change is rolled back and
   * `onToast` is called with the error message.
   *
   * No-op (with an error toast) if the current actor role does not have
   * permission to edit the target role's permissions.
   */
  updatePermission: (
    moduleId: string,
    role: Role,
    field: PermissionField,
    value: boolean
  ) => void;
  /**
   * Returns true if the current actor may edit permissions for the given
   * target role. Delegates to the service-layer role hierarchy rules.
   *
   * @param targetRole - Lowercase role whose permissions would be changed.
   */
  canEditPermissions: (targetRole: LowercaseRole) => boolean;
  /** Re-fetch the module list from the server. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchModules(organizationId: string): Promise<RegisteredModule[]> {
  const res = await fetch(
    `/api/permissions?organizationId=${encodeURIComponent(organizationId)}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load permissions (${res.status})`);
  }
  return res.json();
}

async function patchPermission(
  moduleId: string,
  role: Role,
  field: PermissionField,
  value: boolean
): Promise<RegisteredModule> {
  const res = await fetch(
    `/api/permissions/${encodeURIComponent(moduleId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { [role]: { [field]: value } } }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error ?? `Failed to update permission (${res.status})`
    );
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePermissions({
  organizationId,
  actorRole,
  onToast,
}: UsePermissionsOptions): UsePermissionsReturn {
  const [modules, setModules] = useState<RegisteredModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Tracks the last server-confirmed state so individual modules can be
   * rolled back without disturbing other in-flight optimistic updates.
   */
  const confirmedRef = useRef<RegisteredModule[]>([]);

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchModules(organizationId);
      confirmedRef.current = snapshotModules(data);
      setModules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  // -------------------------------------------------------------------------
  // Role hierarchy
  // -------------------------------------------------------------------------

  const checkCanEdit = useCallback(
    (targetRole: LowercaseRole): boolean => {
      return canEditPermissions(actorRole, targetRole);
    },
    [actorRole]
  );

  // -------------------------------------------------------------------------
  // Permission update (optimistic + rollback on error)
  // -------------------------------------------------------------------------

  const updatePermission = useCallback(
    (moduleId: string, role: Role, field: PermissionField, value: boolean) => {
      const lowercaseRole = role.toLowerCase() as LowercaseRole;

      // Role hierarchy check — provide immediate feedback without a round-trip.
      if (!canEditPermissions(actorRole, lowercaseRole)) {
        onToast?.(
          "error",
          `Your role cannot edit ${role} permissions`
        );
        return;
      }

      // Apply optimistically so the toggle responds instantly.
      setModules((prev) =>
        applyOptimisticUpdate(prev, moduleId, { role, field, value })
      );

      // Send the PATCH in the background; roll back on failure.
      void patchPermission(moduleId, role, field, value)
        .then((updated) => {
          // Promote server response to confirmed state.
          confirmedRef.current = confirmedRef.current.map((m) =>
            m.id === updated.id ? { ...updated } : m
          );
          setModules((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
          onToast?.("success", "Permission updated");
        })
        .catch((err) => {
          const message =
            err instanceof Error ? err.message : "Update failed";
          // Roll back only this module; leave other optimistic updates intact.
          const snapshot = confirmedRef.current.filter(
            (m) => m.id === moduleId
          );
          setModules((prev) => revertModule(prev, snapshot));
          onToast?.("error", message);
        });
    },
    [actorRole, onToast]
  );

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    modules,
    isLoading,
    error,
    updatePermission,
    canEditPermissions: checkCanEdit,
    refresh: load,
  };
}
