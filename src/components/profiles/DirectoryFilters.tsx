'use client';

import React from 'react';
import { ChevronUp, ChevronDown, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DirectoryFilters as Filters, SortField, ViewMode } from '@/lib/utils/directoryUtils';
import type { UserRole } from '@/modules/user-management/types/profile';

interface DirectoryFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  totalCount: number;
  filteredCount: number;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'role', label: 'Role' },
  { value: 'join_date', label: 'Join Date' },
];

const ROLE_OPTIONS: { value: UserRole | ''; label: string }[] = [
  { value: '', label: 'All Roles' },
  { value: 'Owner', label: 'Owner' },
  { value: 'Admin', label: 'Admin' },
  { value: 'User', label: 'User' },
];

export function DirectoryFilters({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  totalCount,
  filteredCount,
}: DirectoryFiltersProps) {
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search by name, email, or bio…"
          value={filters.search}
          onChange={(e) => update('search', e.target.value)}
          aria-label="Search team members"
          className="flex-1 min-w-48 border border-input rounded-md px-3 py-2 text-sm bg-background"
        />
        <select
          value={filters.role}
          onChange={(e) => update('role', e.target.value as UserRole | '')}
          aria-label="Filter by role"
          className="border border-input rounded-md px-3 py-2 text-sm bg-background"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={filters.sortField}
          onChange={(e) => update('sortField', e.target.value as SortField)}
          aria-label="Sort by"
          className="border border-input rounded-md px-3 py-2 text-sm bg-background"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => update('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
          aria-label={filters.sortOrder === 'asc' ? 'Switch to descending order' : 'Switch to ascending order'}
          className="h-10 px-3"
        >
          {filters.sortOrder === 'asc'
            ? <ChevronUp className="h-4 w-4" aria-hidden="true" />
            : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </Button>
        <div className="flex rounded-md border border-input overflow-hidden" role="group" aria-label="View mode">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            className={'px-3 py-2 transition-colors ' + (viewMode === 'grid' ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            className={'px-3 py-2 border-l border-input transition-colors ' + (viewMode === 'list' ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {totalCount > 0 && (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          Showing {filteredCount} of {totalCount} member{totalCount !== 1 ? 's' : ''}
          {filteredCount < totalCount && ' (filtered)'}
        </p>
      )}
    </div>
  );
}