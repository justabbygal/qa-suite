"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole, canAccessPermissions } from "@/hooks/useUserRole";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  ariaLabel: string;
  exactMatch?: boolean;
}

const baseNavItems: NavItem[] = [
  {
    href: "/settings",
    label: "General",
    icon: Settings,
    ariaLabel: "General settings",
    exactMatch: true,
  },
];

const permissionsNavItem: NavItem = {
  href: "/settings/permissions",
  label: "Permissions",
  icon: Shield,
  ariaLabel: "Permission management",
};

export default function SettingsNavigation() {
  const pathname = usePathname();
  const userRole = useUserRole();
  const showPermissions = canAccessPermissions(userRole);

  const navItems = showPermissions
    ? [...baseNavItems, permissionsNavItem]
    : baseNavItems;

  return (
    <nav aria-label="Settings navigation">
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
