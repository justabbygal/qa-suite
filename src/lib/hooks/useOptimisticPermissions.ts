"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { RegisteredModule, Role } from "@/lib/modules/types";
import {
  type PermissionField,
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

const DEBOUNCE_DELAY_MS = 350;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 8000;

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

type UpdatePayload = { role: Role; field: PermissionField; value: boolean };

async function patchModulePermissions(
  moduleId: string,
  update: UpdatePayload
): Promise<RegisteredModule> {
  const res = await fetch(`/api/permissions/${encodeURIComponent(moduleId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      permissions: { [update.role]: { [update.field]: update.value } },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `Failed to update permission (${res.status})`);
    Object.assign(err, { retryable: res.status >= 500 });
    throw err;
  }
  return res.json();
}

function isRetryable(err: unknown): boolean {
  // Native fetch throws TypeError on network failure.
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("offline")
    )
      return true;
    return (err as Error & { retryable?: boolean }).retryable === true;
  }
  return false;
}

/** Exponential backoff capped at RETRY_MAX_DELAY_MS. */
function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkStatus = "online" | "offline";

export interface PermissionError {
  /** User-facing error message. */
  message: string;
  /** Whether the error is transient and worth retrying. */
  retryable: boolean;
  /** Number of attempts made so far (1 = first attempt failed). */
  attemptCount: number;
}

interface QueuedUpdate {
  moduleId: string;
  role: Role;
  field: PermissionField;
  value: boolean;
  attemptCount: number;
}

export interface UseOptimisticPermissionsReturn {
  /** Current module list including any pending optimistic updates. */
  modules: RegisteredModule[];
  /** True while the initial load is in progress. */
  isLoading: boolean;
  /** Non-null when the initial load failed. */
  loadError: string | null;
  /** Module IDs with in-flight API mutations. */
  pendingModuleIds: Set<string>;
  /** Current network connectivity status. */
  networkStatus: NetworkStatus;
  /**
   * Per-permission error state.
   * Keyed by permissionKey(moduleId, role, field).
   */
  permissionErrors: ReadonlyMap<string, PermissionError>;
  /**
   * Toggle a single permission. Applies optimistically, debounces the API
   * call, and retries automatically on transient failures.
   */
  updatePermission: (
    moduleId: string,
    role: Role,
    field: PermissionField,
    value: boolean
  ) => void;
  /** Apply many permission changes at once. */
  bulkUpdatePermissions: (updates: BulkUpdateItem[]) => Promise<BulkUpdateResult>;
  /**
   * Retry the last failed update for the specified permission.
   * No-op when no error exists for the key.
   */
  retryUpdate: (moduleId: string, role: Role, field: PermissionField) => void;
  /** Retry all currently failed permission updates. */
  retryAll: () => void;
  /** Dismiss the error for a specific permission without retrying. */
  clearError: (moduleId: string, role: Role, field: PermissionField) => void;
  /** Re-fetch the module list from the server. */
  refresh: () => void;
}

export interface UseOptimisticPermissionsOptions {
  organizationId: string;
  /** Called after each mutation attempt with a human-readable outcome. */
  onToast?: (type: "success" | "error", message: string) => void;
  /** Maximum automatic retry attempts for transient failures. Default: 3. */
  maxRetries?: number;
  /** Automatically flush queued updates when connectivity is restored. Default: true. */
  retryOnReconnect?: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOptimisticPermissions({
  organizationId,
  onToast,
  maxRetries = 3,
  retryOnReconnect = true,
}: UseOptimisticPermissionsOptions): UseOptimisticPermissionsReturn {
  // ---- State ----

  const [modules, setModules] = useState<RegisteredModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingModuleIds, setPendingModuleIds] = useState<Set<string>>(new Set());
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online"
  );
  const [permissionErrors, setPermissionErrors] = useState<Map<string, PermissionError>>(
    new Map()
  );

  // ---- Refs ----

  /** Last server-confirmed state, used for selective per-module rollbacks. */
  const confirmedRef = useRef<RegisteredModule[]>([]);

  /** Debounce timers keyed by permissionKey(). */
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Automatic retry backoff timers keyed by permissionKey(). */
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Failed updates keyed by permissionKey().
   * Stored so retryUpdate() can replay them without requiring the caller to
   * re-supply the intended value.
   */
  const failedUpdatesRef = useRef<Map<string, QueuedUpdate>>(new Map());

  /**
   * Updates queued while offline, keyed by permissionKey() so that rapid
   * toggles on the same permission keep only the latest intended value.
   */
  const offlineQueueRef = useRef<Map<string, QueuedUpdate>>(new Map());

  // ---- Pending helpers ----

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

  // ---- Permission error helpers ----

  const setPermError = useCallback((key: string, error: PermissionError) => {
    setPermissionErrors((prev) => new Map(prev).set(key, error));
  }, []);

  const deletePermError = useCallback((key: string) => {
    setPermissionErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // ---- Load ----

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

  // Clean up all timers on unmount.
  useEffect(() => {
    const debounce = debounceTimersRef.current;
    const retry = retryTimersRef.current;
    return () => {
      debounce.forEach(clearTimeout);
      debounce.clear();
      retry.forEach(clearTimeout);
      retry.clear();
    };
  }, []);

  // ---- Core API execution with automatic retry ----

  /**
   * Stored in a ref so that recursive retry closures always invoke the latest
   * version of the function even after dependency changes.
   */
  const executeUpdateRef = useRef<(queued: QueuedUpdate) => Promise<void>>();

  const executeUpdate = useCallback(
    async (queued: QueuedUpdate) => {
      const { moduleId, role, field, value, attemptCount } = queued;
      const key = permissionKey(moduleId, role, field);

      addPending(moduleId);

      try {
        const updated = await patchModulePermissions(moduleId, { role, field, value });

        // Promote server response to confirmed state.
        confirmedRef.current = confirmedRef.current.map((m) =>
          m.id === updated.id ? { ...updated } : m
        );
        setModules((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

        // Clear any tracked failure for this permission.
        failedUpdatesRef.current.delete(key);
        deletePermError(key);

        onToast?.("success", "Permission updated");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Update failed";
        const retryable = isRetryable(err);

        if (retryable && attemptCount < maxRetries) {
          // Schedule an automatic retry with exponential backoff.
          const delay = retryDelayMs(attemptCount);
          const timer = setTimeout(() => {
            retryTimersRef.current.delete(key);
            executeUpdateRef.current?.({ ...queued, attemptCount: attemptCount + 1 });
          }, delay);
          retryTimersRef.current.set(key, timer);

          // Show in-progress retry state without rolling back the optimistic UI.
          setPermError(key, { message, retryable: true, attemptCount });
        } else {
          // Retries exhausted or non-retryable error — roll back this module.
          const moduleSnapshot = confirmedRef.current.filter((m) => m.id === moduleId);
          setModules((prev) => revertModule(prev, moduleSnapshot));

          failedUpdatesRef.current.set(key, queued);
          setPermError(key, { message, retryable, attemptCount });
          onToast?.("error", message);
        }
      } finally {
        removePending(moduleId);
      }
    },
    [addPending, removePending, deletePermError, setPermError, onToast, maxRetries]
  );

  // Keep the ref in sync with the latest callback.
  useEffect(() => {
    executeUpdateRef.current = executeUpdate;
  }, [executeUpdate]);

  // ---- Network monitoring ----

  useEffect(() => {
    function handleOnline() {
      setNetworkStatus("online");

      if (!retryOnReconnect || offlineQueueRef.current.size === 0) return;

      // Flush offline queue — the optimistic UI is already showing the queued
      // values so no re-apply is necessary; just send the API calls.
      const queue = Array.from(offlineQueueRef.current.values());
      offlineQueueRef.current.clear();

      for (const item of queue) {
        const key = permissionKey(item.moduleId, item.role, item.field);
        deletePermError(key);
        executeUpdateRef.current?.({ ...item, attemptCount: 1 });
      }
    }

    function handleOffline() {
      setNetworkStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [retryOnReconnect, deletePermError]);

  // ---- updatePermission ----

  const updatePermission = useCallback(
    (moduleId: string, role: Role, field: PermissionField, value: boolean) => {
      const key = permissionKey(moduleId, role, field);

      // Respond to the toggle immediately.
      setModules((prev) => applyOptimisticUpdate(prev, moduleId, { role, field, value }));

      // Cancel any pending debounce or retry timer for this key so a new
      // interaction always supersedes in-flight state.
      const existingDebounce = debounceTimersRef.current.get(key);
      if (existingDebounce) {
        clearTimeout(existingDebounce);
        debounceTimersRef.current.delete(key);
      }
      const existingRetry = retryTimersRef.current.get(key);
      if (existingRetry) {
        clearTimeout(existingRetry);
        retryTimersRef.current.delete(key);
      }

      // Clear stale error state for this key.
      deletePermError(key);
      failedUpdatesRef.current.delete(key);

      const timer = setTimeout(() => {
        debounceTimersRef.current.delete(key);

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          // Queue for dispatch when connectivity is restored; keep only the
          // latest toggle per key to avoid conflicting updates.
          offlineQueueRef.current.set(key, { moduleId, role, field, value, attemptCount: 1 });
          setPermError(key, {
            message: "You appear to be offline. This change will sync when you reconnect.",
            retryable: true,
            attemptCount: 0,
          });
          return;
        }

        executeUpdateRef.current?.({ moduleId, role, field, value, attemptCount: 1 });
      }, DEBOUNCE_DELAY_MS);

      debounceTimersRef.current.set(key, timer);
    },
    [deletePermError, setPermError]
  );

  // ---- bulkUpdatePermissions ----

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
              setModules((prev) => prev.map((m) => (m.id === moduleId ? confirmed : m)));
            }
            succeeded.push(...items);
          } catch {
            // Roll back only the failed module; succeeded modules are untouched.
            const moduleSnapshot = confirmedRef.current.filter((m) => m.id === moduleId);
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

  // ---- Retry ----

  const retryUpdate = useCallback(
    (moduleId: string, role: Role, field: PermissionField) => {
      const key = permissionKey(moduleId, role, field);
      const failed = failedUpdatesRef.current.get(key);
      if (!failed) return;

      // Cancel any pending backoff timer for this key.
      const existingRetry = retryTimersRef.current.get(key);
      if (existingRetry) {
        clearTimeout(existingRetry);
        retryTimersRef.current.delete(key);
      }

      // Re-apply the optimistic update since it was rolled back after failure.
      setModules((prev) =>
        applyOptimisticUpdate(prev, moduleId, {
          role: failed.role,
          field: failed.field,
          value: failed.value,
        })
      );

      // Clear the recorded error before executing (executeUpdate sets it again on failure).
      deletePermError(key);
      failedUpdatesRef.current.delete(key);

      // Execute immediately — no debounce for a manual retry.
      executeUpdateRef.current?.({ ...failed, attemptCount: 1 });
    },
    [deletePermError]
  );

  const retryAll = useCallback(() => {
    for (const failed of failedUpdatesRef.current.values()) {
      retryUpdate(failed.moduleId, failed.role, failed.field);
    }
  }, [retryUpdate]);

  const clearError = useCallback(
    (moduleId: string, role: Role, field: PermissionField) => {
      const key = permissionKey(moduleId, role, field);
      failedUpdatesRef.current.delete(key);
      deletePermError(key);
    },
    [deletePermError]
  );

  // ---- Public API ----

  return {
    modules,
    isLoading,
    loadError,
    pendingModuleIds,
    networkStatus,
    permissionErrors,
    updatePermission,
    bulkUpdatePermissions,
    retryUpdate,
    retryAll,
    clearError,
    refresh: load,
  };
}
