/**
 * Client-side API helpers for the user management endpoints.
 *
 * Auth headers are injected by the Better Auth middleware in production.
 * During development they fall back to values stored in localStorage/cookies.
 */

export interface RemoveUserParams {
  /** The `user_id` field from the UserProfile (auth-system user ID). */
  userId: string;
  /** The organization the user belongs to. */
  organizationId: string;
}

/**
 * Removes a user from the organization.
 *
 * Throws an `Error` with a user-friendly message on failure.
 */
export async function removeUser({
  userId,
  organizationId,
}: RemoveUserParams): Promise<void> {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-organization-id": organizationId,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { userMessage?: string; message?: string };
    };
    const message =
      body?.error?.userMessage ??
      body?.error?.message ??
      "Failed to remove user. Please try again.";
    throw new Error(message);
  }
}

export type ChangeRoleValue = "Owner" | "Admin" | "User";

export interface ChangeUserRoleParams {
  /** The `user_id` of the user whose role is being changed. */
  userId: string;
  /** The organization the user belongs to. */
  organizationId: string;
  /** The new role to assign. */
  newRole: ChangeRoleValue;
}

/**
 * Changes a user's role within the organization.
 *
 * Throws an `Error` with a user-friendly message on failure.
 */
export async function changeUserRole({
  userId,
  organizationId,
  newRole,
}: ChangeUserRoleParams): Promise<void> {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-organization-id": organizationId,
    },
    body: JSON.stringify({ newRole }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { userMessage?: string; message?: string };
    };
    const message =
      body?.error?.userMessage ??
      body?.error?.message ??
      "Failed to change role. Please try again.";
    throw new Error(message);
  }
}

// ---------------------------------------------------------------------------
// Shared display types used by useUsers and UserList/UserCard components
// ---------------------------------------------------------------------------

/** Capitalized role values as stored in the DB (profiles + invites tables). */
export type UserEntryRole = "Owner" | "Admin" | "User";

/** Display status derived from profile membership or invite state. */
export type UserStatus = "active" | "invited" | "expired";

/**
 * Unified display object representing either an active org member (sourced
 * from the profiles table) or a pending/expired invitation.
 */
export interface UserEntry {
  /** Unique ID — profile row ID for active users, invite row ID for invites. */
  id: string;
  /** Distinguishes active org members from pending invitations. */
  type: "user" | "invite";
  /** Display name for users; email address for invites (no profile yet). */
  name: string;
  email: string;
  role: UserEntryRole;
  status: UserStatus;
  /** Profile user_id — only present for active org members. */
  userId?: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  /** ISO timestamp; only present for invite entries. */
  expiresAt?: string;
  /** Email of the person who sent the invite; only present for invite entries. */
  invitedBy?: string;
  createdAt: string;
}
