import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileAvatar } from './ProfileAvatar';
import type { UserProfile, UserRole } from '../types/profile';

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

export function ProfileCard({ profile, currentUserId, currentUserRole, onEdit, onDelete }: ProfileCardProps) {
  const isOwnProfile = currentUserId === profile.user_id;
  const canEdit = currentUserRole === 'Owner' || currentUserRole === 'Admin' || isOwnProfile;
  const canDelete = currentUserRole === 'Owner' || (currentUserRole === 'Admin' && profile.role !== 'Owner');

  return (
    <Card data-testid={`profile-card-${profile.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ProfileAvatar profile={profile} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm truncate">{profile.display_name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadgeClasses[profile.role]}`} data-testid="role-badge">{profile.role}</span>
              {isOwnProfile && <span className="text-xs text-muted-foreground">(You)</span>}
            </div>
            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
            {profile.job_title && <p className="text-xs text-muted-foreground truncate mt-0.5">{profile.job_title}{profile.department && ` · ${profile.department}`}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            {canEdit && onEdit && <button type="button" onClick={() => onEdit(profile)} className="text-xs text-primary hover:underline" aria-label={`Edit ${profile.display_name}'s profile`}>Edit</button>}
            {canDelete && onDelete && <button type="button" onClick={() => onDelete(profile)} className="text-xs text-destructive hover:underline" aria-label={`Delete ${profile.display_name}'s profile`}>Delete</button>}
          </div>
        </div>
        {profile.bio && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{profile.bio}</p>}
      </CardContent>
    </Card>
  );
}
