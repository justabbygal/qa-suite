'use client';

import React from 'react';

interface DefaultAvatarProps {
  displayName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses: Record<
  NonNullable<DefaultAvatarProps['size']>,
  { container: string; text: string }
> = {
  xs: { container: 'h-6 w-6', text: 'text-xs' },
  sm: { container: 'h-8 w-8', text: 'text-xs' },
  md: { container: 'h-10 w-10', text: 'text-sm' },
  lg: { container: 'h-16 w-16', text: 'text-xl' },
  xl: { container: 'h-24 w-24', text: 'text-3xl' },
};

/** Extracts up to two initials from a display name. */
export function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/** Circular avatar showing the user's initials. Used when no photo is available. */
export function DefaultAvatar({ displayName, size = 'md', className = '' }: DefaultAvatarProps) {
  const { container, text } = sizeClasses[size];
  const initials = getInitials(displayName);

  return (
    <div
      className={`${container} rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold select-none shrink-0 ${text} ${className}`}
      role="img"
      aria-label={`Avatar for ${displayName}`}
      data-testid="default-avatar"
    >
      <span aria-hidden="true">{initials}</span>
    </div>
  );
}
