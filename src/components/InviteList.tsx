"use client";

import { useState } from "react";
import {
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  RotateCcw,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Invite, InviteRole, InviteStatus } from "@/types";
import type { InviteFilters, InviteActionResult } from "@/hooks/useInvites";
import { getEffectiveStatus } from "@/hooks/useInvites";
import { checkCanManageInvite } from "@/lib/services/admin-restrictions";
import type { Role } from "@/lib/permissions/types";

// --- Style maps ---

const ROLE_BADGE_STYLES: Record<InviteRole, string> = {
  Owner:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Admin:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  User: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_BADGE_STYLES: Record<InviteStatus, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  cancelled:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABELS: Record<InviteStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  cancelled: "Cancelled",
};

// --- Filter tab config ---

const STATUS_FILTER_TABS: { value: InviteStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

// --- Sort config ---

const SORT_OPTIONS: {
  value: `${InviteFilters["sortBy"]}-${InviteFilters["sortOrder"]}`;
  label: string;
}[] = [
  { value: "createdAt-desc", label: "Newest first" },
  { value: "createdAt-asc", label: "Oldest first" },
  { value: "expiresAt-asc", label: "Expiring soon" },
  { value: "expiresAt-desc", label: "Expiring latest" },
];

// --- Date helpers ---

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatExpiry(invite: Invite): string {
  const status = getEffectiveStatus(invite);
  if (status !== "pending") return formatDate(invite.expiresAt);

  const diffMs = new Date(invite.expiresAt).getTime() - Date.now();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Expires soon";
  if (diffDays === 0) return `Expires in ${diffHours}h`;
  if (diffDays === 1) return "Expires tomorrow";
  return `Expires in ${diffDays}d`;
}

// --- Badge sub-components ---

function RoleBadge({ role }: { role: InviteRole }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        ROLE_BADGE_STYLES[role]
      )}
    >
      {role}
    </span>
  );
}

function StatusBadge({ invite }: { invite: Invite }) {
  const effectiveStatus = getEffectiveStatus(invite);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_BADGE_STYLES[effectiveStatus]
      )}
    >
      {STATUS_LABELS[effectiveStatus]}
    </span>
  );
}

// --- Props ---

interface InviteListProps {
  invites: Invite[];
  isLoading: boolean;
  error: string | null;
  filters: InviteFilters;
  onFiltersChange: (filters: InviteFilters) => void;
  onResend: (inviteId: string) => Promise<InviteActionResult>;
  onCancel: (inviteId: string) => Promise<InviteActionResult>;
  onRetry: () => void;
  /** Current user's role — used to enforce admin restrictions on invite actions. */
  currentUserRole?: "owner" | "admin";
}

// --- Main component ---

export default function InviteList({
  invites,
  isLoading,
  error,
  filters,
  onFiltersChange,
  onResend,
  onCancel,
  onRetry,
  currentUserRole,
}: InviteListProps) {
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(
    new Set()
  );
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  async function handleAction(
    inviteId: string,
    action: (id: string) => Promise<InviteActionResult>
  ) {
    setActionInProgress((prev) => new Set([...prev, inviteId]));
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[inviteId];
      return next;
    });

    const result = await action(inviteId);

    setActionInProgress((prev) => {
      const next = new Set(prev);
      next.delete(inviteId);
      return next;
    });

    if (!result.success && result.error) {
      setActionErrors((prev) => ({ ...prev, [inviteId]: result.error! }));
    }
  }

  /** Returns true when the current user is permitted to act on an invite. */
  function canActOnInvite(inviteRole: InviteRole): boolean {
    if (!currentUserRole) return true;
    const actorRole = currentUserRole as Role;
    const targetRole = inviteRole.toLowerCase() as Role;
    return checkCanManageInvite(actorRole, targetRole).allowed;
  }

  function handleSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const [sortBy, sortOrder] = e.target.value.split("-") as [
      InviteFilters["sortBy"],
      InviteFilters["sortOrder"],
    ];
    onFiltersChange({ ...filters, sortBy, sortOrder });
  }

  const sortValue = `${filters.sortBy}-${filters.sortOrder}` as `${InviteFilters["sortBy"]}-${InviteFilters["sortOrder"]}`;

  // --- Render states ---

  if (error) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle
              className="h-8 w-8 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">Failed to load invites</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter & sort bar */}
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        role="group"
        aria-label="Invite filters and sorting"
      >
        {/* Status filter tabs */}
        <div
          role="tablist"
          aria-label="Filter invites by status"
          className="flex flex-wrap gap-1"
        >
          {STATUS_FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={filters.status === tab.value}
              onClick={() =>
                onFiltersChange({ ...filters, status: tab.value })
              }
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                filters.status === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort control */}
        <div className="flex items-center gap-2">
          <label htmlFor="invite-sort" className="shrink-0 text-sm font-medium">
            Sort
          </label>
          <select
            id="invite-sort"
            value={sortValue}
            onChange={handleSortChange}
            aria-label="Sort invites"
            className={cn(
              "h-9 rounded-md border border-input bg-background px-3 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List body */}
      {isLoading ? (
        <Card>
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2
                className="h-5 w-5 animate-spin"
                aria-hidden="true"
              />
              <span>Loading invites…</span>
            </div>
          </CardContent>
        </Card>
      ) : invites.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <p className="text-center text-sm text-muted-foreground">
              {filters.status === "all"
                ? "No invitations sent yet. Use the form above to invite team members."
                : `No ${filters.status} invitations found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border sm:block">
            <table
              className="w-full text-sm"
              aria-label="Invitations list"
              aria-live="polite"
              aria-busy={isLoading}
            >
              <thead>
                <tr className="border-b bg-muted/50">
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
                    Invited by
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Date sent
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Expiry
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invites.map((invite) => {
                  const isPending =
                    getEffectiveStatus(invite) === "pending";
                  const isActing = actionInProgress.has(invite.id);
                  const actionError = actionErrors[invite.id];
                  const canAct = canActOnInvite(invite.role);

                  return (
                    <tr
                      key={invite.id}
                      className="bg-card hover:bg-muted/30 transition-colors"
                    >
                      <td className="max-w-[200px] truncate px-4 py-3 font-medium">
                        <span title={invite.email}>{invite.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={invite.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge invite={invite} />
                      </td>
                      <td
                        className="max-w-[160px] truncate px-4 py-3 text-muted-foreground"
                        title={invite.invitedByEmail}
                      >
                        {invite.invitedByEmail}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(invite.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        <span title={formatDate(invite.expiresAt)}>
                          {formatExpiry(invite)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {actionError && (
                            <span
                              role="alert"
                              className="text-xs text-destructive"
                              title={actionError}
                            >
                              <AlertCircle
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </span>
                          )}
                          {isPending && canAct && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isActing}
                                onClick={() =>
                                  handleAction(invite.id, onResend)
                                }
                                aria-label={`Resend invite to ${invite.email}`}
                              >
                                {isActing ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <RefreshCw
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                <span className="ml-1.5">Resend</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isActing}
                                onClick={() =>
                                  handleAction(invite.id, onCancel)
                                }
                                aria-label={`Cancel invite for ${invite.email}`}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span className="ml-1.5">Cancel</span>
                              </Button>
                            </>
                          )}
                          {isPending && !canAct && (
                            <span
                              className="flex items-center gap-1 text-xs text-muted-foreground"
                              title="Admins cannot manage Admin or Owner invitations"
                              aria-label="Action restricted — Admins cannot manage Admin or Owner invitations"
                            >
                              <Lock
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Restricted
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul
            className="space-y-3 sm:hidden"
            aria-label="Invitations list"
            aria-live="polite"
            aria-busy={isLoading}
          >
            {invites.map((invite) => {
              const isPending = getEffectiveStatus(invite) === "pending";
              const isActing = actionInProgress.has(invite.id);
              const actionError = actionErrors[invite.id];
              const canAct = canActOnInvite(invite.role);

              return (
                <li key={invite.id}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Email */}
                        <p className="truncate font-medium" title={invite.email}>
                          {invite.email}
                        </p>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-2">
                          <RoleBadge role={invite.role} />
                          <StatusBadge invite={invite} />
                        </div>

                        {/* Meta */}
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <dt className="text-muted-foreground">Invited by</dt>
                          <dd
                            className="truncate font-medium"
                            title={invite.invitedByEmail}
                          >
                            {invite.invitedByEmail}
                          </dd>
                          <dt className="text-muted-foreground">Date sent</dt>
                          <dd>{formatDate(invite.createdAt)}</dd>
                          <dt className="text-muted-foreground">Expiry</dt>
                          <dd title={formatDate(invite.expiresAt)}>
                            {formatExpiry(invite)}
                          </dd>
                        </dl>

                        {/* Action error */}
                        {actionError && (
                          <p
                            role="alert"
                            className="flex items-center gap-1.5 text-xs text-destructive"
                          >
                            <AlertCircle
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            {actionError}
                          </p>
                        )}

                        {/* Actions */}
                        {isPending && canAct && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isActing}
                              onClick={() =>
                                handleAction(invite.id, onResend)
                              }
                              aria-label={`Resend invite to ${invite.email}`}
                              className="flex-1"
                            >
                              {isActing ? (
                                <Loader2
                                  className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <RefreshCw
                                  className="mr-1.5 h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              Resend
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isActing}
                              onClick={() =>
                                handleAction(invite.id, onCancel)
                              }
                              aria-label={`Cancel invite for ${invite.email}`}
                              className="flex-1 text-muted-foreground hover:text-destructive"
                            >
                              <X
                                className="mr-1.5 h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Cancel
                            </Button>
                          </div>
                        )}
                        {isPending && !canAct && (
                          <p
                            className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground"
                            aria-label="Action restricted"
                          >
                            <Lock
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            Admins cannot manage Admin or Owner invitations
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Result count */}
      {!isLoading && !error && invites.length > 0 && (
        <p
          aria-live="polite"
          className="text-right text-xs text-muted-foreground"
        >
          Showing {invites.length} invite{invites.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
