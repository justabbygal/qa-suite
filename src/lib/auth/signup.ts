/**
 * Server-side owner account creation and organization bootstrap.
 *
 * Performs the full atomic signup flow:
 *  1. Validate there is no duplicate email or organization name.
 *  2. Create the Supabase Auth user (email pre-confirmed so no email gate).
 *  3. Create the organizations record.
 *  4. Create the public users profile record.
 *  5. Create the organization_members record with the "Owner" role.
 *
 * On any failure after the auth user is created, a best-effort rollback
 * removes all partially-created records so the user can retry cleanly.
 *
 * Uses the Supabase service-role key throughout — must only be called from
 * server-side code (API routes, Server Actions, etc.).
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}

export interface SignupSuccess {
  userId: string;
  organizationId: string;
}

export type SignupErrorCode =
  | "DUPLICATE_EMAIL"
  | "DUPLICATE_ORG"
  | "VALIDATION_ERROR"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

export class SignupError extends Error {
  constructor(
    public readonly code: SignupErrorCode,
    public readonly userMessage: string,
    public readonly fieldErrors?: { field: string; message: string }[],
    public readonly retryable: boolean = false
  ) {
    super(userMessage);
    this.name = "SignupError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Converts an org name to a URL-safe slug. */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** Returns true if the Supabase Auth error message indicates a duplicate email. */
function isDuplicateAuthEmail(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("already exists") ||
    lower.includes("user already")
  );
}

// ---------------------------------------------------------------------------
// Rollback helpers
// ---------------------------------------------------------------------------

async function rollbackOrgMember(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  orgId: string
): Promise<void> {
  await admin
    .from("organization_members")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", orgId);
}

async function rollbackUserProfile(
  admin: ReturnType<typeof getAdminClient>,
  userId: string
): Promise<void> {
  await admin.from("users").delete().eq("id", userId);
}

async function rollbackOrganization(
  admin: ReturnType<typeof getAdminClient>,
  orgId: string
): Promise<void> {
  await admin.from("organizations").delete().eq("id", orgId);
}

async function rollbackAuthUser(
  admin: ReturnType<typeof getAdminClient>,
  userId: string
): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Creates a new owner account and bootstraps their organization.
 *
 * All operations use the Supabase service-role client and must be called
 * from a trusted server context only.
 *
 * @throws {SignupError} for expected failures (duplicate email/org, DB errors)
 */
export async function performSignup(
  input: SignupInput
): Promise<SignupSuccess> {
  const { name, email, password, organizationName } = input;
  const admin = getAdminClient();

  // ------------------------------------------------------------------
  // 1. Duplicate-email pre-check (public users table)
  // ------------------------------------------------------------------
  const { data: existingUser, error: emailCheckErr } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (emailCheckErr) {
    throw new SignupError(
      "DATABASE_ERROR",
      "Unable to verify email availability. Please try again.",
      undefined,
      true
    );
  }

  if (existingUser) {
    throw new SignupError(
      "DUPLICATE_EMAIL",
      "An account with this email address already exists."
    );
  }

  // ------------------------------------------------------------------
  // 2. Duplicate-org pre-check
  // ------------------------------------------------------------------
  const { data: existingOrg, error: orgCheckErr } = await admin
    .from("organizations")
    .select("id")
    .eq("name", organizationName)
    .maybeSingle();

  if (orgCheckErr) {
    throw new SignupError(
      "DATABASE_ERROR",
      "Unable to verify organization name availability. Please try again.",
      undefined,
      true
    );
  }

  if (existingOrg) {
    throw new SignupError(
      "DUPLICATE_ORG",
      "An organization with this name already exists."
    );
  }

  // ------------------------------------------------------------------
  // 3. Create Supabase Auth user (email pre-confirmed)
  // ------------------------------------------------------------------
  const { data: authData, error: authError } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    }
  );

  if (authError || !authData?.user) {
    if (authError && isDuplicateAuthEmail(authError.message)) {
      throw new SignupError(
        "DUPLICATE_EMAIL",
        "An account with this email address already exists."
      );
    }
    throw new SignupError(
      "INTERNAL_ERROR",
      "Failed to create account. Please try again.",
      undefined,
      true
    );
  }

  const userId = authData.user.id;
  const orgId = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = toSlug(organizationName);

  // ------------------------------------------------------------------
  // 4. Create organization record
  // ------------------------------------------------------------------
  const { error: orgInsertErr } = await admin.from("organizations").insert({
    id: orgId,
    name: organizationName,
    slug,
    owner_id: userId,
    created_at: now,
    updated_at: now,
  });

  if (orgInsertErr) {
    await rollbackAuthUser(admin, userId);

    // Postgres unique-violation code
    if (orgInsertErr.code === "23505") {
      throw new SignupError(
        "DUPLICATE_ORG",
        "An organization with this name already exists."
      );
    }
    throw new SignupError(
      "DATABASE_ERROR",
      "Failed to create organization. Please try again.",
      undefined,
      true
    );
  }

  // ------------------------------------------------------------------
  // 5. Create public user profile
  // ------------------------------------------------------------------
  const { error: userInsertErr } = await admin.from("users").insert({
    id: userId,
    email,
    name,
    organization_id: orgId,
    role: "Owner",
    created_at: now,
    updated_at: now,
  });

  if (userInsertErr) {
    await rollbackOrganization(admin, orgId);
    await rollbackAuthUser(admin, userId);

    if (userInsertErr.code === "23505") {
      throw new SignupError(
        "DUPLICATE_EMAIL",
        "An account with this email address already exists."
      );
    }
    throw new SignupError(
      "DATABASE_ERROR",
      "Failed to create user profile. Please try again.",
      undefined,
      true
    );
  }

  // ------------------------------------------------------------------
  // 6. Create organization membership (Owner role)
  // ------------------------------------------------------------------
  const { error: memberInsertErr } = await admin
    .from("organization_members")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      organization_id: orgId,
      role: "Owner",
      created_at: now,
    });

  if (memberInsertErr) {
    await rollbackUserProfile(admin, userId);
    await rollbackOrganization(admin, orgId);
    await rollbackAuthUser(admin, userId);

    throw new SignupError(
      "DATABASE_ERROR",
      "Failed to set up organization membership. Please try again.",
      undefined,
      true
    );
  }

  return { userId, organizationId: orgId };
}
