"use client";

import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import UserList from "@/components/users/UserList";
import type { Role } from "@/lib/permissions/types";

/**
 * User Management page — accessible to Owners and Admins only.
 *
 * Role guard is handled by the parent layout (UsersLayout). This page
 * renders the user list and summary stats.
 *
 * Organisation ID and user ID are sourced from localStorage for development.
 * TODO: Replace with Better Auth session context once auth is integrated.
 */
export default function UsersPage() {
  const rawRole = useUserRole();
  const currentUserRole = rawRole as Role;

  const [organizationId, setOrganizationId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    // TODO: Replace with Better Auth session once auth is integrated.
    const orgId = localStorage.getItem("dev_organization_id") ?? "dev-org-id";
    const userId = localStorage.getItem("dev_user_id") ?? "dev-user-id";
    setOrganizationId(orgId);
    setCurrentUserId(userId);
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page intro */}
      <div>
        <p className="text-sm text-muted-foreground">
          Manage organization members and pending invitations.
        </p>
      </div>

      {/* User list — renders loading/error/empty states internally */}
      {organizationId ? (
        <UserList
          organizationId={organizationId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      ) : (
        <UserListSkeleton />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton shown while localStorage values are being read on mount
// ---------------------------------------------------------------------------

function UserListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading users">
      {/* Filter bar skeleton */}
      <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      {/* Row skeletons */}
      <div className="overflow-hidden rounded-lg border">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
