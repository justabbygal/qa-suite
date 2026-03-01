'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Settings, Users } from 'lucide-react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Main dashboard page — the landing page after signup/login.
 *
 * Reads user info from localStorage (dev pattern — replace with Better Auth
 * session context once auth is integrated).
 */
export default function DashboardPage() {
  const [userName, setUserName] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Replace with Better Auth session once auth is integrated.
    const storedRole = localStorage.getItem('dev_user_role');
    const storedOrgId = localStorage.getItem('dev_organization_id');
    setOrganizationId(storedOrgId);

    // Use role as a stand-in greeting until we have a real profile context.
    if (storedRole) {
      setUserName(storedRole);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            {userName && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Welcome back, {userName}
              </p>
            )}
          </div>
          <span className="text-sm font-medium text-muted-foreground">QA Suite</span>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Quick nav cards */}
          <section aria-labelledby="nav-heading">
            <h2 id="nav-heading" className="mb-4 text-lg font-semibold">
              Quick navigation
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NavCard
                href="/dashboard/team/invites"
                icon={<Users className="h-5 w-5" aria-hidden="true" />}
                title="Team"
                description="Manage invitations and team members."
              />
              <NavCard
                href="/settings"
                icon={<Settings className="h-5 w-5" aria-hidden="true" />}
                title="Settings"
                description="Configure permissions and preferences."
              />
              <NavCard
                href="/settings/permissions"
                icon={<LayoutDashboard className="h-5 w-5" aria-hidden="true" />}
                title="Permissions"
                description="Control module access by role."
              />
            </div>
          </section>

          {/* Organization info (dev) */}
          {organizationId && (
            <section aria-labelledby="org-heading">
              <h2 id="org-heading" className="mb-2 text-lg font-semibold">
                Organization
              </h2>
              <p className="text-sm text-muted-foreground">
                Organization ID:{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                  {organizationId}
                </code>
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavCard
// ---------------------------------------------------------------------------

interface NavCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function NavCard({ href, icon, title, description }: NavCardProps) {
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card className="transition-colors group-hover:bg-muted/50 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <div className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-0.5 text-sm">{description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
