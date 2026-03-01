'use client';

import { cn } from '@/lib/utils';
import type { Role } from '@/lib/modules/types';

export interface RoleTabsProps {
  roles: Role[];
  selectedRole: Role;
  onRoleChange: (role: Role) => void;
}

/**
 * Horizontal tab strip for selecting which role's permissions to view.
 * Scrolls horizontally on overflow for narrow viewports, with each tab
 * meeting the 44px minimum touch-target height.
 */
export function RoleTabs({ roles, selectedRole, onRoleChange }: RoleTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Permission roles"
      className="flex overflow-x-auto border-b border-border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {roles.map((role) => (
        <button
          key={role}
          type="button"
          role="tab"
          id={`role-tab-${role.toLowerCase()}`}
          aria-controls={`role-panel-${role.toLowerCase()}`}
          aria-selected={selectedRole === role}
          onClick={() => onRoleChange(role)}
          className={cn(
            // Layout — tall enough for touch (44px min), shrink-0 prevents squishing
            'relative flex shrink-0 items-center px-4 min-h-[44px] text-sm font-medium',
            // Transition
            'transition-colors',
            // Bottom-border indicator (negative margin overlaps the tablist border)
            'border-b-2 -mb-px',
            // Active vs inactive states
            selectedRole === role
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            // Focus ring — inset so it is visible on the tab surface
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
          )}
        >
          {role}
        </button>
      ))}
    </div>
  );
}
