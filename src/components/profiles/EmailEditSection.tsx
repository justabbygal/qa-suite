'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getEmailEditRestrictionReason } from '@/lib/permissions/profilePermissions';
import type { UserRole } from '@/modules/user-management/types/profile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EmailEditSectionProps {
  email: string;
  currentUserRole: UserRole;
  /** Whether the current user is allowed to edit this email field. */
  canEdit: boolean;
  isLoading?: boolean;
  /**
   * Called after the user confirms the email change.
   * Should throw on failure so this component can surface the error.
   */
  onSave: (newEmail: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailEditSection({
  email,
  currentUserRole,
  canEdit,
  isLoading = false,
  onSave,
}: EmailEditSectionProps) {
  const [draftEmail, setDraftEmail] = useState(email);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const restrictionReason = getEmailEditRestrictionReason(currentUserRole);
  const isDirty = draftEmail.trim() !== email;

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleUpdateClick = () => {
    setSaveError(null);

    if (!isDirty) {
      setFieldError('Enter a new email address to update');
      return;
    }
    if (!isValidEmail(draftEmail)) {
      setFieldError('Please enter a valid email address');
      return;
    }

    setFieldError(null);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(draftEmail.trim());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update email');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirm(false);
  };

  // ------------------------------------------------------------------
  // Read-only view (Admin / User)
  // ------------------------------------------------------------------

  if (!canEdit) {
    return (
      <div>
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          readOnly
          disabled
          aria-label="Email address (read-only)"
          className="mt-1 block w-full border border-input rounded-md px-3 py-2 text-sm bg-muted text-muted-foreground cursor-not-allowed"
        />
        {restrictionReason && (
          <p className="mt-1 text-xs text-muted-foreground">{restrictionReason}</p>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Editable view (Owner only)
  // ------------------------------------------------------------------

  return (
    <>
      <div>
        <label htmlFor="profile-email" className="block text-sm font-medium">
          Email
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="profile-email"
            type="email"
            value={draftEmail}
            onChange={(e) => {
              setDraftEmail(e.target.value);
              if (fieldError) setFieldError(null);
              if (saveError) setSaveError(null);
            }}
            disabled={isLoading || isSaving}
            aria-describedby={
              fieldError ? 'email-field-error' : saveError ? 'email-save-error' : undefined
            }
            aria-invalid={!!(fieldError ?? saveError)}
            className="flex-1 border border-input rounded-md px-3 py-2 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUpdateClick}
            disabled={isLoading || isSaving || !isDirty}
            aria-label="Update email address"
          >
            {isSaving ? 'Updating\u2026' : 'Update'}
          </Button>
        </div>

        {fieldError && (
          <p id="email-field-error" role="alert" className="mt-1 text-xs text-destructive">
            {fieldError}
          </p>
        )}
        {saveError && (
          <p id="email-save-error" role="alert" className="mt-1 text-xs text-destructive">
            {saveError}
          </p>
        )}
      </div>

      {/* Confirmation dialog — shown before committing an email change */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change email address?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to change this user&apos;s email from{' '}
              <strong>{email}</strong> to <strong>{draftEmail.trim()}</strong>.
              This action will be recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirm}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm Change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
