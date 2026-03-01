'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  UserProfile,
  ProfileUpdateData,
  UserRole,
} from '@/modules/user-management/types/profile';
import { canEditProfile, canEditEmail } from '@/lib/permissions/profilePermissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileEditState {
  /** The profile currently open in the edit modal, or null when closed. */
  profile: UserProfile | null;
  isOpen: boolean;
  isSubmitting: boolean;
  error: string | null;
  successMessage: string | null;
}

export interface UseProfileEditOptions {
  currentUserId: string;
  currentUserRole: UserRole;
  organizationId: string;
  /**
   * Called after any successful save (profile fields or email).
   * Use this to refresh the directory or parent list.
   */
  onSaveSuccess?: (updatedProfile: UserProfile) => void;
}

export interface UseProfileEditReturn {
  editState: ProfileEditState;
  /** Open the edit modal for the given profile. */
  openEdit: (profile: UserProfile) => void;
  /** Close the edit modal and clear transient state. */
  closeEdit: () => void;
  /**
   * Persist profile field changes (name, bio, job title, etc.).
   * Throws on API failure so the calling form can display the error inline.
   */
  saveProfile: (data: ProfileUpdateData) => Promise<void>;
  /**
   * Persist an email address change with audit logging.
   * Throws on API failure so the confirmation dialog can surface the error.
   */
  saveEmail: (newEmail: string) => Promise<void>;
  /** Whether the current user can edit the profile that is open. */
  canEditCurrentProfile: boolean;
  /** Whether the current user is allowed to change the email field. */
  canEditEmailField: boolean;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function patchProfile(
  profileId: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<UserProfile> {
  const res = await fetch(`/api/profiles/${profileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let userMessage = 'Failed to save changes';
    try {
      const json = (await res.json()) as { error?: { userMessage?: string } };
      userMessage = json?.error?.userMessage ?? userMessage;
    } catch {
      // non-JSON body — fall through to default message
    }
    throw new Error(userMessage);
  }

  return res.json() as Promise<UserProfile>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProfileEdit({
  currentUserId,
  currentUserRole,
  organizationId,
  onSaveSuccess,
}: UseProfileEditOptions): UseProfileEditReturn {
  const [editState, setEditState] = useState<ProfileEditState>({
    profile: null,
    isOpen: false,
    isSubmitting: false,
    error: null,
    successMessage: null,
  });

  // Keep a stable ref to the latest onSaveSuccess callback so the async
  // functions do not need to re-close over it on every render.
  const onSaveSuccessRef = useRef(onSaveSuccess);
  onSaveSuccessRef.current = onSaveSuccess;

  const authHeaders: Record<string, string> = {
    'x-user-id': currentUserId,
    'x-organization-id': organizationId,
    'x-user-role': currentUserRole,
  };

  const openEdit = useCallback((profile: UserProfile) => {
    setEditState({
      profile,
      isOpen: true,
      isSubmitting: false,
      error: null,
      successMessage: null,
    });
  }, []);

  const closeEdit = useCallback(() => {
    setEditState((prev) => ({
      ...prev,
      isOpen: false,
      error: null,
      successMessage: null,
    }));
  }, []);

  const saveProfile = useCallback(
    async (data: ProfileUpdateData) => {
      const profileId = editState.profile?.id;
      if (!profileId) return;

      setEditState((prev) => ({
        ...prev,
        isSubmitting: true,
        error: null,
        successMessage: null,
      }));

      try {
        const updated = await patchProfile(profileId, data as Record<string, unknown>, authHeaders);
        setEditState((prev) => ({
          ...prev,
          profile: updated,
          isSubmitting: false,
          successMessage: 'Profile saved successfully!',
        }));
        onSaveSuccessRef.current?.(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save profile';
        setEditState((prev) => ({ ...prev, isSubmitting: false, error: message }));
        // Re-throw so ProfileForm can display the error in its own error state
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editState.profile?.id, currentUserId, organizationId, currentUserRole],
  );

  const saveEmail = useCallback(
    async (newEmail: string) => {
      const profileId = editState.profile?.id;
      if (!profileId) return;

      setEditState((prev) => ({
        ...prev,
        isSubmitting: true,
        error: null,
        successMessage: null,
      }));

      try {
        const updated = await patchProfile(
          profileId,
          { email: newEmail },
          authHeaders,
        );
        setEditState((prev) => ({
          ...prev,
          profile: updated,
          isSubmitting: false,
          successMessage: 'Email updated successfully!',
        }));
        onSaveSuccessRef.current?.(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update email';
        setEditState((prev) => ({ ...prev, isSubmitting: false, error: message }));
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editState.profile?.id, currentUserId, organizationId, currentUserRole],
  );

  const canEditCurrentProfile = editState.profile
    ? canEditProfile(currentUserRole, currentUserId, editState.profile.user_id)
    : false;

  const canEditEmailField = canEditEmail(currentUserRole);

  return {
    editState,
    openEdit,
    closeEdit,
    saveProfile,
    saveEmail,
    canEditCurrentProfile,
    canEditEmailField,
  };
}
