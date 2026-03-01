'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DefaultAvatar } from './DefaultAvatar';
import type { UserProfile, UserRole } from '@/modules/user-management/types/profile';

interface ProfileCardProps {
  profile: UserProfile;
  currentUserId: string;
  currentUserRole: UserRole;
  onEdit?: (profile: UserProfile) => void;
  onDelete?: (profile: UserProfile) => void;
}

const roleBadgeClasses: Record<UserRole, string> = {
  Owner: 'bg-purple-100 text-purple-800',
  Admin: 'bg-blue-100 text-blue-800',
  User: 'bg-gray-100 text-gray-800',
};

/** Profile card used in the user directory. Shows avatar, name, role, and bio. */
export function ProfileCard({
  profile,
  currentUserId,
  currentUserRole,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  const isOwnProfile = currentUserId === profile.user_id;
  const canEdit =
    currentUserRole === 'Owner' || currentUserRole === 'Admin' || isOwnProfile;
  const canDelete =
    (currentUserRole === 'Owner' || currentUserRole === 'Admin') &&
    (currentUserRole === 'Owner' || profile.role !== 'Owner');

  return (
    <Card data-testid={`profile-card-${profile.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={`${profile.display_name}'s profile photo`}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <DefaultAvatar displayName={profile.display_name} size="lg" />
            )}
          </div>

          {/* Profile info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm truncate">{profile.display_name}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadgeClasses[profile.role]}`}
                data-testid="role-badge"
              >
                {profile.role}
              </span>
              {isOwnProfile && (
                <span className="text-xs text-muted-foreground">(You)</span>
              )}
            </div>

            <p className="text-xs text-muted-foreground truncate mt-0.5">{profile.email}</p>

            {(profile.job_title || profile.department) && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {[profile.job_title, profile.department].filter(Boolean).join(' · ')}
              </p>
            )}

            {profile.bio && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{profile.bio}</p>
            )}
          </div>

          {/* Action buttons */}
          {(canEdit || canDelete) && (
            <div className="flex gap-2 shrink-0 pt-0.5">
              {canEdit && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(profile)}
                  className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  aria-label={`Edit ${profile.display_name}'s profile`}
                >
                  Edit
                </button>
              )}
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(profile)}
                  className="text-xs text-destructive hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  aria-label={`Delete ${profile.display_name}'s profile`}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
