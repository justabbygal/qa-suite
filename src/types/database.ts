/**
 * TypeScript types for the Supabase database schema.
 *
 * Mirrors all tables defined across:
 *   supabase/migrations/001_create_users_schema.sql     (users, invitations)
 *   supabase/migrations/001_initial_schema.sql          (organizations, auth_user, sessions, accounts, verifications, organization_members, org_invitations)
 *   supabase/migrations/20260301000001_permission_management.sql
 *   supabase/migrations/20260301000002_user_profiles.sql
 *
 * Usage with Supabase client:
 *   import { createClient } from "@supabase/supabase-js";
 *   import type { Database } from "@/types/database";
 *   const supabase = createClient<Database>(url, key);
 */

// ---------------------------------------------------------------------------
// Enum / union types
// ---------------------------------------------------------------------------

/** Application-level user role (capitalized, used in UI and module system). */
export type UserRole = "Owner" | "Admin" | "User";

/** User account status. */
export type UserStatus = "active" | "invited" | "expired";

/** Role used by the Better Auth organization plugin member table. */
export type OrgMemberRole = "owner" | "admin" | "member";

/** Lowercase role used by the permission service and permission tables. */
export type PermissionRole = "owner" | "admin" | "user";

/** Permission level for the two-layer access control system. */
export type PermissionLevel = "feature_access" | "settings_access";

/** Invitation lifecycle status (derived from expires_at / used_at). */
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

// ---------------------------------------------------------------------------
// Application table row types
// ---------------------------------------------------------------------------

/**
 * Application user profile (001_create_users_schema.sql).
 * id matches the Better Auth auth_user.id for the same person.
 */
export interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

/**
 * App-level invitations (001_create_users_schema.sql).
 * Separate from Better Auth's org_invitations table; uses a signed token for
 * the accept-invite flow.
 */
export interface InvitationRow {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/** Extended user profile (20260301000002_user_profiles.sql). */
export interface ProfileRow {
  id: string;
  organization_id: string;
  user_id: string;
  display_name: string;
  email: string;
  bio: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  timezone: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ModulePermissionRow {
  id: string;
  organization_id: string;
  module: string;
  role: PermissionRole;
  feature_access: boolean;
  settings_access: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermissionAuditLogRow {
  id: string;
  organization_id: string;
  module: string;
  role: PermissionRole;
  actor_id: string;
  actor_email: string;
  actor_name: string;
  changed_field: PermissionLevel;
  previous_value: boolean;
  new_value: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Better Auth table row types (001_initial_schema.sql)
// ---------------------------------------------------------------------------

/**
 * Better Auth core organization table (org plugin, custom name "organizations").
 * The application's organization_id columns reference this table's id.
 */
export interface OrganizationRow {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  owner_id: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Better Auth core user table (custom name "auth_user").
 * Separate from the app `users` table; stores auth identity data only.
 * The app `users.id` corresponds to `auth_user.id` for the same person.
 */
export interface AuthUserRow {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  image: string | null;
  created_at: string;
  updated_at: string;
}

/** Better Auth session (custom name "sessions"). */
export interface SessionRow {
  id: string;
  expires_at: string;
  token: string;
  ip_address: string | null;
  user_agent: string | null;
  user_id: string;
  active_organization_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Better Auth account / credential store (custom name "accounts"). */
export interface AccountRow {
  id: string;
  account_id: string;
  provider_id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  scope: string | null;
  password: string | null;
  created_at: string;
  updated_at: string;
}

/** Better Auth verification token (custom name "verifications"). */
export interface VerificationRow {
  id: string;
  identifier: string;
  value: string;
  expires_at: string;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Better Auth organization member (org plugin, custom name "organization_members").
 * role values: "owner" | "admin" | "member"
 */
export interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  created_at: string;
}

/**
 * Better Auth organization invitation (org plugin, custom name "org_invitations").
 * Separate from the app-level `invitations` table; managed by Better Auth.
 */
export interface OrgInvitationRow {
  id: string;
  organization_id: string;
  email: string;
  role: OrgMemberRole | null;
  status: string;
  expires_at: string;
  inviter_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Insert types
// ---------------------------------------------------------------------------

export type UserInsert = Omit<UserRow, "id" | "created_at" | "updated_at"> &
  Partial<Pick<UserRow, "id" | "created_at" | "updated_at">>;

export type OrganizationInsert = Omit<
  OrganizationRow,
  "id" | "created_at" | "updated_at"
> & Partial<Pick<OrganizationRow, "id" | "created_at" | "updated_at">>;

export type OrganizationMemberInsert = Omit<
  OrganizationMemberRow,
  "id" | "created_at"
> & Partial<Pick<OrganizationMemberRow, "id" | "created_at">>;

export type InvitationInsert = Omit<InvitationRow, "id" | "created_at"> &
  Partial<Pick<InvitationRow, "id" | "created_at">>;

export type ModulePermissionInsert = Omit<
  ModulePermissionRow,
  "id" | "created_at" | "updated_at"
> & Partial<Pick<ModulePermissionRow, "id" | "created_at" | "updated_at">>;

// ---------------------------------------------------------------------------
// Supabase Database type (for createClient<Database>())
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      // Application tables
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: Partial<UserInsert>;
      };
      invitations: {
        Row: InvitationRow;
        Insert: InvitationInsert;
        Update: Partial<InvitationInsert>;
      };
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "id" | "created_at" | "updated_at"> &
          Partial<Pick<ProfileRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<ProfileRow>;
      };
      module_permissions: {
        Row: ModulePermissionRow;
        Insert: ModulePermissionInsert;
        Update: Partial<ModulePermissionInsert>;
      };
      permission_audit_log: {
        Row: PermissionAuditLogRow;
        Insert: Omit<PermissionAuditLogRow, "id" | "created_at"> &
          Partial<Pick<PermissionAuditLogRow, "id" | "created_at">>;
        Update: never; // Append-only audit log
      };
      // Better Auth tables
      organizations: {
        Row: OrganizationRow;
        Insert: OrganizationInsert;
        Update: Partial<OrganizationInsert>;
      };
      auth_user: {
        Row: AuthUserRow;
        Insert: Omit<AuthUserRow, "id" | "created_at" | "updated_at"> &
          Partial<Pick<AuthUserRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<AuthUserRow>;
      };
      sessions: {
        Row: SessionRow;
        Insert: Omit<SessionRow, "id" | "created_at" | "updated_at"> &
          Partial<Pick<SessionRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<SessionRow>;
      };
      accounts: {
        Row: AccountRow;
        Insert: Omit<AccountRow, "id" | "created_at" | "updated_at"> &
          Partial<Pick<AccountRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<AccountRow>;
      };
      verifications: {
        Row: VerificationRow;
        Insert: Omit<VerificationRow, "id"> & Partial<Pick<VerificationRow, "id">>;
        Update: Partial<VerificationRow>;
      };
      organization_members: {
        Row: OrganizationMemberRow;
        Insert: OrganizationMemberInsert;
        Update: Partial<OrganizationMemberInsert>;
      };
      org_invitations: {
        Row: OrgInvitationRow;
        Insert: Omit<OrgInvitationRow, "id" | "created_at"> &
          Partial<Pick<OrgInvitationRow, "id" | "created_at">>;
        Update: Partial<OrgInvitationRow>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      permission_role: PermissionRole;
      permission_level: PermissionLevel;
    };
  };
}
