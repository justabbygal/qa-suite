"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

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
        [update.role]: {
          [update.field]: update.value,
        },
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

export interface UsePermissionsReturn {
  /** Current module list, including any pending optimistic updates. */
  modules: RegisteredModule[];
  /** True while the initial load is in progress. */
  isLoading: boolean;
  /** Non-null when the initial load failed. */
  loadError: string | null;
  /** Set of module IDs that currently have pending API mutations. */
  pendingModuleIds: Set<string>;
  /**
   * Toggle a single permission. Applies optimistically then debounces the
   * API call. On failure the value reverts and an error description is returned.
   */
  updatePermission: (
    moduleId: string,
    role: Role,
    field: PermissionField,
    value: boolean
  ) => void;
  /**
   * Apply many permission changes at once. Mutations are sent in parallel and
   * the result object describes which succeeded and which failed.
   */
  bulkUpdatePermissions: (updates: BulkUpdateItem[]) => Promise<BulkUpdateResult>;
  /** Manually re-fetch the module list from the server. */
  refresh: () => void;
}

export interface UsePermissionsOptions {
  organizationId: string;
  /** Called with a success or error message after each mutation attempt. */
  onToast?: (type: "success" | "error", message: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePermissions({
  organizationId,
  onToast,
}: UsePermissionsOptions): UsePermissionsReturn {
  const [modules, setModules] = useState<RegisteredModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingModuleIds, setPendingModuleIds] = useState<Set<string>>(new Set());

  /**
   * Tracks the last server-confirmed state. Used to roll back individual
   * modules when an API call fails without disturbing other optimistic updates
   * that may still be in-flight.
   */
  const confirmedRef = useRef<RegisteredModule[]>([]);

  /**
   * Per-permission debounce timers, keyed by permissionKey().
   * Cleared when the component unmounts.
   */
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const addPending = useCallback((moduleId: string) => {
    setPendingModuleIds((prev) => {
      const next = new Set(prev);
      next.add(moduleId);
      return next;
    });
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
      const message = err instanceof Error ? err.message : "Unknown error";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Clean up all timers on unmount so deferred API calls are cancelled.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Single permission update (debounced, optimistic)
  // -------------------------------------------------------------------------

  const updatePermission = useCallback(
    (moduleId: string, role: Role, field: PermissionField, value: boolean) => {
      const update: PermissionUpdatePayload = { moduleId, role, field, value };
      const key = permissionKey(moduleId, role, field);

      // 1. Apply optimistically immediately so the UI responds at once.
      setModules((prev) => applyOptimisticUpdate(prev, update));

      // 2. Cancel any existing debounce for this exact toggle.
      const existing = timersRef.current.get(key);
      if (existing) clearTimeout(existing);

      // 3. Schedule the real API call.
      const timer = setTimeout(async () => {
        timersRef.current.delete(key);
        addPending(moduleId);

        try {
          const updated = await patchModulePermissions(moduleId, update);

          // Sync confirmed state with server response.
          confirmedRef.current = confirmedRef.current.map((m) =>
            m.id === updated.id ? { ...updated } : m
          );
          // Replace the module in display state with the authoritative server data.
          setModules((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );

          onToast?.("success", "Permission updated");
        } catch (err) {
          const message = err instanceof Error ? err.message : "Update failed";

          // Roll back only this module to its last confirmed state.
          setModules((prev) =>
            revertModule(prev, confirmedRef.current, moduleId)
          );

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
  // Bulk update (parallel, with partial-failure handling)
  // -------------------------------------------------------------------------

  const bulkUpdatePermissions = useCallback(
    async (updates: BulkUpdateItem[]): Promise<BulkUpdateResult> => {
      if (updates.length === 0) {
        return { succeeded: [], failed: [] };
      }

      // 1. Apply all changes optimistically.
      setModules((prev) => applyBulkOptimisticUpdates(prev, updates));

      // 2. Group updates by moduleId so we can show a single pending state
      //    per module and send one PATCH per module.
      const byModule = new Map<string, BulkUpdateItem[]>();
      for (const item of updates) {
        const list = byModule.get(item.moduleId) ?? [];
        list.push(item);
        byModule.set(item.moduleId, list);
      }

      // Mark all involved modules as pending.
      byModule.forEach((_, id) => addPending(id));

      const succeeded: BulkUpdateItem[] = [];
      const failed: Array<{ item: BulkUpdateItem; error: string }> = [];

      // 3. Fire one PATCH per module in parallel.
      await Promise.all(
        Array.from(byModule.entries()).map(async ([moduleId, items]) => {
          try {
            // Send each toggle in this module sequentially to avoid races.
            let updatedModule: RegisteredModule | null = null;
            for (const item of items) {
              updatedModule = await patchModulePermissions(moduleId, item);
            }

            if (updatedModule) {
              confirmedRef.current = confirmedRef.current.map((m) =>
                m.id === moduleId ? { ...updatedModule! } : m
              );
              setModules((prev) =>
                prev.map((m) => (m.id === moduleId ? updatedModule! : m))
              );
            }
            succeeded.push(...items);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Update failed";
            // Rollback only this module.
            setModules((prev) =>
              revertModule(prev, confirmedRef.current, moduleId)
            );
            failed.push(...items.map((item) => ({ item, error: message })));
          } finally {
            removePending(moduleId);
          }
        })
      );

      // 4. Surface aggregate result via toast.
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
  };
}
