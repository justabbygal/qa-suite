'use client';

import React, { useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProfileForm } from '@/modules/user-management/components/ProfileForm';
import { EmailEditSection } from './EmailEditSection';
import type {
  UserProfile,
  UserRole,
  ProfileUpdateData,
} from '@/modules/user-management/types/profile';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProfileEditModalProps {
  /** The profile being edited. Pass null / undefined when the modal is closed. */
  profile: UserProfile | null;
  open: boolean;
  currentUserId: string;
  currentUserRole: UserRole;
  /** True while a save or email-update request is in flight. */
  isSubmitting?: boolean;
  /** Error message to display at the modal level (e.g. from email save). */
  error?: string | null;
  /** Success message to display at the modal level (e.g. after email save). */
  successMessage?: string | null;
  /** Close the modal without saving. */
  onClose: () => void;
  /**
   * Persist profile field changes.
   * Should throw on failure so ProfileForm can display the error inline.
   * On success the modal is closed automatically.
   */
  onSaveProfile: (data: ProfileUpdateData) => Promise<void>;
  /**
   * Persist an email address change.
   * Should throw on failure so EmailEditSection can display the error inline.
   */
  onSaveEmail: (newEmail: string) => Promise<void>;
  /** Whether the current user can edit the email field. */
  canEditEmail: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileEditModal({
  profile,
  open,
  currentUserId,
  currentUserRole,
  isSubmitting = false,
  error,
  successMessage,
  onClose,
  onSaveProfile,
  onSaveEmail,
  canEditEmail,
}: ProfileEditModalProps) {
  if (!profile) return null;

  const isOwnProfile = currentUserId === profile.user_id;
  const modalTitle = isOwnProfile
    ? 'Edit Your Profile'
    : `Edit ${profile.display_name}\u2019s Profile`;

  // Wrap onSaveProfile so the modal closes on success and ProfileForm gets a
  // function that throws on failure (for its own inline error display).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleFormSubmit = useCallback(
    async (data: ProfileUpdateData) => {
      await onSaveProfile(data); // throws on API failure
      onClose();
    },
    [onSaveProfile, onClose],
  );

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <AlertDialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header with title + close button */}
        <AlertDialogHeader className="flex flex-row items-start justify-between gap-4">
          <AlertDialogTitle className="flex-1">{modalTitle}</AlertDialogTitle>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close profile editor"
              className="mt-0.5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogPrimitive.Close>
        </AlertDialogHeader>

        <div className="space-y-6 pt-2">
          {/* ── Email section (Owner-editable with confirmation dialog) ── */}
          <section aria-label="Email address">
            <EmailEditSection
              email={profile.email}
              currentUserRole={currentUserRole}
              canEdit={canEditEmail}
              isLoading={isSubmitting}
              onSave={onSaveEmail}
            />
          </section>

          <hr className="border-border" />

          {/* ── Profile fields (name, bio, job title, etc.) ── */}
          <section aria-label="Profile details">
            <ProfileForm
              profile={profile}
              onSubmit={handleFormSubmit}
              onCancel={onClose}
              isLoading={isSubmitting}
            />
          </section>

          {/* ── Modal-level status messages (e.g. email save outcome) ── */}
          {error && !isSubmitting && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {successMessage && !isSubmitting && (
            <p role="status" className="text-sm text-green-600">
              {successMessage}
            </p>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
