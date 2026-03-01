"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import type { RegisteredModule } from "@/lib/modules/types";
import type { Role } from "@/lib/modules/types";
import {
  type PermissionField,
  type PermissionUpdatePayload,
  type BulkUpdateItem,
  type BulkUpdateResult,
  snapshotModules,
  applyOptimisticUpdate,
  applyBulkOptimisticUpdates,
  revertModule,
  permissionKey,
} from "@/lib/utils/permission-state";
import type { PermissionKey } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Milliseconds to wait after the last toggle before sending to the API. */
const DEBOUNCE_DELAY_MS = 350;

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

async function patchModulePermissions(
  moduleId: string,
  update: PermissionUpdatePayload
): Promise<RegisteredModule> {
  const res = await fetch(`/api/permissions/${encodeURIComponent(moduleId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      permissions: {
        [update.role]: { [update.field]: update.value },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update permission (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types exposed to consumers
// ---------------------------------------------------------------------------

export interface UsePermissionStateReturn {
  /** Current module list, including any pending optimistic updates. */
  modules: RegisteredModule[];
  /** True while the initial load is in progress. */
  isLoading: boolean;
  /** Non-null when the initial load failed. */
  loadError: string | null;
  /** Set of module IDs that currently have pending API mutations. */
  pendingModuleIds: Set<string>;
  /**
   * Toggle a single permission. Applies optimistically and debounces the API
   * call. On failure the value reverts and onToast is called with the error.
   */
  updatePermission: (
    moduleId: string,
    role: Role,
    field: PermissionField,
    value: boolean
  ) => void;
  /**
   * Apply many permission changes at once. Mutations are sent in parallel and
   * the result describes which succeeded and which failed.
   */
  bulkUpdatePermissions: (updates: BulkUpdateItem[]) => Promise<BulkUpdateResult>;
  /** Re-fetch the module list from the server. */
  refresh: () => void;
  /**
   * Check whether the given role has a specific permission on a module using
   * the dot-notation key format: "module-id.featureAccess" or
   * "module-id.settingsAccess".
   *
   * Reads from the current (optimistically-updated) module state, so the
   * result stays in sync with any in-flight permission toggles.
   *
   * Returns `false` when the module is not loaded or is not registered.
   *
   * @example
   *   checkPermission("user-management.featureAccess", "Owner") // → true
   *   checkPermission("integrations.settingsAccess", "User")    // → false
   */
  checkPermission: (key: PermissionKey, role: Role) => boolean;
}

export interface UsePermissionStateOptions {
  organizationId: string;
  /** Called with a human-readable message after each mutation attempt. */
  onToast?: (type: "success" | "error", message: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePermissionState({
  organizationId,
  onToast,
}: UsePermissionStateOptions): UsePermissionStateReturn {
  const [modules, setModules] = useState<RegisteredModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingModuleIds, setPendingModuleIds] = useState<Set<string>>(
    new Set()
  );

  /**
   * Tracks the last server-confirmed state so individual modules can be
   * rolled back without disturbing other in-flight optimistic updates.
   */
  const confirmedRef = useRef<RegisteredModule[]>([]);

  /**
   * Per-permission debounce timers keyed by permissionKey().
   * Flushed on unmount so stale API calls are never sent.
   */
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // -------------------------------------------------------------------------
  // Pending helpers
  // -------------------------------------------------------------------------

  const addPending = useCallback((moduleId: string) => {
    setPendingModuleIds((prev) => new Set(prev).add(moduleId));
  }, []);

  const removePending = useCallback((moduleId: string) => {
    setPendingModuleIds((prev) => {
      const next = new Set(prev);
      next.delete(moduleId);
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchModules(organizationId);
      confirmedRef.current = snapshotModules(data);
      setModules(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Cancel all pending debounce timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Single permission update (debounced + optimistic)
  // -------------------------------------------------------------------------

  const updatePermission = useCallback(
    (moduleId: string, role: Role, field: PermissionField, value: boolean) => {
      const update: PermissionUpdatePayload = { role, field, value };
      const key = permissionKey(moduleId, role, field);

      // Apply optimistically so the toggle responds instantly.
      setModules((prev) => applyOptimisticUpdate(prev, moduleId, update));

      // Cancel any existing timer for this exact toggle.
      const existing = timersRef.current.get(key);
      if (existing) clearTimeout(existing);

      // Schedule the API call after the debounce window.
      const timer = setTimeout(async () => {
        timersRef.current.delete(key);
        addPending(moduleId);

        try {
          const updated = await patchModulePermissions(moduleId, update);

          // Promote the server response to confirmed state.
          confirmedRef.current = confirmedRef.current.map((m) =>
            m.id === updated.id ? { ...updated } : m
          );
          setModules((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
          onToast?.("success", "Permission updated");
        } catch (err) {
          const message = err instanceof Error ? err.message : "Update failed";
          // Roll back only this module; leave other optimistic updates intact.
          const moduleSnapshot = confirmedRef.current.filter(
            (m) => m.id === moduleId
          );
          setModules((prev) => revertModule(prev, moduleSnapshot));
          onToast?.("error", message);
        } finally {
          removePending(moduleId);
        }
      }, DEBOUNCE_DELAY_MS);

      timersRef.current.set(key, timer);
    },
    [addPending, removePending, onToast]
  );

  // -------------------------------------------------------------------------
  // Bulk update (parallel, partial-failure safe)
  // -------------------------------------------------------------------------

  const bulkUpdatePermissions = useCallback(
    async (updates: BulkUpdateItem[]): Promise<BulkUpdateResult> => {
      if (updates.length === 0) return { succeeded: [], failed: [] };

      // Apply all optimistic changes up-front.
      setModules((prev) => applyBulkOptimisticUpdates(prev, updates));

      // Group by moduleId → one PATCH per module, all in parallel.
      const byModule = new Map<string, BulkUpdateItem[]>();
      for (const item of updates) {
        const list = byModule.get(item.moduleId) ?? [];
        list.push(item);
        byModule.set(item.moduleId, list);
      }

      byModule.forEach((_, id) => addPending(id));

      const succeeded: BulkUpdateItem[] = [];
      const failed: BulkUpdateItem[] = [];

      await Promise.all(
        Array.from(byModule.entries()).map(async ([moduleId, items]) => {
          try {
            // Send each toggle in the module sequentially to avoid races.
            let lastResponse: RegisteredModule | null = null;
            for (const item of items) {
              lastResponse = await patchModulePermissions(moduleId, {
                role: item.role,
                field: item.field,
                value: item.value,
              });
            }
            if (lastResponse !== null) {
              const confirmed = lastResponse;
              confirmedRef.current = confirmedRef.current.map((m) =>
                m.id === moduleId ? { ...confirmed } : m
              );
              setModules((prev) =>
                prev.map((m) => (m.id === moduleId ? confirmed : m))
              );
            }
            succeeded.push(...items);
          } catch {
            // Roll back only the failed module; succeeded modules are untouched.
            const moduleSnapshot = confirmedRef.current.filter(
              (m) => m.id === moduleId
            );
            setModules((prev) => revertModule(prev, moduleSnapshot));
            failed.push(...items);
          } finally {
            removePending(moduleId);
          }
        })
      );

      // Single aggregated toast for the whole bulk operation.
      if (failed.length === 0) {
        onToast?.(
          "success",
          `${succeeded.length} permission${succeeded.length !== 1 ? "s" : ""} updated`
        );
      } else if (succeeded.length === 0) {
        onToast?.("error", "All bulk permission updates failed");
      } else {
        onToast?.(
          "error",
          `${succeeded.length} succeeded, ${failed.length} failed — check individual modules`
        );
      }

      return { succeeded, failed };
    },
    [addPending, removePending, onToast]
  );

  // -------------------------------------------------------------------------
  // Permission check (dot-notation key)
  // -------------------------------------------------------------------------

  /**
   * Reads the current (optimistically-updated) module state to check whether
   * the given role holds the specified access field. The module is located by
   * its kebab-case identifier (the `module` field of RegisteredModule), not
   * its UUID, so the key format matches the registration manifest.
   */
  const checkPermission = useCallback(
    (key: PermissionKey, role: Role): boolean => {
      const lastDot = key.lastIndexOf(".");
      const moduleSlug = key.slice(0, lastDot);
      const field = key.slice(lastDot + 1) as PermissionField;

      const mod = modules.find((m) => m.module === moduleSlug);
      if (!mod) return false;

      const access = mod.permissions[role];
      if (!access) return false;

      if (field === "featureAccess") return access.featureAccess;
      // settingsAccess is only meaningful when featureAccess is also true.
      return access.featureAccess && access.settingsAccess;
    },
    [modules]
  );

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    modules,
    isLoading,
    loadError,
    pendingModuleIds,
    updatePermission,
    bulkUpdatePermissions,
    refresh: load,
    checkPermission,
  };
}
