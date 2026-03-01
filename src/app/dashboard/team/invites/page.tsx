"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ShieldOff } from "lucide-react";
import { useUserRole, canAccessPermissions } from "@/hooks/useUserRole";
import { useInvites } from "@/hooks/useInvites";
import InviteForm from "@/components/InviteForm";
import InviteList from "@/components/InviteList";

/**
 * Team Invitations page — accessible by Owners and Admins only.
 *
 * Organisation ID is sourced from localStorage for development.
 * TODO: Replace with Better Auth organization ID once auth is integrated.
 */
export default function TeamInvitesPage() {
  const userRole = useUserRole();
  const hasAccess = canAccessPermissions(userRole);

  // TODO: Replace with Better Auth organization context once auth is integrated.
  const [organizationId, setOrganizationId] = useState("");

  useEffect(() => {
    const orgId =
      localStorage.getItem("dev_organization_id") ?? "dev-org-id";
    setOrganizationId(orgId);
  }, []);

  const {
    filteredInvites,
    isLoading,
    error,
    filters,
    setFilters,
    createInvite,
    resendInvite,
    cancelInvite,
    refetch,
  } = useInvites(organizationId);

  // --- Access denied ---
  if (!hasAccess) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="border-b px-6 py-4">
          <Breadcrumb />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Team Invitations
          </h1>
        </header>
        <main
          className="flex flex-1 items-center justify-center p-6"
          id="invites-content"
          tabIndex={-1}
        >
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4">
              <ShieldOff
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Access restricted</h2>
              <p className="text-sm text-muted-foreground">
                Only Owners and Admins can manage team invitations.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- Authorised view ---
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-4">
        <Breadcrumb />
        <div className="mt-1 flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            Team Invitations
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite team members and manage pending invitations. Invites expire
          after 7 days.
        </p>
      </header>

      <main
        className="flex-1 p-6"
        id="invites-content"
        tabIndex={-1}
      >
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Invite creation form */}
          <InviteForm
            onSubmit={createInvite}
            currentUserRole={userRole as "owner" | "admin"}
          />

          {/* Invite list */}
          <section aria-labelledby="invite-list-heading">
            <h2
              id="invite-list-heading"
              className="mb-4 text-lg font-semibold"
            >
              Sent Invitations
            </h2>
            <InviteList
              invites={filteredInvites}
              isLoading={isLoading}
              error={error}
              filters={filters}
              onFiltersChange={setFilters}
              onResend={resendInvite}
              onCancel={cancelInvite}
              onRetry={refetch}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        href="/"
        className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
      >
        Home
      </Link>
      <ChevronRight
        className="h-3.5 w-3.5 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="text-muted-foreground">Team</span>
      <ChevronRight
        className="h-3.5 w-3.5 text-muted-foreground"
        aria-hidden="true"
      />
      <span aria-current="page" className="font-medium">
        Invitations
      </span>
    </nav>
  );
}
