"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUsers } from "@/hooks/useUsers";
import { checkCanViewUser } from "@/lib/services/admin-restrictions";
import {
  UserCard,
  RoleBadge,
  StatusBadge,
  Avatar,
  formatDate,
  formatExpiry,
} from "@/components/users/UserCard";
import type { UserEntry, UserEntryRole, UserStatus } from "@/lib/api/users";
import type { Role } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Filter configuration
// ---------------------------------------------------------------------------

const ROLE_FILTER_TABS: { value: UserEntryRole | "all"; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "Owner", label: "Owner" },
  { value: "Admin", label: "Admin" },
  { value: "User", label: "User" },
];

const STATUS_FILTER_TABS: { value: UserStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "expired", label: "Expired" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UserListProps {
  organizationId: string;
  /** The authenticated user's ID — used for the "(You)" indicator. */
  currentUserId: string;
  /**
   * The authenticated user's role in lowercase form (matching the permissions
   * service convention: "owner" | "admin" | "user").
   */
  currentUserRole: Role;
}

// ---------------------------------------------------------------------------
// UserList
// ---------------------------------------------------------------------------

/**
 * Displays all org members and pending invitations in a filterable,
 * searchable, paginated list. Respects role-based visibility so Admins only
 * see User-role accounts.
 */
export default function UserList({
  organizationId,
  currentUserId,
  currentUserRole,
}: UserListProps) {
  const {
    paginatedUsers,
    filteredUsers,
    totalPages,
    isLoading,
    error,
    filters,
    updateFilters,
    refetch,
  } = useUsers(organizationId);

  // Apply role-based visibility: Admins can only see User-role accounts
  const visibleUsers = paginatedUsers.filter((entry) => {
    const targetRole = entry.role.toLowerCase() as Role;
    return checkCanViewUser(currentUserRole, targetRole).allowed;
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle
              className="h-8 w-8 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">Failed to load users</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search by name or email…"
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            aria-label="Search users"
            className={cn(
              "h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          />
        </div>

        {/* Role + status filter bar */}
        <div
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          role="group"
          aria-label="User filters"
        >
          {/* Role filter tabs */}
          <div
            role="tablist"
            aria-label="Filter by role"
            className="flex flex-wrap gap-1"
          >
            {ROLE_FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={filters.role === tab.value}
                onClick={() => updateFilters({ role: tab.value })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  filters.role === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status filter dropdown */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="user-status-filter"
              className="shrink-0 text-sm font-medium"
            >
              Status
            </label>
            <select
              id="user-status-filter"
              value={filters.status}
              onChange={(e) =>
                updateFilters({ status: e.target.value as UserStatus | "all" })
              }
              aria-label="Filter by status"
              className={cn(
                "h-9 rounded-md border border-input bg-background px-3 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              {STATUS_FILTER_TABS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* List body */}
      {isLoading ? (
        <LoadingState />
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          hasFilters={
            filters.search !== "" ||
            filters.role !== "all" ||
            filters.status !== "all"
          }
        />
      ) : (
        <>
          <DesktopTable entries={visibleUsers} currentUserId={currentUserId} />
          <MobileCardList entries={visibleUsers} currentUserId={currentUserId} />
        </>
      )}

      {/* Pagination */}
      {!isLoading && !error && totalPages > 1 && (
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          onPageChange={(page) => updateFilters({ page })}
        />
      )}

      {/* Result count */}
      {!isLoading && !error && filteredUsers.length > 0 && (
        <p
          aria-live="polite"
          className="text-right text-xs text-muted-foreground"
        >
          Showing {visibleUsers.length} of {filteredUsers.length} result
          {filteredUsers.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading users…</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">
            {hasFilters ? "No users match your filters" : "No users yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "Try adjusting your search or filters."
              : "Invite team members to get started."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Desktop table
// ---------------------------------------------------------------------------

function DesktopTable({
  entries,
  currentUserId,
}: {
  entries: UserEntry[];
  currentUserId: string;
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border sm:block">
      <table
        className="w-full text-sm"
        aria-label="Users list"
        aria-live="polite"
      >
        <thead>
          <tr className="border-b bg-muted/50">
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-muted-foreground"
            >
              Name
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-muted-foreground"
            >
              Email
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-muted-foreground"
            >
              Role
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-muted-foreground"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-muted-foreground"
            >
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <DesktopRow
              key={entry.id}
              entry={entry}
              currentUserId={currentUserId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DesktopRow({
  entry,
  currentUserId,
}: {
  entry: UserEntry;
  currentUserId: string;
}) {
  const isCurrentUser =
    entry.type === "user" && !!currentUserId && entry.userId === currentUserId;

  return (
    <tr className="bg-card transition-colors hover:bg-muted/30">
      {/* Name + avatar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar entry={entry} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="truncate text-sm font-medium"
                title={entry.name}
              >
                {entry.name}
              </span>
              {isCurrentUser && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  (You)
                </span>
              )}
            </div>
            {entry.jobTitle && (
              <span className="block truncate text-xs text-muted-foreground">
                {entry.jobTitle}
                {entry.department ? ` · ${entry.department}` : ""}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Email */}
      <td
        className="max-w-[200px] truncate px-4 py-3 text-muted-foreground"
        title={entry.email}
      >
        {entry.email}
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        <RoleBadge role={entry.role} />
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={entry.status} />
      </td>

      {/* Details column */}
      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
        {entry.type === "invite" ? (
          <InviteDetails entry={entry} />
        ) : (
          <span>Joined {formatDate(entry.createdAt)}</span>
        )}
      </td>
    </tr>
  );
}

function InviteDetails({ entry }: { entry: UserEntry }) {
  return (
    <span className="space-y-0.5">
      {entry.invitedBy && (
        <span className="block" title={entry.invitedBy}>
          Invited by {entry.invitedBy}
        </span>
      )}
      {entry.expiresAt && (
        <span
          className={cn(
            "block",
            entry.status === "expired" ? "text-destructive" : ""
          )}
          title={formatDate(entry.expiresAt)}
        >
          {entry.status === "expired"
            ? `Expired ${formatDate(entry.expiresAt)}`
            : formatExpiry(entry.expiresAt)}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mobile card list
// ---------------------------------------------------------------------------

function MobileCardList({
  entries,
  currentUserId,
}: {
  entries: UserEntry[];
  currentUserId: string;
}) {
  return (
    <ul
      className="space-y-3 sm:hidden"
      aria-label="Users list"
      aria-live="polite"
    >
      {entries.map((entry) => (
        <li key={entry.id}>
          <UserCard entry={entry} currentUserId={currentUserId} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="navigation"
      aria-label="Pagination"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
        const isNearCurrent = Math.abs(page - currentPage) <= 1;
        const isEdge = page === 1 || page === totalPages;

        if (!isNearCurrent && !isEdge) {
          // Show ellipsis only at the boundary positions
          if (page === 2 || page === totalPages - 1) {
            return (
              <span key={page} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            );
          }
          return null;
        }

        return (
          <Button
            key={page}
            variant={page === currentPage ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
            className="min-w-[2.25rem]"
          >
            {page}
          </Button>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
