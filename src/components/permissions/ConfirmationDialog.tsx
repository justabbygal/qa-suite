'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { PermissionWarnings } from './PermissionWarnings';
import type { WarningInfo } from '@/lib/utils/permission-warnings';

export interface ConfirmationDialogProps {
  open: boolean;
  warning: WarningInfo;
  /** Called when the user confirms the destructive change. */
  onConfirm: () => void;
  /** Called when the user cancels — no change should be applied. */
  onCancel: () => void;
}

/**
 * Modal confirmation dialog for destructive permission changes.
 *
 * Keyboard behaviour:
 *  - ESC  → cancel (handled by Radix Dialog)
 *  - Enter → confirm (via keydown listener when dialog is open)
 *  - Tab   → cycle between Cancel and Confirm buttons
 *
 * Focus is placed on the Cancel button by default so that accidental
 * keyboard presses do not trigger the destructive action.
 */
export function ConfirmationDialog({
  open,
  warning,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  // Allow Enter to confirm while the dialog is open.
  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        // Only fire if the active element is not a button (buttons handle their
        // own Enter press natively, avoiding double-invocation).
        if (document.activeElement?.tagName !== 'BUTTON') {
          e.preventDefault();
          onConfirm();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onConfirm]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialogContent aria-describedby="confirmation-description">
        <AlertDialogHeader>
          <AlertDialogTitle>{warning.title}</AlertDialogTitle>
          <AlertDialogDescription id="confirmation-description">
            {warning.description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {warning.impacts.length > 0 && (
          <PermissionWarnings impacts={warning.impacts} />
        )}

        <AlertDialogFooter>
          {/* Cancel is auto-focused: safer default for destructive dialogs */}
          <AlertDialogCancel onClick={onCancel} autoFocus>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove Access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
