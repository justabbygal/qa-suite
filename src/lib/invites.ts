/**
 * Core business logic for the invite management system.
 *
 * Provides typed functions for all invite CRUD operations. Route handlers
 * call these functions and remain responsible for HTTP concerns (auth headers,
 * rate limiting, request parsing, response shaping, audit logging, and
 * side-effect orchestration like email dispatch).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  InviteAlreadyExistsError,
  InviteExpiredError,
  InviteAlreadyUsedError,
  InviteNotFoundError,
  DatabaseError,
} from "@/lib/errors/invite-errors";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export const VALID_ROLES = ["Owner", "Admin", "User"] as const;
export type InviteRole = (typeof VALID_ROLES)[number];
export type InviteStatus = "pending" | "accepted" | "expired";

export interface InviteRecord {
  id: string;
  organization_id: string;
  email: string;
  role: InviteRole;
  invited_by: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/** Invite as returned to callers — token is never exposed externally. */
export interface InviteWithStatus extends Omit<InviteRecord, "token"> {
  status: InviteStatus;
}

export interface CreateInviteInput {
  organizationId: string;
  email: string;
  role: InviteRole;
  invitedBy: string;
}

export interface AcceptInviteResult {
  inviteId: string;
  email: string;
  role: InviteRole;
  organizationId: string;
}

export const INVITE_EXPIRY_DAYS = 7;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

export function generateInviteToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export function getInviteStatus(
  invite: Pick<InviteRecord, "expires_at" | "used_at">
): InviteStatus {
  if (invite.used_at) return "accepted";
  if (new Date(invite.expires_at) < new Date()) return "expired";
  return "pending";
}

// ---------------------------------------------------------------------------
// Email dispatch
// ---------------------------------------------------------------------------

/**
 * Send an invitation email via Resend. Falls back to a console log in
 * development environments where RESEND_API_KEY is not configured.
 */
export async function sendInviteEmail(
  email: string,
  token: string,
  inviterName: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: "invite-email",
        event: "dev_fallback",
        to: email,
        inviteUrl: `${appUrl}/invite/${token}`,
        invitedBy: inviterName,
      })
    );
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "noreply@qa-suite.app",
      to: email,
      subject: `You've been invited to join QA Suite`,
      html: `<p><strong>${inviterName}</strong> has invited you to join the QA Suite workspace.</p>
             <p><a href="${appUrl}/invite/${token}">Accept invitation</a></p>
             <p>This link expires in ${INVITE_EXPIRY_DAYS} days.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new invitation record.
 *
 * Throws InviteAlreadyExistsError when a pending (non-expired, non-accepted)
 * invite already exists for the given email within the organisation.
 */
export async function createInvite(
  supabase: SupabaseClient,
  input: CreateInviteInput
): Promise<InviteRecord> {
  const { organizationId, email, role, invitedBy } = input;

  const { data: existing, error: checkErr } = await supabase
    .from("invitations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (checkErr) {
    throw new DatabaseError("check existing invite", new Error(checkErr.message));
  }
  if (existing) {
    throw new InviteAlreadyExistsError(email);
  }

  const token = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: invite, error: insertErr } = await supabase
    .from("invitations")
    .insert({
      organization_id: organizationId,
      email,
      role,
      invited_by: invitedBy,
      token,
      expires_at: expiresAt,
    })
    .select(
      "id, organization_id, email, role, invited_by, token, expires_at, used_at, created_at"
    )
    .single();

  if (insertErr || !invite) {
    throw new DatabaseError("create invite", new Error(insertErr?.message));
  }

  return invite as InviteRecord;
}

/**
 * Cancel (delete) an invitation.
 *
 * Returns the cancelled record so the caller can include it in audit logs.
 * Throws InviteNotFoundError when the invite does not exist in the organisation.
 */
export async function cancelInvite(
  supabase: SupabaseClient,
  { inviteId, organizationId }: { inviteId: string; organizationId: string }
): Promise<InviteRecord> {
  const { data: invite, error: fetchErr } = await supabase
    .from("invitations")
    .select(
      "id, organization_id, email, role, invited_by, token, expires_at, used_at, created_at"
    )
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .single();

  if (fetchErr || !invite) {
    throw new InviteNotFoundError(inviteId);
  }

  const { error: deleteErr } = await supabase
    .from("invitations")
    .delete()
    .eq("id", inviteId)
    .eq("organization_id", organizationId);

  if (deleteErr) {
    throw new DatabaseError("cancel invite", new Error(deleteErr.message));
  }

  return invite as InviteRecord;
}

/**
 * Rotate the token on an existing invitation and extend its expiry by 7 days.
 *
 * Returns the updated record and the new plain-text token. The caller is
 * responsible for re-sending the invitation email with the new token.
 * Throws InviteNotFoundError when the invite does not exist in the organisation.
 */
export async function resendInvite(
  supabase: SupabaseClient,
  { inviteId, organizationId }: { inviteId: string; organizationId: string }
): Promise<{ invite: InviteRecord; newToken: string }> {
  const newToken = generateInviteToken();
  const newExpiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from("invitations")
    .update({ token: newToken, expires_at: newExpiresAt })
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .select(
      "id, organization_id, email, role, invited_by, token, expires_at, used_at, created_at"
    )
    .single();

  // .single() errors when no rows match — treat as not found
  if (updateErr || !updated) {
    throw new InviteNotFoundError(inviteId);
  }

  return { invite: updated as InviteRecord, newToken };
}

/**
 * Validate and accept an invite by its ID + secret token.
 *
 * Both must match so that guessing a valid ID without the token is not
 * sufficient to accept the invitation. Throws:
 *   - InviteNotFoundError  — ID not found or token mismatch (collapsed to avoid enumeration)
 *   - InviteAlreadyUsedError — already accepted
 *   - InviteExpiredError    — past expiry date
 */
export async function acceptInviteById(
  supabase: SupabaseClient,
  { inviteId, token }: { inviteId: string; token: string }
): Promise<AcceptInviteResult> {
  const { data: invite, error: fetchErr } = await supabase
    .from("invitations")
    .select("id, email, role, organization_id, expires_at, used_at, token")
    .eq("id", inviteId)
    .single();

  // Treat wrong token identically to not-found to prevent ID enumeration
  if (fetchErr || !invite || invite.token !== token) {
    throw new InviteNotFoundError(inviteId);
  }

  if (invite.used_at) throw new InviteAlreadyUsedError();
  if (new Date(invite.expires_at) < new Date()) throw new InviteExpiredError();

  const { error: updateErr } = await supabase
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", inviteId);

  if (updateErr) {
    throw new DatabaseError("accept invite", new Error(updateErr.message));
  }

  return {
    inviteId: invite.id,
    email: invite.email,
    role: invite.role as InviteRole,
    organizationId: invite.organization_id,
  };
}

/**
 * Validate and accept an invite using only its token.
 *
 * This is the endpoint called when a user clicks the link from their
 * invitation email (URL format: /invite/{token}). Throws:
 *   - InviteNotFoundError  — no invite with this token
 *   - InviteAlreadyUsedError — already accepted
 *   - InviteExpiredError    — past expiry date
 */
export async function acceptInviteByToken(
  supabase: SupabaseClient,
  { token }: { token: string }
): Promise<AcceptInviteResult> {
  const { data: invite, error: fetchErr } = await supabase
    .from("invitations")
    .select("id, email, role, organization_id, expires_at, used_at")
    .eq("token", token)
    .single();

  if (fetchErr || !invite) {
    throw new InviteNotFoundError();
  }

  if (invite.used_at) throw new InviteAlreadyUsedError();
  if (new Date(invite.expires_at) < new Date()) throw new InviteExpiredError();

  const { error: updateErr } = await supabase
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (updateErr) {
    throw new DatabaseError("accept invite", new Error(updateErr.message));
  }

  return {
    inviteId: invite.id,
    email: invite.email,
    role: invite.role as InviteRole,
    organizationId: invite.organization_id,
  };
}

/**
 * Fetch a single invite by ID within an organisation.
 * The token field is excluded — callers must never expose raw tokens.
 */
export async function getInviteById(
  supabase: SupabaseClient,
  { inviteId, organizationId }: { inviteId: string; organizationId: string }
): Promise<InviteWithStatus> {
  const { data: invite, error } = await supabase
    .from("invitations")
    .select(
      "id, organization_id, email, role, invited_by, expires_at, used_at, created_at"
    )
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !invite) {
    throw new InviteNotFoundError(inviteId);
  }

  return { ...invite, status: getInviteStatus(invite) } as InviteWithStatus;
}

/**
 * List all invitations for an organisation, optionally filtered by status
 * ("pending" | "accepted" | "expired"). Returns most-recent-first.
 */
export async function listInvitesByOrg(
  supabase: SupabaseClient,
  {
    organizationId,
    status,
  }: { organizationId: string; status?: string | null }
): Promise<InviteWithStatus[]> {
  let query = supabase
    .from("invitations")
    .select(
      "id, organization_id, email, role, invited_by, expires_at, used_at, created_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const now = new Date().toISOString();
  if (status === "pending") {
    query = query.is("used_at", null).gt("expires_at", now);
  } else if (status === "accepted") {
    query = query.not("used_at", "is", null);
  } else if (status === "expired") {
    query = query.is("used_at", null).lt("expires_at", now);
  }

  const { data: invites, error } = await query;

  if (error) {
    throw new DatabaseError("list invites", new Error(error.message));
  }

  return (invites ?? []).map((inv) => ({
    ...inv,
    status: getInviteStatus(inv),
  })) as InviteWithStatus[];
}
