"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { UserEntry, UserEntryRole, UserStatus } from "@/lib/api/users";

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const ROLE_BADGE_STYLES: Record<UserEntryRole, string> = {
  Owner: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Admin:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  User: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_BADGE_STYLES: Record<UserStatus, string> = {
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  invited:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  invited: "Invited",
  expired: "Expired",
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

export function formatExpiry(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Expired";

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Expires soon";
  if (diffDays === 0) return `Expires in ${diffHours}h`;
  if (diffDays === 1) return "Expires tomorrow";
  return `Expires in ${diffDays}d`;
}

// ---------------------------------------------------------------------------
// Avatar initials
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Shared badge/avatar sub-components (re-exported for use in UserList table)
// ---------------------------------------------------------------------------

export function RoleBadge({ role }: { role: UserEntryRole }) {
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

export function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_BADGE_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Avatar({
  entry,
  size = "md",
}: {
  entry: UserEntry;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  if (entry.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.avatarUrl}
        alt={entry.name}
        className={cn("rounded-full object-cover shrink-0", sizeClasses[size])}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground shrink-0",
        sizeClasses[size]
      )}
      aria-hidden="true"
    >
      {getInitials(entry.name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserCard
// ---------------------------------------------------------------------------

export interface UserCardProps {
  entry: UserEntry;
  /** The authenticated user's ID — used to render the "(You)" indicator. */
  currentUserId?: string;
}

/**
 * Compact card showing a single user or invite entry.
 * Used in the mobile view of UserList.
 */
export function UserCard({ entry, currentUserId }: UserCardProps) {
  const isCurrentUser =
    entry.type === "user" && !!currentUserId && entry.userId === currentUserId;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header: avatar + name/email */}
          <div className="flex items-start gap-3">
            <Avatar entry={entry} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-medium" title={entry.name}>
                  {entry.name}
                </p>
                {isCurrentUser && (
                  <span className="text-xs text-muted-foreground">(You)</span>
                )}
              </div>
              {entry.type === "user" && entry.name !== entry.email && (
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={entry.email}
                >
                  {entry.email}
                </p>
              )}
              {entry.jobTitle && (
                <p className="truncate text-xs text-muted-foreground mt-0.5">
                  {entry.jobTitle}
                  {entry.department ? ` · ${entry.department}` : ""}
                </p>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <RoleBadge role={entry.role} />
            <StatusBadge status={entry.status} />
          </div>

          {/* Invite-specific metadata */}
          {entry.type === "invite" && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {entry.invitedBy && (
                <>
                  <dt className="text-muted-foreground">Invited by</dt>
                  <dd className="truncate font-medium" title={entry.invitedBy}>
                    {entry.invitedBy}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Sent</dt>
              <dd>{formatDate(entry.createdAt)}</dd>
              {entry.expiresAt && (
                <>
                  <dt className="text-muted-foreground">Expiry</dt>
                  <dd title={formatDate(entry.expiresAt)}>
                    {entry.status === "expired"
                      ? `Expired ${formatDate(entry.expiresAt)}`
                      : formatExpiry(entry.expiresAt)}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
