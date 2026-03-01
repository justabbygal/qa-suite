'use client';

import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/modules/types';
import type { UserRole } from '@/hooks/useUserRole';

// ---------------------------------------------------------------------------
// Role metadata — consistent with ModuleSection ROLE_META coloring
// ---------------------------------------------------------------------------

const ROLE_META: Record<
  Role,
  { description: string; selectedClass: string; youBadgeClass: string }
> = {
  Owner: {
    description: 'Full administrative control',
    selectedClass:
      'ring-1 ring-amber-200 bg-amber-50 text-amber-800 shadow-sm dark:ring-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
    youBadgeClass:
      'bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-300',
  },
  Admin: {
    description: 'Can manage team and settings',
    selectedClass:
      'ring-1 ring-blue-200 bg-blue-50 text-blue-800 shadow-sm dark:ring-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    youBadgeClass:
      'bg-blue-200 text-blue-900 dark:bg-blue-800/60 dark:text-blue-300',
  },
  User: {
    description: 'Standard member access',
    selectedClass:
      'ring-1 ring-gray-200 bg-gray-100 text-gray-800 shadow-sm dark:ring-gray-700 dark:bg-gray-800 dark:text-gray-200',
    youBadgeClass:
      'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  },
};

const USER_ROLE_TO_ROLE: Record<UserRole, Role> = {
  owner: 'Owner',
  admin: 'Admin',
  user: 'User',
};

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface RoleSelectorProps {
  /** All roles to display as tabs. */
  roles: Role[];
  /** Currently active role. */
  selectedRole: Role;
  /**
   * Roles whose content is editable. Tabs for roles outside this list are
   * rendered with a lock icon to signal they are read-only.
   */
  editableRoles: Role[];
  /** The current user's role — used to render the "You" badge. */
  currentUserRole: UserRole;
  /** Called when the user activates a tab. */
  onRoleChange: (role: Role) => void;
}

/**
 * Segment-control style role selector for the permission manager interface.
 *
 * Each tab shows the role name, a short description, a lock icon when the
 * role is not editable by the current user, and a "You" badge on the tab
 * that matches the current user's own role.
 */
export function RoleSelector({
  roles,
  selectedRole,
  editableRoles,
  currentUserRole,
  onRoleChange,
}: RoleSelectorProps) {
  const currentRoleCapitalized = USER_ROLE_TO_ROLE[currentUserRole];

  return (
    <div
      role="tablist"
      aria-label="Select role to view permissions"
      className="flex gap-1.5 overflow-x-auto rounded-xl bg-muted/40 p-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {roles.map((role) => {
        const meta = ROLE_META[role];
        const isSelected = selectedRole === role;
        const isEditable = editableRoles.includes(role);
        const isCurrentUserRole = role === currentRoleCapitalized;

        return (
          <button
            key={role}
            type="button"
            role="tab"
            id={`role-tab-${role.toLowerCase()}`}
            aria-controls={`role-panel-${role.toLowerCase()}`}
            aria-selected={isSelected}
            onClick={() => onRoleChange(role)}
            className={cn(
              // Layout — flex-1 distributes tabs evenly, shrink-0 keeps them readable on overflow
              'relative flex flex-1 shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-2 min-h-[44px]',
              // Typography
              'text-sm font-medium',
              // Transition
              'transition-all duration-150',
              // Selected vs. unselected
              isSelected
                ? meta.selectedClass
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              // Focus ring — inset so it is visible on the tab surface
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
          >
            {/* Tab label row — includes lock icon when read-only */}
            <span className="flex items-center gap-1.5">
              {role}
              {!isEditable && (
                <Lock
                  className="h-3 w-3 shrink-0 text-muted-foreground"
                  aria-label="Read-only"
                />
              )}
            </span>

            {/* Role description — hidden on very small screens */}
            <span className="hidden sm:block text-[10px] font-normal leading-tight opacity-70">
              {meta.description}
            </span>

            {/* "You" badge — pinned to the top-right corner of the tab */}
            {isCurrentUserRole && (
              <span
                className={cn(
                  'absolute -top-1.5 -right-1 rounded px-1 py-px text-[9px] font-bold leading-none',
                  meta.youBadgeClass
                )}
                aria-label="Your current role"
              >
                You
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
