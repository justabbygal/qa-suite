/**
 * Profile-specific permission utilities.
 *
 * Extends the base permission model from the user-management module with
 * profile editing rules, particularly around sensitive fields like email.
 *
 * Role hierarchy: Owner (3) > Admin (2) > User (1)
 *   - Owner: can edit any profile, including email for any user
 *   - Admin: can edit any profile except Owner-owned email
 *   - User: can only edit their own profile; email is always read-only
 */

import type { UserRole } from '@/modules/user-management/types/profile';

// Re-export core permission helpers so callers only need one import
export {
  getProfilePermissions,
  canEditProfile,
  canDeleteProfile,
  canManageAvatar,
} from '@/modules/user-management/lib/permissions';

/**
 * Returns true when the requester is allowed to change a user's email address.
 * Only Owners can edit email — Admins and Users see a read-only field.
 */
export function canEditEmail(requesterRole: UserRole): boolean {
  return requesterRole === 'Owner';
}

/**
 * Returns the display label for the email field restriction.
 * Used in the UI to explain why the field is locked.
 */
export function getEmailEditRestrictionReason(requesterRole: UserRole): string | null {
  if (requesterRole === 'Owner') return null;
  if (requesterRole === 'Admin') {
    return 'Email addresses can only be changed by an Owner.';
  }
  return 'Only Owners can change email addresses.';
}

/**
 * Returns true when the requester can edit the given profile field for the
 * target user. Email requires Owner; all other fields follow the standard
 * canEditProfile check.
 */
export function canEditField(
  field: string,
  requesterRole: UserRole,
  requesterId: string,
  targetUserId: string,
): boolean {
  if (field === 'email') {
    return canEditEmail(requesterRole);
  }
  const isOwnerOrAdmin = requesterRole === 'Owner' || requesterRole === 'Admin';
  return isOwnerOrAdmin || requesterId === targetUserId;
}
