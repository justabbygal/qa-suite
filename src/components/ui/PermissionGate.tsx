"use client";

import { useEffect, useMemo, useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { resolvePermission, shouldShowElement } from "@/lib/permissions/service";
import type { PermissionOverride } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PermissionGateProps {
  /** Module identifier (kebab-case) to check permission against. */
  moduleId: string;
  /** When true, also requires settings access (canConfigure). Defaults to false. */
  requireSettings?: boolean;
  /** Org-level permission overrides. Takes precedence over module registry defaults. */
  overrides?: PermissionOverride[];
  /**
   * Rendered while the user's role is being resolved from the session.
   * Defaults to null (nothing shown during hydration).
   */
  loading?: React.ReactNode;
  /**
   * Rendered when the user lacks the required permission.
   * Defaults to null (element is simply hidden).
   */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// PermissionGate
// ---------------------------------------------------------------------------

/**
 * Conditionally renders children based on the current user's permission for
 * a given module. Hides content during hydration to prevent permission flashes.
 *
 * @example
 * // Hide a section the user can't access
 * <PermissionGate moduleId="integrations">
 *   <IntegrationsPanel />
 * </PermissionGate>
 *
 * @example
 * // Show a fallback message instead of hiding
 * <PermissionGate moduleId="integrations" fallback={<p>Upgrade to access integrations.</p>}>
 *   <IntegrationsPanel />
 * </PermissionGate>
 *
 * @example
 * // Require settings access
 * <PermissionGate moduleId="integrations" requireSettings>
 *   <IntegrationsSettings />
 * </PermissionGate>
 */
export function PermissionGate({
  moduleId,
  requireSettings = false,
  overrides = [],
  loading = null,
  fallback = null,
  children,
}: PermissionGateProps) {
  // Track whether the role has been resolved from localStorage/session.
  // Without this, the default "user" role causes a permission flash for
  // owners/admins: elements briefly hidden then revealed after hydration.
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

  if (!isHydrated) return <>{loading}</>;
  if (!shouldShowElement(permission, requireSettings)) return <>{fallback}</>;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// withPermission HOC
// ---------------------------------------------------------------------------

/** Options accepted by the withPermission HOC. */
export type WithPermissionOptions = Omit<PermissionGateProps, "children">;

/**
 * Higher-order component that wraps a page section or component with
 * permission-based access control.
 *
 * @example
 * const ProtectedSettings = withPermission(SettingsPage, {
 *   moduleId: "integrations",
 *   requireSettings: true,
 *   fallback: <AccessDenied />,
 * });
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  options: WithPermissionOptions
): React.ComponentType<P> {
  function PermissionProtected(props: P) {
    return (
      <PermissionGate {...options}>
        <Component {...props} />
      </PermissionGate>
    );
  }

  PermissionProtected.displayName = `withPermission(${
    Component.displayName ?? Component.name ?? "Component"
  })`;

  return PermissionProtected;
}
