"use client";

import { useState, useEffect, useCallback } from "react";
import { AuditLog } from "@/lib/audit/export";
import {
  fetchAuditLogs,
  AuditQueryFilters,
  SortConfig,
  PAGE_SIZE,
} from "@/lib/audit/queries";

// TODO: Replace with actual organization ID from Better Auth session
const DEV_ORG_ID = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? "dev-org";

interface UseAuditLogsOptions {
  organizationId?: string;
}

interface UseAuditLogsReturn {
  logs: AuditLog[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  pageSize: number;
  filters: AuditQueryFilters;
  sort: SortConfig;
  setPage: (page: number) => void;
  updateFilters: (filters: AuditQueryFilters) => void;
  updateSort: (column: SortConfig["column"]) => void;
  reload: () => void;
}

export function useAuditLogs({
  organizationId = DEV_ORG_ID,
}: UseAuditLogsOptions = {}): UseAuditLogsReturn {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPageState] = useState(1);
  const [filters, setFilters] = useState<AuditQueryFilters>({});
  const [sort, setSort] = useState<SortConfig>({
    column: "created_at",
    direction: "desc",
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await fetchAuditLogs(organizationId, filters, sort, page);

    setLogs(result.data);
    setTotalCount(result.count);
    if (result.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }, [organizationId, filters, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  const updateFilters = useCallback((newFilters: AuditQueryFilters) => {
    setFilters(newFilters);
    setPageState(1);
  }, []);

  const updateSort = useCallback(
    (column: SortConfig["column"]) => {
      setSort((prev) => ({
        column,
        direction:
          prev.column === column && prev.direction === "asc" ? "desc" : "asc",
      }));
      setPageState(1);
    },
    []
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return {
    logs,
    totalCount,
    isLoading,
    error,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
    filters,
    sort,
    setPage,
    updateFilters,
    updateSort,
    reload: load,
  };
}
