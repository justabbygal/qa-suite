'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ConfirmationDialog } from './ConfirmationDialog';
import { isDestructiveChange } from '@/lib/utils/permission-warnings';
import type { WarningInfo } from '@/lib/utils/permission-warnings';

export interface PermissionToggleProps {
  label: string;
  enabled: boolean;
  disabled?: boolean;
  /** When true, renders a subtle opacity pulse while a save is in-flight. */
  pending?: boolean;
  onChange: (enabled: boolean) => void;
  /**
   * When provided and the requested change is destructive (disabling an
   * enabled permission), a confirmation dialog is shown before `onChange`
   * is called.  Pass `null` to skip the dialog even for disabling actions.
   */
  warningInfo?: WarningInfo | null;
}

export function PermissionToggle({
  label,
  enabled,
  disabled = false,
  pending = false,
  onChange,
  warningInfo,
}: PermissionToggleProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  function handleClick() {
    const newValue = !enabled;

    // Show confirmation only when disabling AND a warningInfo is supplied.
    if (isDestructiveChange(enabled, newValue) && warningInfo) {
      setDialogOpen(true);
      return;
    }

    onChange(newValue);
  }

  function handleConfirm() {
    setDialogOpen(false);
    onChange(false);
  }

  function handleCancel() {
    setDialogOpen(false);
    // No state change — toggle stays at current value.
  }

  return (
    <>
      {/*
       * The outer button provides a minimum 44×44 px touch target (WCAG 2.5.5)
       * while keeping the visual toggle track at its original compact size.
       */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50',
          pending && 'opacity-60'
        )}
      >
        {/* Visual toggle track */}
        <span
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors pointer-events-none',
            enabled ? 'bg-primary' : 'bg-input'
          )}
        >
          {/* Toggle thumb */}
          <span
            className={cn(
              'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-1'
            )}
          />
        </span>
      </button>

      {warningInfo && (
        <ConfirmationDialog
          open={dialogOpen}
          warning={warningInfo}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
