/**
 * Client-side API helpers for the user management endpoints.
 *
 * Auth headers are injected by the Better Auth middleware in production.
 * During development they fall back to values stored in localStorage/cookies.
 */

export interface RemoveUserParams {
  /** The user_id field from the UserProfile (auth-system user ID). */
  userId: string;
  /** The organization the user belongs to. */
  organizationId: string;
}

/**
 * Removes a user from the organization.
 * Throws an Error with a user-friendly message on failure.
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
  /** The user_id of the user whose role is being changed. */
  userId: string;
  /** The organization the user belongs to. */
  organizationId: string;
  /** The new role to assign. */
  newRole: ChangeRoleValue;
}

/**
 * Changes a user's role within the organization.
 * Throws an Error with a user-friendly message on failure.
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
