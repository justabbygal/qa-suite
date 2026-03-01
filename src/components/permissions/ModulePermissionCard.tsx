'use client';

import * as React from 'react';
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
import { ConfirmationDialog } from './ConfirmationDialog';
import {
  getPermissionChangeWarning,
  getBulkDisableWarning,
} from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// Role metadata — ADHD-friendly colored badges for fast visual scanning
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
// Props
// ---------------------------------------------------------------------------

export interface ModulePermissionCardProps {
  module: RegisteredModule;
  /**
   * Called when any individual permission toggle is changed.
   * The caller is responsible for persisting the change.
   */
  onPermissionChange?: (
    moduleId: string,
    role: Role,
    field: 'featureAccess' | 'settingsAccess',
    value: boolean
  ) => void;
  /**
   * Called when the bulk enable/disable toggle is confirmed.
   * `enabled = true`  → enable feature access for all roles.
   * `enabled = false` → disable feature access for all roles.
   */
  onBulkChange?: (moduleId: string, enabled: boolean) => void;
  /** When true, all toggles are non-interactive (read-only view). */
  readOnly?: boolean;
  /**
   * Subset of roles whose toggles are interactive.
   * Roles outside this list render as read-only so viewers can see (but
   * not change) their permissions. When omitted, all roles are editable.
   */
  editableRoles?: Role[];
  /**
   * When true, all toggles are disabled and a "Saving…" indicator is shown.
   * Use while an API request is in-flight to prevent double-submissions.
   */
  pending?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// ModulePermissionCard
// ---------------------------------------------------------------------------

/**
 * A self-contained card that displays all permission toggles for a single
 * module grouped by role, with a bulk enable/disable control in the header.
 *
 * Layout:
 *  ┌─────────────────────────────────────────┐
 *  │  Module name          ●●● [bulk toggle] │
 *  │  Description              All enabled   │
 *  ├─────────────────────────────────────────┤
 *  │  Owner  │  Feature Access  ○  Settings  │
 *  │  Admin  │  Feature Access  ○  Settings  │
 *  │  User   │  Feature Access  ○  Settings  │
 *  └─────────────────────────────────────────┘
 */
export function ModulePermissionCard({
  module,
  onPermissionChange,
  onBulkChange,
  readOnly = false,
  editableRoles,
  pending = false,
  className,
}: ModulePermissionCardProps) {
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);

  // Derive bulk toggle state from per-role featureAccess values
  const enabledRoles = ROLES.filter((r) => module.permissions[r]?.featureAccess);
  const enabledCount = enabledRoles.length;
  const allEnabled = enabledCount === ROLES.length;
  const noneEnabled = enabledCount === 0;
  const isMixed = !allEnabled && !noneEnabled;

  const bulkWarningInfo =
    !noneEnabled
      ? getBulkDisableWarning({
          moduleDisplayName: module.displayName,
          affectedRoles: enabledRoles,
        })
      : null;

  const bulkStatusText = allEnabled
    ? 'All roles enabled'
    : noneEnabled
    ? 'All roles disabled'
    : `${enabledCount} of ${ROLES.length} roles`;

  const isBulkDisabled = readOnly || pending || !onBulkChange;

  function handleBulkToggle() {
    if (isBulkDisabled) return;
    if (noneEnabled) {
      // Enabling all — non-destructive, no confirmation needed
      onBulkChange!(module.id, true);
      return;
    }
    if (bulkWarningInfo) {
      setBulkDialogOpen(true);
    } else {
      onBulkChange!(module.id, false);
    }
  }

  function handlePermissionChange(
    role: Role,
    field: 'featureAccess' | 'settingsAccess',
    value: boolean
  ) {
    if (readOnly || !onPermissionChange) return;
    if (editableRoles !== undefined && !editableRoles.includes(role)) return;
    onPermissionChange(module.id, role, field, value);
  }

  return (
    <Card
      className={cn('overflow-hidden', className)}
      aria-label={`${module.displayName} module permissions`}
    >
      {/* ── Card header: module info + bulk toggle ───────────────────── */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Left: module identity */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-semibold">
                {module.displayName}
              </CardTitle>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                {module.module}
              </span>
              {pending && (
                <span
                  className="animate-pulse text-[10px] text-muted-foreground"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  Saving…
                </span>
              )}
            </div>
            <CardDescription className="mt-1">
              {module.hasSettings
                ? 'Manage feature and settings access per role'
                : 'Manage feature access per role'}
            </CardDescription>
          </div>

          {/* Right: bulk toggle — only when an onBulkChange handler is provided */}
          {onBulkChange && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              {/* Per-role dot indicators — at-a-glance access status */}
              <div
                className="flex items-center gap-1"
                aria-hidden="true"
                title={bulkStatusText}
              >
                {ROLES.map((role) => {
                  const isEnabled =
                    module.permissions[role]?.featureAccess ?? false;
                  return (
                    <span
                      key={role}
                      className={cn(
                        'inline-block h-1.5 w-4 rounded-full transition-colors',
                        isEnabled ? 'bg-primary' : 'bg-input'
                      )}
                    />
                  );
                })}
              </div>

              {/* Bulk switch button */}
              <button
                type="button"
                role="switch"
                aria-checked={!noneEnabled}
                aria-label={
                  noneEnabled
                    ? `Enable all roles for ${module.displayName}`
                    : `Disable all roles for ${module.displayName}`
                }
                disabled={isBulkDisabled}
                onClick={handleBulkToggle}
                className={cn(
                  'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isBulkDisabled && 'cursor-not-allowed opacity-40'
                )}
              >
                {/* Visual toggle track — three visual states: all-on, mixed, all-off */}
                <span
                  className={cn(
                    'pointer-events-none relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    allEnabled
                      ? 'bg-primary'
                      : isMixed
                      ? 'bg-primary/50'
                      : 'bg-input'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                      allEnabled
                        ? 'translate-x-6'
                        : isMixed
                        ? 'translate-x-3'
                        : 'translate-x-1'
                    )}
                  />
                </span>
              </button>

              {/* Status text + mixed badge */}
              <div className="flex items-center gap-1">
                {isMixed && (
                  <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Mixed
                  </span>
                )}
                <span
                  className={cn(
                    'text-[10px] transition-colors',
                    allEnabled ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {bulkStatusText}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      {/* ── Permission rows — one per role ───────────────────────────── */}
      <CardContent className="p-0">
        <div
          role="group"
          aria-label={`${module.displayName} role permissions`}
        >
          {ROLES.map((role, index) => {
            const perms = module.permissions[role] ?? {
              featureAccess: false,
              settingsAccess: false,
            };
            const meta = ROLE_META[role];
            const isRoleReadOnly =
              readOnly ||
              (editableRoles !== undefined && !editableRoles.includes(role));

            return (
              <div
                key={role}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4',
                  index < ROLES.length - 1 && 'border-b border-border/60'
                )}
                aria-label={`${role} role permissions`}
              >
                {/* Role badge + description */}
                <div className="w-16 shrink-0 pt-0.5 sm:w-20">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                      meta.badgeClass,
                      isRoleReadOnly && 'opacity-60'
                    )}
                  >
                    {role}
                  </span>
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                    {meta.description}
                  </p>
                </div>

                {/* Dual-layer permission toggle (Feature + optional Settings) */}
                <div className="min-w-0 flex-1">
                  <PermissionToggle
                    featureEnabled={perms.featureAccess}
                    settingsEnabled={perms.settingsAccess}
                    hasSettings={module.hasSettings}
                    disabled={isRoleReadOnly || pending}
                    pending={pending}
                    onFeatureChange={(value) =>
                      handlePermissionChange(role, 'featureAccess', value)
                    }
                    onSettingsChange={(value) =>
                      handlePermissionChange(role, 'settingsAccess', value)
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

      {/* Bulk disable confirmation dialog */}
      {bulkWarningInfo && (
        <ConfirmationDialog
          open={bulkDialogOpen}
          warning={bulkWarningInfo}
          onConfirm={() => {
            setBulkDialogOpen(false);
            onBulkChange?.(module.id, false);
          }}
          onCancel={() => setBulkDialogOpen(false)}
        />
      )}
    </Card>
  );
}
