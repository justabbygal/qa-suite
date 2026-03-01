"use client";

import { useState, useEffect } from "react";
import { Download, ShieldAlert, Loader2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import AuditLogTable from "@/components/audit/AuditLogTable";
import AuditFilters from "@/components/audit/AuditFilters";
import { Button } from "@/components/ui/button";

function AccessDenied() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <ShieldAlert
        className="h-12 w-12 text-muted-foreground"
        aria-hidden="true"
      />
      <h1 className="text-2xl font-semibold">Access Restricted</h1>
      <p className="max-w-sm text-muted-foreground">
        The audit log is only accessible to Owners. Contact your organization
        Owner if you need access.
      </p>
    </main>
  );
}

/**
 * Inner component so that useAuditLogs is only called when the user is
 * confirmed to be an Owner (hooks cannot be called conditionally).
 */
function AuditContent() {
  const {
    logs,
    totalCount,
    isLoading,
    error,
    page,
    totalPages,
    pageSize,
    filters,
    sort,
    setPage,
    updateFilters,
    updateSort,
  } = useAuditLogs();

  const hasActiveFilters =
    !!filters.search ||
    !!filters.action ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  function handleExport() {
    const params = new URLSearchParams();
    // TODO: Replace with actual org ID from Better Auth session
    params.set(
      "organization_id",
      process.env.NEXT_PUBLIC_DEV_ORG_ID ?? "dev-org"
    );
    if (filters.search) params.set("search", filters.search);
    if (filters.action) params.set("action", filters.action);
    if (filters.resourceType) params.set("resource_type", filters.resourceType);
    if (filters.actorId) params.set("actor_id", filters.actorId);
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);
    window.location.href = `/api/audit/export?${params.toString()}`;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Page header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Audit Log
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A full record of actions taken within your organization.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            aria-label="Export audit log as CSV"
            className="shrink-0"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main
        className="flex-1 space-y-6 p-6"
        id="audit-content"
        tabIndex={-1}
      >
        {/* Filters */}
        <section aria-label="Filter audit logs">
          <AuditFilters filters={filters} onFiltersChange={updateFilters} />
        </section>

        {/* Error state */}
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <strong>Error loading audit logs:</strong> {error}
          </div>
        )}

        {/* Results summary when filters are active */}
        {!isLoading && !error && hasActiveFilters && (
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            aria-atomic="true"
          >
            Found{" "}
            <span className="font-medium text-foreground">
              {totalCount.toLocaleString()}
            </span>{" "}
            {totalCount === 1 ? "entry" : "entries"} matching your filters.
          </p>
        )}

        {/* Audit log table */}
        <section aria-label="Audit log entries" aria-busy={isLoading}>
          <AuditLogTable
            logs={logs}
            isLoading={isLoading}
            sort={sort}
            onSort={updateSort}
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </section>
      </main>
    </div>
  );
}

/**
 * Audit Log page — Owner-only access.
 *
 * Renders a loading state while the role is being determined from localStorage,
 * then either shows the audit content or an access-denied screen.
 */
export default function AuditPage() {
  const userRole = useUserRole();
  // Track whether the role effect has run so we don't flash the wrong screen
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        aria-label="Loading"
        aria-busy="true"
      >
        <Loader2
          className="h-6 w-6 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (userRole !== "owner") {
    return <AccessDenied />;
  }

  return <AuditContent />;
}
