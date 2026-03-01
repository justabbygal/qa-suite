"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { resolvePermission, shouldShowElement } from "@/lib/permissions/service";
import type { PermissionOverride } from "@/lib/permissions/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtectedButtonProps extends ButtonProps {
  /** Module identifier (kebab-case) to check permission against. */
  moduleId: string;
  /** When true, also requires settings access (canConfigure). Defaults to false. */
  requireSettings?: boolean;
  /** Org-level permission overrides. Takes precedence over module registry defaults. */
  overrides?: PermissionOverride[];
  /**
   * Tooltip text shown when the button is disabled due to lack of permission.
   * Defaults to a generic "You don't have permission..." message.
   */
  deniedTooltip?: string;
}

// ---------------------------------------------------------------------------
// ProtectedButton
// ---------------------------------------------------------------------------

/**
 * A Button that is automatically disabled when the current user lacks the
 * required permission. The button renders in all cases (for layout stability)
 * but becomes non-interactive and shows a tooltip explaining why.
 *
 * Inherits all shadcn/ui Button props including variant, size, and asChild.
 *
 * @example
 * <ProtectedButton
 *   moduleId="user-management"
 *   onClick={handleInvite}
 *   deniedTooltip="Only admins can invite members."
 * >
 *   Invite Member
 * </ProtectedButton>
 *
 * @example
 * // Require settings access
 * <ProtectedButton moduleId="integrations" requireSettings>
 *   Configure
 * </ProtectedButton>
 */
const ProtectedButton = React.forwardRef<HTMLButtonElement, ProtectedButtonProps>(
  (
    {
      moduleId,
      requireSettings = false,
      overrides = [],
      deniedTooltip,
      disabled,
      className,
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

    // Disable during hydration (role unknown) and when permission is denied.
    const lacksPermission = isHydrated && !shouldShowElement(permission, requireSettings);
    const isDisabled = disabled || lacksPermission || !isHydrated;

    const tooltip = lacksPermission
      ? (deniedTooltip ?? "You don't have permission to perform this action")
      : undefined;

    return (
      <Button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        title={tooltip}
        className={cn(className)}
        {...props}
      />
    );
  }
);

ProtectedButton.displayName = "ProtectedButton";

export { ProtectedButton };
