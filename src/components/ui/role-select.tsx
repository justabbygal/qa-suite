"use client";

import { cn } from "@/lib/utils";
import type { InviteRole } from "@/types";

interface RoleOption {
  value: InviteRole;
  label: string;
}

const ALL_ROLE_OPTIONS: RoleOption[] = [
  { value: "Owner", label: "Owner" },
  { value: "Admin", label: "Admin" },
  { value: "User", label: "User" },
];

/** Returns the role options available to the given actor role. */
function getRoleOptions(currentUserRole: "owner" | "admin"): RoleOption[] {
  if (currentUserRole === "owner") return ALL_ROLE_OPTIONS;
  // Admins can only invite User-role accounts.
  return ALL_ROLE_OPTIONS.filter((opt) => opt.value === "User");
}

export interface RoleSelectProps {
  id?: string;
  value: InviteRole;
  onChange: (role: InviteRole) => void;
  currentUserRole: "owner" | "admin";
  disabled?: boolean;
  className?: string;
}

export default function RoleSelect({
  id,
  value,
  onChange,
  currentUserRole,
  disabled,
  className,
}: RoleSelectProps) {
  const options = getRoleOptions(currentUserRole);
  // When only one option is available, lock the select.
  const isLocked = options.length === 1;

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as InviteRole)}
      disabled={disabled || isLocked}
      aria-label="Role"
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
