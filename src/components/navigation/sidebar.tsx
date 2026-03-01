"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Users, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole, canAccessPermissions } from "@/hooks/useUserRole";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  ariaLabel: string;
  exactMatch?: boolean;
}

const allNavItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    ariaLabel: "Dashboard home",
    exactMatch: true,
  },
  {
    href: "/dashboard/users",
    label: "Users",
    icon: Users,
    ariaLabel: "User management",
  },
  {
    href: "/dashboard/team",
    label: "Team",
    icon: UserCog,
    ariaLabel: "Team directory",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    ariaLabel: "Settings",
  },
];

/** Nav items visible to all roles (Users excluded). */
const publicNavItems = allNavItems.filter((item) => item.href !== "/dashboard/users");

export default function DashboardSidebar() {
  const pathname = usePathname();
  const userRole = useUserRole();
  const showUsers = canAccessPermissions(userRole);

  const navItems = showUsers ? allNavItems : publicNavItems;

  return (
    <nav aria-label="Main navigation">
      <ul className="space-y-1" role="list">
        {navItems.map((item) => {
          const isActive = item.exactMatch
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-label={item.ariaLabel}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
