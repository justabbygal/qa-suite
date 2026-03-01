'use client';
import React from 'react';
import type { UserProfile } from '../types/profile';

interface ProfileAvatarProps {
  profile: Pick<UserProfile, 'display_name' | 'avatar_url'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onUploadClick?: () => void;
  showUploadButton?: boolean;
}

const sizeClasses = {
  sm: { container: 'h-8 w-8', text: 'text-xs' },
  md: { container: 'h-10 w-10', text: 'text-sm' },
  lg: { container: 'h-16 w-16', text: 'text-lg' },
};

export function getInitials(displayName: string): string {
  return displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function ProfileAvatar({ profile, size = 'md', className = '', onUploadClick, showUploadButton = false }: ProfileAvatarProps) {
  const { container, text } = sizeClasses[size];
  const initials = getInitials(profile.display_name);
  return (
    <div className={`relative inline-flex ${className}`} data-testid="profile-avatar">
      <div className={`${container} rounded-full overflow-hidden flex items-center justify-center bg-primary text-primary-foreground font-medium ${text}`} aria-label={`Profile avatar for ${profile.display_name}`}>
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt={`${profile.display_name}'s avatar`} className="object-cover w-full h-full" />
          : <span aria-hidden="true">{initials}</span>}
      </div>
      {showUploadButton && onUploadClick && (
        <button type="button" onClick={onUploadClick} className="absolute -bottom-1 -right-1 bg-background border border-border rounded-full p-0.5 hover:bg-accent" aria-label="Change profile picture">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </div>
  );
}
