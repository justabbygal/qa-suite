"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AuditQueryFilters } from "@/lib/audit/queries";

// Common audit action types in the system
const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "member.invited", label: "Member invited" },
  { value: "member.role_changed", label: "Role changed" },
  { value: "member.removed", label: "Member removed" },
  { value: "module.registered", label: "Module registered" },
  { value: "module.deregistered", label: "Module deregistered" },
  { value: "permissions.updated", label: "Permissions updated" },
  { value: "settings.updated", label: "Settings updated" },
  { value: "integration.connected", label: "Integration connected" },
  { value: "integration.disconnected", label: "Integration disconnected" },
];

interface AuditFiltersProps {
  filters: AuditQueryFilters;
  onFiltersChange: (filters: AuditQueryFilters) => void;
}

export default function AuditFilters({
  filters,
  onFiltersChange,
}: AuditFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search ?? "");

  const hasActiveFilters =
    !!filters.search ||
    !!filters.action ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    onFiltersChange({ ...filters, search: localSearch.trim() || undefined });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      onFiltersChange({ ...filters, search: localSearch.trim() || undefined });
    }
  }

  function handleActionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onFiltersChange({ ...filters, action: e.target.value || undefined });
  }

  function handleDateFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFiltersChange({ ...filters, dateFrom: e.target.value || undefined });
  }

  function handleDateToChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFiltersChange({ ...filters, dateTo: e.target.value || undefined });
  }

  function handleClearFilters() {
    setLocalSearch("");
    onFiltersChange({});
  }

  return (
    <div
      role="search"
      aria-label="Audit log filters"
      className="space-y-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Search */}
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 items-center gap-2"
          role="search"
          aria-label="Search audit logs"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search by user, action, or resource…"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              aria-label="Search audit logs by user, action, or resource"
              className={cn(
                "h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" aria-label="Apply search">
            Search
          </Button>
        </form>

        {/* Action filter */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="action-filter"
            className="shrink-0 text-sm font-medium"
          >
            Action
          </label>
          <select
            id="action-filter"
            value={filters.action ?? ""}
            onChange={handleActionChange}
            aria-label="Filter by action type"
            className={cn(
              "h-10 rounded-md border border-input bg-background px-3 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Date range */}
        <fieldset className="flex flex-1 items-center gap-3">
          <legend className="sr-only">Date range filter</legend>
          <div className="flex items-center gap-2">
            <label htmlFor="date-from" className="shrink-0 text-sm font-medium">
              From
            </label>
            <input
              id="date-from"
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={handleDateFromChange}
              max={filters.dateTo}
              aria-label="Start date filter"
              className={cn(
                "h-10 rounded-md border border-input bg-background px-3 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="date-to" className="shrink-0 text-sm font-medium">
              To
            </label>
            <input
              id="date-to"
              type="date"
              value={filters.dateTo ?? ""}
              onChange={handleDateToChange}
              min={filters.dateFrom}
              aria-label="End date filter"
              className={cn(
                "h-10 rounded-md border border-input bg-background px-3 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            />
          </div>
        </fieldset>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            aria-label="Clear all filters"
            className="shrink-0 text-muted-foreground"
          >
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
