/**
 * Client-side API helpers for the invite management endpoints.
 *
 * Auth headers are injected by the Better Auth middleware in production.
 * During development they fall back to values stored in localStorage.
 */

import type { InviteRole } from "@/types";

export interface CreateInviteParams {
  email: string;
  name: string;
  role: InviteRole;
  organizationId: string;
}

export interface CreatedInvite {
  id: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
  createdAt: string;
}

export interface CreateInviteResult {
  invite: CreatedInvite;
  emailSent: boolean;
  /** Present when the invite was created but the email could not be delivered. */
  warning?: string;
}

function getDevHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return {
    Authorization: `Bearer ${localStorage.getItem("dev_auth_token") ?? "dev-token"}`,
    "x-user-id": localStorage.getItem("dev_user_id") ?? "dev-user",
  };
}

/**
 * Creates a new user invitation via the API.
 *
 * Throws an `Error` with a user-friendly message on failure.
 */
export async function createInvite({
  email,
  name,
  role,
  organizationId,
}: CreateInviteParams): Promise<CreateInviteResult> {
  const res = await fetch("/api/invites", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-organization-id": organizationId,
      ...getDevHeaders(),
    },
    body: JSON.stringify({ email, name, role }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    data?: { invite: CreatedInvite; emailSent: boolean; warning?: string };
    error?: { userMessage?: string; message?: string };
  };

  if (!res.ok) {
    const message =
      body?.error?.userMessage ??
      body?.error?.message ??
      "Failed to send invite. Please try again.";
    throw new Error(message);
  }

  return body.data!;
}
