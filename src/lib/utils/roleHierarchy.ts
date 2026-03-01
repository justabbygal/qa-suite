/**
 * Role hierarchy utilities for role change operations.
 *
 * Uses lowercase role identifiers to match the internal permission system
 * (src/lib/permissions/types.ts). The API layer uses capitalized values and
 * converts accordingly.
 */

export type UIRole = "owner" | "admin" | "user";

const ROLE_LEVELS: Record<UIRole, number> = {
  owner: 3,
  admin: 2,
  user: 1,
};

export interface RoleInfo {
  label: string;
  description: string;
}

/** Display metadata for each role. */
export const ROLE_DISPLAY: Record<UIRole, RoleInfo> = {
  owner: {
    label: "Owner",
    description: "Full control over the organization, settings, and all users.",
  },
  admin: {
    label: "Admin",
    description:
      "Can manage team members and configure most settings. Cannot manage Owners.",
  },
  user: {
    label: "User",
    description: "Standard access to features as configured by the organization.",
  },
};

/**
 * Returns the roles that an actor is allowed to assign during a role change.
 *
 * - Owner: can assign admin or user (not owner — avoids accidental ownership transfer)
 * - Admin: can only assign user (cannot promote to admin or above)
 * - User: cannot assign any roles
 */
export function getAssignableRoles(actorRole: UIRole): UIRole[] {
  switch (actorRole) {
    case "owner":
      return ["admin", "user"];
    case "admin":
      return ["user"];
    default:
      return [];
  }
}

/**
 * Returns true if the actor can target the given user for a role change.
 * Actors can manage users with a strictly lower role level.
 */
export function canManageTargetUser(
  actorRole: UIRole,
  targetRole: UIRole
): boolean {
  return ROLE_LEVELS[actorRole] > ROLE_LEVELS[targetRole];
}

/**
 * Validates whether a role change from `targetRole` to `newRole` is permitted
 * for the given actor.
 *
 * Returns `null` if the change is allowed, or a human-readable error string if not.
 */
export function validateRoleChange(
  actorRole: UIRole,
  targetRole: UIRole,
  newRole: UIRole
): string | null {
  if (!canManageTargetUser(actorRole, targetRole)) {
    return `You do not have permission to change the role of a ${ROLE_DISPLAY[targetRole].label}.`;
  }

  const assignable = getAssignableRoles(actorRole);
  if (!assignable.includes(newRole)) {
    return `You cannot assign the ${ROLE_DISPLAY[newRole].label} role.`;
  }

  return null;
}

/**
 * Returns a plain-English description of the impact of changing a user's role
 * from `currentRole` to `newRole`.
 */
export function getRoleChangeImpact(
  currentRole: UIRole,
  newRole: UIRole
): string {
  const currentLevel = ROLE_LEVELS[currentRole];
  const newLevel = ROLE_LEVELS[newRole];

  if (newLevel === currentLevel) {
    return "The user's role will remain unchanged.";
  }

  if (newLevel > currentLevel) {
    if (newRole === "owner") {
      return "This user will gain full ownership of the organization, including the ability to manage all users and settings.";
    }
    if (newRole === "admin") {
      return "This user will gain admin privileges and will be able to manage team members and configure settings.";
    }
  }

  if (newLevel < currentLevel) {
    if (currentRole === "owner") {
      return "This user will lose ownership and will no longer have full administrative control over the organization.";
    }
    if (currentRole === "admin") {
      return "This user will lose admin privileges and will no longer be able to manage team members or change settings.";
    }
  }

  return `This user's role will change from ${ROLE_DISPLAY[currentRole].label} to ${ROLE_DISPLAY[newRole].label}.`;
}
