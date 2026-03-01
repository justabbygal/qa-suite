"use client";

import type { Role } from "@/lib/modules/types";

export interface RoleTabsProps {
  /** The roles to show as tabs. */
  roles: Role[];
  /** The currently selected role. */
  selectedRole: Role;
  /** Called when the user selects a different role tab. */
  onRoleChange: (role: Role) => void;
}

export function RoleTabs({ roles, selectedRole, onRoleChange }: RoleTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Select role to edit permissions"
      className="flex gap-0 border-b"
    >
      {roles.map((role) => {
        const isSelected = selectedRole === role;
        return (
          <button
            key={role}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={`role-panel-${role.toLowerCase()}`}
            id={`role-tab-${role.toLowerCase()}`}
            onClick={() => onRoleChange(role)}
            className={[
              "px-4 py-2.5 text-sm font-medium transition-colors",
              "border-b-2 -mb-px focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSelected
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            ].join(" ")}
          >
            {role}
          </button>
        );
      })}
    </div>
  );
}
