'use client';

import { cn } from '@/lib/utils';
import { type RegisteredModule, type Role, ROLES } from '@/lib/modules/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PermissionToggle } from './PermissionToggle';
import { getPermissionChangeWarning } from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// Role metadata for scannable visual badges
// ---------------------------------------------------------------------------

const ROLE_META: Record<Role, { description: string; badgeClass: string }> = {
  Owner: {
    description: 'Full administrative control',
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  Admin: {
    description: 'Can manage team and settings',
    badgeClass:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  User: {
    description: 'Standard member access',
    badgeClass:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
};

// ---------------------------------------------------------------------------
// ModuleSection
// ---------------------------------------------------------------------------

export interface ModuleSectionProps {
  module: RegisteredModule;
  /**
   * Called when any permission toggle changes.
   * Receives the moduleId, role, field, and new value.
   */
  onPermissionChange?: (
    moduleId: string,
    role: Role,
    field: 'featureAccess' | 'settingsAccess',
    value: boolean
  ) => void;
  /** When true, all toggles are non-interactive */
  readOnly?: boolean;
  className?: string;
}

/**
 * Groups all role-level permission toggles for a single module in a Card.
 * Each row displays a role badge alongside the two-layer PermissionToggle,
 * providing an ADHD-friendly scannable layout.
 */
export function ModuleSection({
  module,
  onPermissionChange,
  readOnly = false,
  className,
}: ModuleSectionProps) {
  function handleChange(
    role: Role,
    field: 'featureAccess' | 'settingsAccess',
    value: boolean
  ) {
    if (readOnly || !onPermissionChange) return;
    onPermissionChange(module.id, role, field, value);
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {module.displayName}
        </CardTitle>
        <CardDescription>
          {module.hasSettings
            ? 'Manage feature and settings access per role'
            : 'Manage feature access per role'}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <div role="region" aria-label={`${module.displayName} permissions`}>
          {ROLES.map((role, index) => {
            const perms = module.permissions[role] ?? {
              featureAccess: false,
              settingsAccess: false,
            };
            const meta = ROLE_META[role];

            return (
              <div
                key={role}
                aria-label={`${role} role permissions`}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4',
                  index < ROLES.length - 1 && 'border-b border-border/60'
                )}
              >
                {/* Role badge with description */}
                <div className="w-16 shrink-0 pt-0.5 sm:w-20">
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                      meta.badgeClass
                    )}
                  >
                    {role}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                    {meta.description}
                  </p>
                </div>

                {/* Two-layer Feature + Settings toggle */}
                <div className="flex-1 min-w-0">
                  <PermissionToggle
                    featureEnabled={perms.featureAccess}
                    settingsEnabled={perms.settingsAccess}
                    hasSettings={module.hasSettings}
                    disabled={readOnly}
                    onFeatureChange={(value) =>
                      handleChange(role, 'featureAccess', value)
                    }
                    onSettingsChange={(value) =>
                      handleChange(role, 'settingsAccess', value)
                    }
                    featureWarningInfo={getPermissionChangeWarning({
                      role,
                      field: 'featureAccess',
                      currentValue: perms.featureAccess,
                      newValue: !perms.featureAccess,
                      moduleDisplayName: module.displayName,
                    })}
                    settingsWarningInfo={getPermissionChangeWarning({
                      role,
                      field: 'settingsAccess',
                      currentValue: perms.settingsAccess,
                      newValue: !perms.settingsAccess,
                      moduleDisplayName: module.displayName,
                    })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
