"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Link, { type LinkProps } from "next/link";
import { useUserRole } from "@/hooks/useUserRole";
import { resolvePermission, shouldShowElement } from "@/lib/permissions/service";
import type { PermissionOverride } from "@/lib/permissions/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtectedLinkProps extends LinkProps {
  /** Module identifier (kebab-case) to check permission against. */
  moduleId: string;
  /** When true, also requires settings access (canConfigure). Defaults to false. */
  requireSettings?: boolean;
  /** Org-level permission overrides. Takes precedence over module registry defaults. */
  overrides?: PermissionOverride[];
  className?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// ProtectedLink
// ---------------------------------------------------------------------------

/**
 * A Next.js Link that is hidden entirely when the current user lacks the
 * required permission. Returns null when hidden to preserve clean DOM structure
 * and avoid inaccessible or deceptive links.
 *
 * Also hidden during hydration to prevent the link from appearing momentarily
 * before the user's role has been resolved.
 *
 * Inherits all Next.js Link props (href, prefetch, replace, scroll, etc.).
 *
 * @example
 * <ProtectedLink href="/settings/integrations" moduleId="integrations" requireSettings>
 *   Integration Settings
 * </ProtectedLink>
 *
 * @example
 * // In a nav menu — link simply won't render for unauthorized users
 * <nav>
 *   <ProtectedLink href="/admin" moduleId="user-management">Admin</ProtectedLink>
 *   <Link href="/dashboard">Dashboard</Link>
 * </nav>
 */
const ProtectedLink = React.forwardRef<HTMLAnchorElement, ProtectedLinkProps>(
  (
    {
      moduleId,
      requireSettings = false,
      overrides = [],
      className,
      children,
      ...props
    },
    ref
  ) => {
    const [isHydrated, setIsHydrated] = useState(false);
    const role = useUserRole();

    useEffect(() => {
      setIsHydrated(true);
    }, []);

    const permission = useMemo(
      () => resolvePermission(role, moduleId, overrides),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [role, moduleId, overrides]
    );

    // Hide during hydration and when the user lacks permission.
    if (!isHydrated || !shouldShowElement(permission, requireSettings)) {
      return null;
    }

    return (
      <Link ref={ref} className={cn(className)} {...props}>
        {children}
      </Link>
    );
  }
);

ProtectedLink.displayName = "ProtectedLink";

export { ProtectedLink };
