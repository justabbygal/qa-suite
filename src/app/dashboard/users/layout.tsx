"use client";

import Link from "next/link";
import { ChevronRight, ShieldOff } from "lucide-react";
import { useUserRole, canAccessPermissions } from "@/hooks/useUserRole";
import DashboardSidebar from "@/components/navigation/sidebar";

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userRole = useUserRole();
  const hasAccess = canAccessPermissions(userRole);

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="border-b px-6 py-4">
          <Breadcrumb />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            User Management
          </h1>
        </header>
        <main
          className="flex flex-1 items-center justify-center p-6"
          id="users-content"
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
                Only Owners and Admins can access user management.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            >
              Return to dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <Breadcrumb />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          User Management
        </h1>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1">
        {/* Sidebar navigation — desktop */}
        <aside
          className="hidden w-56 shrink-0 border-r p-4 sm:block"
          aria-label="Dashboard sections"
        >
          <DashboardSidebar />
        </aside>

        {/* Sidebar navigation — mobile */}
        <div className="border-b p-3 sm:hidden w-full">
          <DashboardSidebar />
        </div>

        {/* Page content */}
        <main className="flex-1 p-6" id="users-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        href="/dashboard"
        className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
      >
        Dashboard
      </Link>
      <ChevronRight
        className="h-3.5 w-3.5 text-muted-foreground"
        aria-hidden="true"
      />
      <span aria-current="page" className="font-medium">
        Users
      </span>
    </nav>
  );
}
