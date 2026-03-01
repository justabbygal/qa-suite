"use client";

import { useState, useEffect } from "react";

export type UserRole = "owner" | "admin" | "user";

/**
 * Temporary hook returning the current user's role.
 * TODO: Replace with Better Auth session data once auth is integrated.
 * For development, set localStorage key "dev_user_role" to one of: owner, admin, user
 */
export function useUserRole(): UserRole {
  const [role, setRole] = useState<UserRole>("user");

  useEffect(() => {
    const storedRole = localStorage.getItem("dev_user_role") as UserRole | null;
    if (storedRole && (["owner", "admin", "user"] as UserRole[]).includes(storedRole)) {
      setRole(storedRole);
    }
  }, []);

  return role;
}

export function canAccessPermissions(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}
