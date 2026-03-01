'use client';

import React, { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { ProfileCard } from '@/modules/user-management/components/ProfileCard';
import { ProfileAvatar } from '@/modules/user-management/components/ProfileAvatar';
import { DirectoryFilters } from './DirectoryFilters';
import { filterAndSortProfiles } from '@/lib/utils/directoryUtils';
import type { UserProfile, UserRole } from '@/modules/user-management/types/profile';
import type {
  DirectoryFilters as DirectoryFiltersType,
  ViewMode,
} from '@/lib/utils/directoryUtils';

interface UserDirectoryProps {
  profiles: UserProfile[];
  currentUserId: string;
  currentUserRole: UserRole;
  isLoading?: boolean;
  onEditProfile?: (profile: UserProfile) => void;
  onDeleteProfile?: (profile: UserProfile) => void;
}

const roleBadgeClasses: Record<UserRole, string> = {
  Owner: 'bg-purple-100 text-purple-800',
  Admin: 'bg-blue-100 text-blue-800',
  User: 'bg-gray-100 text-gray-800',
};

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 rounded-full bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

function ProfileListRow({
  profile, currentUserId, currentUserRole, onEdit, onDelete,
}: {
  profile: UserProfile;
  currentUserId: string;
  currentUserRole: UserRole;
  onEdit?: (profile: UserProfile) => void;
  onDelete?: (profile: UserProfile) => void;
}) {
  const isOwnProfile = currentUserId === profile.user_id;
  const canEdit = currentUserRole === 'Owner' || currentUserRole === 'Admin' || isOwnProfile;
  const canDelete = currentUserRole === 'Owner' || (currentUserRole === 'Admin' && profile.role !== 'Owner');

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
      role="listitem"
    >
      <ProfileAvatar profile={profile} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{profile.display_name}</span>
          {isOwnProfile && <span className="text-xs text-muted-foreground">(You)</span>}
          <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + roleBadgeClasses[profile.role]}>
            {profile.role}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
      </div>
      {(profile.job_title || profile.department) && (
        <div className="hidden sm:block text-xs text-muted-foreground min-w-0 max-w-48 truncate">
          {[profile.job_title, profile.department].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="flex gap-2 flex-shrink-0">
        {canEdit && onEdit && (
          <button type="button" onClick={() => onEdit(profile)}
            className="text-xs text-primary hover:underline"
            aria-label={'Edit ' + profile.display_name + "'s profile"}>Edit</button>
        )}
        {canDelete && onDelete && (
          <button type="button" onClick={() => onDelete(profile)}
            className="text-xs text-destructive hover:underline"
            aria-label={'Delete ' + profile.display_name + "'s profile"}>Delete</button>
        )}
      </div>
    </div>
  );
}

export function UserDirectory({
  profiles, currentUserId, currentUserRole, isLoading = false, onEditProfile, onDeleteProfile,
}: UserDirectoryProps) {
  const [filters, setFilters] = useState<DirectoryFiltersType>({
    search: '', role: '', sortField: 'name', sortOrder: 'asc',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const filteredProfiles = useMemo(
    () => filterAndSortProfiles(profiles, filters),
    [profiles, filters],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded animate-pulse w-full" />
        <div role="status" aria-label="Loading team members" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const memberLabel = filteredProfiles.length + ' team member' + (filteredProfiles.length !== 1 ? 's' : '');

  return (
    <div className="space-y-4">
      <DirectoryFilters
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCount={profiles.length}
        filteredCount={filteredProfiles.length}
      />
      {filteredProfiles.length === 0 ? (
        <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">
              {filters.search || filters.role ? 'No members found' : 'No team members yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {filters.search || filters.role
                ? 'Try adjusting your search or filters.'
                : 'Invite team members to get started.'}
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div role="list" aria-label={memberLabel} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((profile) => (
            <div key={profile.id} role="listitem">
              <ProfileCard
                profile={profile}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onEdit={onEditProfile}
                onDelete={onDeleteProfile}
              />
            </div>
          ))}
        </div>
      ) : (
        <div role="list" aria-label={memberLabel} className="space-y-2">
          {filteredProfiles.map((profile) => (
            <ProfileListRow
              key={profile.id}
              profile={profile}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onEdit={onEditProfile}
              onDelete={onDeleteProfile}
            />
          ))}
        </div>
      )}
    </div>
  );
}