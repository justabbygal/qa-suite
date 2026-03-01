import type { UserRole, ProfilePermissions } from '../types/profile';

/**
 * Returns the full permission set for a given role.
 * Permissions follow a hierarchical model: Owner > Admin > User.
 */
export function getProfilePermissions(role: UserRole): ProfilePermissions {
  switch (role) {
    case 'Owner':
      return {
        canViewProfiles: true,
        canEditOwnProfile: true,
        canEditAllProfiles: true,
        canDeleteProfiles: true,
        canDeleteOwnerProfile: true,
        canManageAnyAvatar: true,
        canManageOwnAvatar: true,
      };

    case 'Admin':
      return {
        canViewProfiles: true,
        canEditOwnProfile: true,
        canEditAllProfiles: true,
        canDeleteProfiles: true,
        canDeleteOwnerProfile: false,
        canManageAnyAvatar: true,
        canManageOwnAvatar: true,
      };

    case 'User':
      return {
        canViewProfiles: true,
        canEditOwnProfile: true,
        canEditAllProfiles: false,
        canDeleteProfiles: false,
        canDeleteOwnerProfile: false,
        canManageAnyAvatar: false,
        canManageOwnAvatar: true,
      };

    default: {
      // Exhaustive check — unknown roles get no permissions
      const _exhaustive: never = role;
      void _exhaustive;
      return {
        canViewProfiles: false,
        canEditOwnProfile: false,
        canEditAllProfiles: false,
        canDeleteProfiles: false,
        canDeleteOwnerProfile: false,
        canManageAnyAvatar: false,
        canManageOwnAvatar: false,
      };
    }
  }
}

/**
 * Returns true when the requester is allowed to edit the target profile.
 * Admins and Owners may edit any profile; Users may only edit their own.
 */
export function canEditProfile(
  requesterRole: UserRole,
  requesterId: string,
  targetUserId: string,
): boolean {
  const { canEditAllProfiles, canEditOwnProfile } = getProfilePermissions(requesterRole);
  return canEditAllProfiles || (canEditOwnProfile && requesterId === targetUserId);
}

/**
 * Returns true when the requester is allowed to delete the target profile.
 * Admins cannot delete Owner-role profiles.
 */
export function canDeleteProfile(
  requesterRole: UserRole,
  targetRole: UserRole,
): boolean {
  const { canDeleteProfiles, canDeleteOwnerProfile } = getProfilePermissions(requesterRole);
  if (!canDeleteProfiles) return false;
  if (targetRole === 'Owner' && !canDeleteOwnerProfile) return false;
  return true;
}

/**
 * Returns true when the requester is allowed to upload/remove the avatar
 * for the target user.
 */
export function canManageAvatar(
  requesterRole: UserRole,
  requesterId: string,
  targetUserId: string,
): boolean {
  const { canManageAnyAvatar, canManageOwnAvatar } = getProfilePermissions(requesterRole);
  return canManageAnyAvatar || (canManageOwnAvatar && requesterId === targetUserId);
}
