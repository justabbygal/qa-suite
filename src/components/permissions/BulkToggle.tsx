'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { type RegisteredModule, ROLES } from '@/lib/modules/types';
import { ConfirmationDialog } from './ConfirmationDialog';
import { getBulkDisableWarning } from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// BulkToggle
// ---------------------------------------------------------------------------

export interface BulkToggleProps {
  module: RegisteredModule;
  /** When true, the toggle is non-interactive */
  disabled?: boolean;
  /**
   * Called when the user confirms a bulk change.
   * `enabled = true`  → enable all roles' feature access.
   * `enabled = false` → disable all roles' feature access.
   */
  onBulkChange: (moduleId: string, enabled: boolean) => void;
  className?: string;
}

/**
 * Module-level toggle that enables or disables feature access for ALL roles
 * at once. Clicking "off" when any role is enabled shows a bulk-disable
 * confirmation before applying. Visual state:
 *
 * - All enabled  → toggle fully ON
 * - None enabled → toggle fully OFF
 * - Mixed        → toggle half-way, amber "Mixed" badge
 */
export function BulkToggle({
  module,
  disabled = false,
  onBulkChange,
  className,
}: BulkToggleProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Derive per-role enabled state
  const enabledRoles = ROLES.filter(
    (r) => module.permissions[r]?.featureAccess
  );
  const enabledCount = enabledRoles.length;
  const totalCount = ROLES.length;
  const allEnabled = enabledCount === totalCount;
  const noneEnabled = enabledCount === 0;
  const isMixed = !allEnabled && !noneEnabled;

  // Destructive when disabling roles that currently have access
  const warningInfo = !noneEnabled
    ? getBulkDisableWarning({
        moduleDisplayName: module.displayName,
        affectedRoles: enabledRoles,
      })
    : null;

  function handleClick() {
    if (disabled) return;
    if (noneEnabled) {
      // Enabling all — not destructive, no confirmation needed
      onBulkChange(module.id, true);
      return;
    }
    if (warningInfo) {
      setDialogOpen(true);
    } else {
      onBulkChange(module.id, false);
    }
  }

  const actionLabel = noneEnabled
    ? `Enable all roles for ${module.displayName}`
    : `Disable all roles for ${module.displayName}`;

  const statusText = allEnabled
    ? 'All roles enabled'
    : noneEnabled
    ? 'All roles disabled'
    : `${enabledCount} of ${totalCount} roles enabled`;

  return (
    <div
      className={cn('flex items-center justify-between gap-4', className)}
      aria-label={`Bulk permissions for ${module.displayName}`}
    >
      {/* Module name and status */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{module.displayName}</span>
          {isMixed && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Mixed
            </span>
          )}
        </div>
        <p
          className={cn(
            'text-xs mt-0.5 transition-colors',
            allEnabled ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {statusText}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Per-role dot indicators — at-a-glance status */}
        <div
          className="flex items-center gap-1"
          aria-hidden="true"
          title={statusText}
        >
          {ROLES.map((role) => {
            const isEnabled = module.permissions[role]?.featureAccess ?? false;
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

        {/* Bulk toggle button — three visual states: all-on, mixed, all-off */}
        {/*
         * Outer button provides a min 44×44 px touch target (WCAG 2.5.5)
         * while keeping the visual track at its original compact size.
         */}
        <button
          type="button"
          role="switch"
          aria-checked={!noneEnabled}
          aria-label={actionLabel}
          disabled={disabled}
          onClick={handleClick}
          className={cn(
            'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-40'
          )}
        >
          {/* Visual toggle track */}
          <span
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors pointer-events-none',
              allEnabled
                ? 'bg-primary'
                : isMixed
                ? 'bg-primary/50'
                : 'bg-input'
            )}
          >
            {/* Toggle thumb */}
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
      </div>

      {warningInfo && (
        <ConfirmationDialog
          open={dialogOpen}
          warning={warningInfo}
          onConfirm={() => {
            setDialogOpen(false);
            onBulkChange(module.id, false);
          }}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
