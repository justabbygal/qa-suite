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
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          enabled ? 'bg-primary' : 'bg-input',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          className={cn(
            'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-1'
          )}
        />
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
