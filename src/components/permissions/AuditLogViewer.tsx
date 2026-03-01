"use client";

import { ChevronLeft, ChevronRight, RefreshCw, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  PermissionAuditLogEntry,
  PermissionAuditLogFilters,
  PermissionLevel,
  PermissionRole,
} from "@/lib/types/permissions";
import { usePermissionAuditLog } from "@/hooks/usePermissionAuditLog";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return "just now";
    if (diffSec < 3600) {
      const m = Math.floor(diffSec / 60);
      return `${m}m ago`;
    }
    if (diffSec < 86400) {
      const h = Math.floor(diffSec / 3600);
      return `${h}h ago`;
    }
    const d = Math.floor(diffSec / 86400);
    return `${d}d ago`;
  } catch {
    return iso;
  }
}

function formatRole(role: PermissionRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatField(field: PermissionLevel): string {
  return field === "feature_access" ? "Feature Access" : "Settings Access";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RoleBadgeProps {
  role: PermissionRole;
}

function RoleBadge({ role }: RoleBadgeProps) {
  const colours: Record<PermissionRole, string> = {
    owner:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    admin:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    user: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        colours[role]
      )}
    >
      {formatRole(role)}
    </span>
  );
}

interface AccessChangeBadgeProps {
  previousValue: boolean;
  newValue: boolean;
}

function AccessChangeBadge({ previousValue, newValue }: AccessChangeBadgeProps) {
  const wasEnabled = previousValue;
  const isEnabled = newValue;

  const beforeLabel = wasEnabled ? "On" : "Off";
  const afterLabel = isEnabled ? "On" : "Off";

  const arrowClass = isEnabled
    ? "text-green-600 dark:text-green-400"
    : "text-red-500 dark:text-red-400";

  const afterClass = isEnabled
    ? "text-green-700 dark:text-green-300 font-semibold"
    : "text-red-600 dark:text-red-400 font-semibold";

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span>{beforeLabel}</span>
      {isEnabled ? (
        <ArrowUp className={cn("h-3 w-3", arrowClass)} aria-hidden="true" />
      ) : (
        <ArrowDown className={cn("h-3 w-3", arrowClass)} aria-hidden="true" />
      )}
      <span className={afterClass}>{afterLabel}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: { value: PermissionRole | ""; label: string }[] = [
  { value: "", label: "All roles" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

const FIELD_OPTIONS: { value: PermissionLevel | ""; label: string }[] = [
  { value: "", label: "All fields" },
  { value: "feature_access", label: "Feature Access" },
  { value: "settings_access", label: "Settings Access" },
];

const selectClass = cn(
  "h-9 rounded-md border border-input bg-background px-3 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
);

interface FilterBarProps {
  filters: PermissionAuditLogFilters;
  onFiltersChange: (f: PermissionAuditLogFilters) => void;
}

function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  function set(patch: Partial<PermissionAuditLogFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  const hasActive = !!(
    filters.module ||
    filters.role ||
    filters.changedField ||
    filters.actorId ||
    filters.dateFrom ||
    filters.dateTo
  );

  return (
    <div
      role="search"
      aria-label="Audit log filters"
      className="flex flex-wrap items-end gap-3"
    >
      {/* Role */}
      <div className="flex flex-col gap-1">
        <label htmlFor="pal-role" className="text-xs font-medium text-muted-foreground">
          Role
        </label>
        <select
          id="pal-role"
          value={filters.role ?? ""}
          onChange={(e) =>
            set({
              role: (e.target.value as PermissionRole) || undefined,
            })
          }
          className={selectClass}
          aria-label="Filter by role"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Field */}
      <div className="flex flex-col gap-1">
        <label htmlFor="pal-field" className="text-xs font-medium text-muted-foreground">
          Field
        </label>
        <select
          id="pal-field"
          value={filters.changedField ?? ""}
          onChange={(e) =>
            set({
              changedField: (e.target.value as PermissionLevel) || undefined,
            })
          }
          className={selectClass}
          aria-label="Filter by changed field"
        >
          {FIELD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date from */}
      <div className="flex flex-col gap-1">
        <label htmlFor="pal-from" className="text-xs font-medium text-muted-foreground">
          From
        </label>
        <input
          id="pal-from"
          type="date"
          value={filters.dateFrom ?? ""}
          max={filters.dateTo}
          onChange={(e) => set({ dateFrom: e.target.value || undefined })}
          className={selectClass}
          aria-label="Start date filter"
        />
      </div>

      {/* Date to */}
      <div className="flex flex-col gap-1">
        <label htmlFor="pal-to" className="text-xs font-medium text-muted-foreground">
          To
        </label>
        <input
          id="pal-to"
          type="date"
          value={filters.dateTo ?? ""}
          min={filters.dateFrom}
          onChange={(e) => set({ dateTo: e.target.value || undefined })}
          className={selectClass}
          aria-label="End date filter"
        />
      </div>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange({})}
          className="self-end text-muted-foreground"
          aria-label="Clear all filters"
        >
          Clear
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log table
// ---------------------------------------------------------------------------

interface LogTableProps {
  entries: PermissionAuditLogEntry[];
  isLoading: boolean;
}

function LogTable({ entries, isLoading }: LogTableProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading audit log" className="space-y-2 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded bg-muted"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No audit log entries match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Permission audit log">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th scope="col" className="pb-2 pr-4">When</th>
            <th scope="col" className="pb-2 pr-4">Actor</th>
            <th scope="col" className="pb-2 pr-4">Module</th>
            <th scope="col" className="pb-2 pr-4">Role</th>
            <th scope="col" className="pb-2 pr-4">Field</th>
            <th scope="col" className="pb-2">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="group hover:bg-muted/30 transition-colors"
            >
              {/* Timestamp */}
              <td className="py-2.5 pr-4 align-top">
                <time
                  dateTime={entry.createdAt}
                  title={formatTimestamp(entry.createdAt)}
                  className="whitespace-nowrap text-muted-foreground"
                >
                  {formatRelative(entry.createdAt)}
                </time>
              </td>

              {/* Actor */}
              <td className="py-2.5 pr-4 align-top">
                <p className="font-medium leading-snug">{entry.actorName}</p>
                <p className="text-xs text-muted-foreground">{entry.actorEmail}</p>
              </td>

              {/* Module */}
              <td className="py-2.5 pr-4 align-top">
                <span className="font-mono text-xs">{entry.module}</span>
              </td>

              {/* Role */}
              <td className="py-2.5 pr-4 align-top">
                <RoleBadge role={entry.role} />
              </td>

              {/* Changed field */}
              <td className="py-2.5 pr-4 align-top text-muted-foreground">
                {formatField(entry.changedField)}
              </td>

              {/* Before → After */}
              <td className="py-2.5 align-top">
                <AccessChangeBadge
                  previousValue={entry.previousValue}
                  newValue={entry.newValue}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 pt-2 text-sm">
      <span className="text-muted-foreground">
        {total === 0
          ? "No entries"
          : `Showing ${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="px-2 text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface AuditLogViewerProps {
  /** Organization whose permission audit log to display. */
  organizationId: string;
  /**
   * Narrow the log to a specific module slug.
   * When provided, the module filter in the filter bar is hidden.
   */
  moduleSlug?: string;
  /** Override the default page size (50). */
  pageSize?: number;
  className?: string;
}

/**
 * Displays the permission audit log for an organization with filtering and
 * pagination.  Fetches data from `GET /api/audit/permissions`.
 *
 * Intended for use on the Permissions settings page (Owner / Admin only).
 */
export function AuditLogViewer({
  organizationId,
  moduleSlug,
  pageSize,
  className,
}: AuditLogViewerProps) {
  const {
    entries,
    total,
    isLoading,
    error,
    page,
    totalPages,
    pageSize: resolvedPageSize,
    filters,
    setPage,
    updateFilters,
    reload,
  } = usePermissionAuditLog({
    organizationId,
    filters: moduleSlug ? { module: moduleSlug } : {},
    pageSize,
  });

  return (
    <section
      aria-label="Permission audit log"
      className={cn("space-y-4", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Audit Log</h3>
          <p className="text-xs text-muted-foreground">
            Read-only record of all permission changes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={reload}
          disabled={isLoading}
          aria-label="Refresh audit log"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            aria-hidden="true"
          />
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {/* Filters */}
      <FilterBar
        filters={moduleSlug ? { ...filters, module: moduleSlug } : filters}
        onFiltersChange={(f) => {
          // When scoped to a module, prevent the module filter from being cleared.
          updateFilters(moduleSlug ? { ...f, module: moduleSlug } : f);
        }}
      />

      {/* Error */}
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Table */}
      <LogTable entries={entries} isLoading={isLoading} />

      {/* Pagination */}
      {!isLoading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={resolvedPageSize}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
