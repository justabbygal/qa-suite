"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  PermissionAuditLogEntry,
  PermissionAuditLogFilters,
} from "@/lib/types/permissions";

// TODO: Replace with actual organization ID from Better Auth session.
const DEV_ORG_ID = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? "dev-org";

const DEFAULT_PAGE_SIZE = 50;

export interface UsePermissionAuditLogOptions {
  organizationId?: string;
  filters?: PermissionAuditLogFilters;
  pageSize?: number;
}

export interface UsePermissionAuditLogReturn {
  entries: PermissionAuditLogEntry[];
  total: number;
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  pageSize: number;
  filters: PermissionAuditLogFilters;
  setPage: (page: number) => void;
  updateFilters: (filters: PermissionAuditLogFilters) => void;
  reload: () => void;
}

/**
 * Fetches a page of permission audit log entries from the server.
 */
async function fetchPermissionAuditLog(
  organizationId: string,
  filters: PermissionAuditLogFilters,
  page: number,
  pageSize: number
): Promise<{
  entries: PermissionAuditLogEntry[];
  total: number;
  totalPages: number;
  error: string | null;
}> {
  const params = new URLSearchParams({ organizationId });

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  if (filters.module) params.set("module", filters.module);
  if (filters.role) params.set("role", filters.role);
  if (filters.changedField) params.set("changedField", filters.changedField);
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  try {
    const res = await fetch(`/api/audit/permissions?${params.toString()}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message =
        (body as { error?: { message?: string } })?.error?.message ??
        `Request failed (${res.status})`;
      return { entries: [], total: 0, totalPages: 1, error: message };
    }

    const body = await res.json();
    return {
      entries: (body.data as PermissionAuditLogEntry[]) ?? [],
      total: (body.total as number) ?? 0,
      totalPages: (body.totalPages as number) ?? 1,
      error: null,
    };
  } catch (err) {
    return {
      entries: [],
      total: 0,
      totalPages: 1,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Hook for fetching and navigating the permission audit log.
 *
 * Automatically re-fetches when `organizationId`, `filters`, or `page` changes.
 */
export function usePermissionAuditLog({
  organizationId = DEV_ORG_ID,
  filters: initialFilters = {},
  pageSize = DEFAULT_PAGE_SIZE,
}: UsePermissionAuditLogOptions = {}): UsePermissionAuditLogReturn {
  const [entries, setEntries] = useState<PermissionAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPageState] = useState(1);
  const [filters, setFilters] =
    useState<PermissionAuditLogFilters>(initialFilters);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await fetchPermissionAuditLog(
      organizationId,
      filters,
      page,
      pageSize
    );

    setEntries(result.entries);
    setTotal(result.total);
    setTotalPages(result.totalPages);
    if (result.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }, [organizationId, filters, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  const updateFilters = useCallback((newFilters: PermissionAuditLogFilters) => {
    setFilters(newFilters);
    setPageState(1);
  }, []);

  return {
    entries,
    total,
    isLoading,
    error,
    page,
    totalPages,
    pageSize,
    filters,
    setPage,
    updateFilters,
    reload: load,
  };
}
