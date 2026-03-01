/**
 * User management service layer.
 *
 * Handles direct user creation with role assignment and role updates with
 * full hierarchy validation.  All operations use the Supabase service-role
 * client and must only be called from trusted server contexts (API routes,
 * Server Actions).
 *
 * Role hierarchy (higher level = more privileged):
 *   Owner (3) > Admin (2) > User (1)
 *
 * Privilege-escalation rules enforced here:
 *   - An actor can only assign roles that are strictly below their own level.
 *   - An actor can only manage (view, change, remove) users with a strictly
 *     lower role level.
 *   - No user can change their own role.
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Capitalized role values used by the API and database layers. */
export type UserRole = "Owner" | "Admin" | "User";

/** Input for creating a new user. */
export interface CreateUserInput {
  email: string;
  name: string;
  /** Initial password – must be ≥ 8 characters. */
  password: string;
  organizationId: string;
}

/** Shape returned after successfully creating a user. */
export interface CreatedUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

/** Shape returned after successfully updating a user's role. */
export interface UpdateRoleResult {
  userId: string;
  previousRole: UserRole;
  newRole: UserRole;
}

export type UserManagementErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "PRIVILEGE_ESCALATION"
  | "USER_NOT_FOUND"
  | "DUPLICATE_EMAIL"
  | "INVALID_ROLE"
  | "INVALID_ORGANIZATION"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

export class UserManagementError extends Error {
  constructor(
    public readonly code: UserManagementErrorCode,
    public readonly userMessage: string,
    public readonly httpStatus: number,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(userMessage);
    this.name = "UserManagementError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Role hierarchy helpers
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set<UserRole>(["Owner", "Admin", "User"]);

const ROLE_LEVELS: Record<UserRole, number> = {
  Owner: 3,
  Admin: 2,
  User: 1,
};

/** Returns true if `role` is a valid UserRole string. */
export function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.has(role as UserRole);
}

/**
 * Returns true if the actor can assign `roleToAssign`.
 * Actors may only assign roles with a strictly lower privilege level than
 * their own — this prevents privilege escalation and accidental ownership
 * transfer (Owners cannot create other Owners).
 */
export function canAssignRole(
  actorRole: UserRole,
  roleToAssign: UserRole
): boolean {
  return ROLE_LEVELS[actorRole] > ROLE_LEVELS[roleToAssign];
}

/**
 * Returns true if the actor can manage (edit role, remove) a target user.
 * Actors can only manage users with a strictly lower privilege level.
 */
export function canManageUser(
  actorRole: UserRole,
  targetRole: UserRole
): boolean {
  return ROLE_LEVELS[actorRole] > ROLE_LEVELS[targetRole];
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

/**
 * Creates a new user within an organization and assigns the requested role.
 *
 * Validates that the requesting actor has permission to assign the requested
 * role before any writes occur.  On partial failure the service rolls back
 * all created records to avoid orphaned data.
 *
 * Steps performed:
 *   1. Validate inputs and role hierarchy.
 *   2. Check for duplicate email.
 *   3. Verify the target organization exists.
 *   4. Create the Supabase Auth user.
 *   5. Insert a record into the `users` table.
 *   6. Insert a record into the `organization_members` table.
 *
 * @throws {UserManagementError} on validation failure or database errors.
 */
export async function createUser(
  input: CreateUserInput,
  role: UserRole,
  actorId: string,
  actorRole: UserRole
): Promise<CreatedUser> {
  const { email, name, password, organizationId } = input;

  // -- Input validation --
  if (!isValidRole(role)) {
    throw new UserManagementError(
      "INVALID_ROLE",
      `"${role}" is not a valid role. Allowed roles are: Owner, Admin, User.`,
      400
    );
  }

  // Privilege-escalation guard: actor cannot create a user at or above their
  // own level.
  if (!canAssignRole(actorRole, role)) {
    throw new UserManagementError(
      "PRIVILEGE_ESCALATION",
      `A ${actorRole} cannot create users with the ${role} role.`,
      403
    );
  }

  const admin = getAdminClient();
  const now = new Date().toISOString();

  // -- Duplicate email check --
  const { data: existingUser, error: emailCheckErr } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (emailCheckErr) {
    throw new UserManagementError(
      "DATABASE_ERROR",
      "Unable to verify email availability. Please try again.",
      503,
      true
    );
  }

  if (existingUser) {
    throw new UserManagementError(
      "DUPLICATE_EMAIL",
      "A user with this email address already exists.",
      409
    );
  }

  // -- Verify organization exists --
  const { data: org, error: orgCheckErr } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgCheckErr) {
    throw new UserManagementError(
      "DATABASE_ERROR",
      "Unable to verify organization. Please try again.",
      503,
      true
    );
  }

  if (!org) {
    throw new UserManagementError(
      "INVALID_ORGANIZATION",
      "Organization not found.",
      404
    );
  }

  // -- Create Supabase Auth user (email pre-confirmed) --
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

  if (authError || !authData?.user) {
    const msg = authError?.message.toLowerCase() ?? "";
    const isDuplicate =
      msg.includes("already registered") ||
      msg.includes("already exists") ||
      msg.includes("user already");

    if (isDuplicate) {
      throw new UserManagementError(
        "DUPLICATE_EMAIL",
        "A user with this email address already exists.",
        409
      );
    }

    throw new UserManagementError(
      "INTERNAL_ERROR",
      "Failed to create user account. Please try again.",
      500,
      true
    );
  }

  const userId = authData.user.id;

  // -- Insert into users table --
  const { error: userInsertErr } = await admin.from("users").insert({
    id: userId,
    email,
    name,
    organization_id: organizationId,
    role,
    created_at: now,
    updated_at: now,
  });

  if (userInsertErr) {
    // Roll back auth user to keep state consistent.
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);

    if (userInsertErr.code === "23505") {
      throw new UserManagementError(
        "DUPLICATE_EMAIL",
        "A user with this email address already exists.",
        409
      );
    }

    throw new UserManagementError(
      "DATABASE_ERROR",
      "Failed to create user profile. Please try again.",
      503,
      true
    );
  }

  // -- Insert into organization_members table --
  const { error: memberInsertErr } = await admin
    .from("organization_members")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      organization_id: organizationId,
      role,
      created_at: now,
    });

  if (memberInsertErr) {
    // Roll back users record and auth user.
    await admin.from("users").delete().eq("id", userId).catch(() => undefined);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);

    throw new UserManagementError(
      "DATABASE_ERROR",
      "Failed to add user to organization. Please try again.",
      503,
      true
    );
  }

  console.info(
    JSON.stringify({
      ts: now,
      service: "user-management",
      event: "user_created",
      userId,
      role,
      organizationId,
      actorId,
    })
  );

  return { userId, email, name, role, organizationId };
}

// ---------------------------------------------------------------------------
// updateUserRole
// ---------------------------------------------------------------------------

/**
 * Updates a user's role within an organization with full hierarchy validation.
 *
 * Enforces the following rules:
 *   - The requesting user cannot change their own role.
 *   - The requesting user must outrank the target's current role.
 *   - The requesting user cannot assign a role equal to or above their own
 *     (privilege-escalation prevention).
 *
 * Updates both the `users` table and `organization_members` table.
 * The `profiles` table is synced on a best-effort basis.
 *
 * @param userId             - The auth user ID of the user to update.
 * @param newRole            - The role to assign.
 * @param requestingUserId   - Auth user ID of the actor making the request.
 * @param requestingUserRole - Current role of the actor.
 * @param organizationId     - Organization scope for the operation.
 *
 * @throws {UserManagementError} on validation failure or database errors.
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole,
  requestingUserId: string,
  requestingUserRole: UserRole,
  organizationId: string
): Promise<UpdateRoleResult> {
  if (!isValidRole(newRole)) {
    throw new UserManagementError(
      "INVALID_ROLE",
      `"${newRole}" is not a valid role. Allowed roles are: Owner, Admin, User.`,
      400
    );
  }

  if (requestingUserId === userId) {
    throw new UserManagementError(
      "FORBIDDEN",
      "You cannot change your own role.",
      403
    );
  }

  const admin = getAdminClient();

  // -- Fetch target's current role (within the same org for isolation) --
  const { data: targetUser, error: fetchErr } = await admin
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (fetchErr) {
    throw new UserManagementError(
      "DATABASE_ERROR",
      "Failed to fetch user. Please try again.",
      503,
      true
    );
  }

  if (!targetUser) {
    throw new UserManagementError(
      "USER_NOT_FOUND",
      "User not found in this organization.",
      404
    );
  }

  const currentRole = targetUser.role as UserRole;

  if (!isValidRole(currentRole)) {
    throw new UserManagementError(
      "INVALID_ROLE",
      "Target user has an unrecognised role.",
      400
    );
  }

  // -- Role hierarchy checks --
  if (!canManageUser(requestingUserRole, currentRole)) {
    throw new UserManagementError(
      "FORBIDDEN",
      `A ${requestingUserRole} cannot manage users with the ${currentRole} role.`,
      403
    );
  }

  if (!canAssignRole(requestingUserRole, newRole)) {
    throw new UserManagementError(
      "PRIVILEGE_ESCALATION",
      `A ${requestingUserRole} cannot assign the ${newRole} role.`,
      403
    );
  }

  const now = new Date().toISOString();

  // -- Update users table --
  const { error: updateUserErr } = await admin
    .from("users")
    .update({ role: newRole, updated_at: now })
    .eq("id", userId)
    .eq("organization_id", organizationId);

  if (updateUserErr) {
    throw new UserManagementError(
      "DATABASE_ERROR",
      "Failed to update user role. Please try again.",
      503,
      true
    );
  }

  // -- Sync organization_members table (best-effort) --
  await admin
    .from("organization_members")
    .update({ role: newRole })
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .catch((err: unknown) =>
      console.warn(
        JSON.stringify({
          ts: now,
          service: "user-management",
          event: "org_member_role_sync_failed",
          userId,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    );

  // -- Sync profiles table (best-effort; profiles store lowercase roles) --
  await admin
    .from("profiles")
    .update({ role: newRole.toLowerCase() })
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .catch((err: unknown) =>
      console.warn(
        JSON.stringify({
          ts: now,
          service: "user-management",
          event: "profile_role_sync_failed",
          userId,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    );

  console.info(
    JSON.stringify({
      ts: now,
      service: "user-management",
      event: "user_role_updated",
      userId,
      previousRole: currentRole,
      newRole,
      organizationId,
      requestingUserId,
    })
  );

  return { userId, previousRole: currentRole, newRole };
}
