-- Migration: users_schema
-- Creates the foundational user management tables: users and invitations.
--
-- Note: organization_id references the organizations table managed by
-- Better Auth's Organization plugin. No FK constraint is added here to
-- allow this migration to run independently of the Better Auth schema.
-- All writes to these tables go through server-side API routes using the
-- service-role client (which bypasses RLS). RLS is enabled as defense-in-depth
-- for any direct client queries.

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('Owner', 'Admin', 'User');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'invited', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- users table
-- One row per user per organization. id matches the auth provider's user id.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id               UUID        NOT NULL PRIMARY KEY,
  organization_id  UUID        NOT NULL,
  email            TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  role             user_role   NOT NULL DEFAULT 'User',
  status           user_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One user record per email per organization.
  CONSTRAINT users_email_org_unique UNIQUE (email, organization_id)
);

-- Auto-update updated_at on every write.
-- Guard against the function already existing from a prior migration.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes: users
-- Primary: fetch all members of an org.
CREATE INDEX IF NOT EXISTS idx_users_org_id
  ON users(organization_id);

-- Lookup by email within an org (duplicate-email check, login resolution).
CREATE INDEX IF NOT EXISTS idx_users_org_email
  ON users(organization_id, email);

-- Filter org members by role (e.g. list all admins).
CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users(organization_id, role);

-- Filter org members by status (e.g. list pending/active users).
CREATE INDEX IF NOT EXISTS idx_users_org_status
  ON users(organization_id, status);

-- ---------------------------------------------------------------------------
-- invitations table
-- Tracks pending and historical invitations per organization.
-- Tokens are single-use and expire after 7 days.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invitations (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL,
  email            TEXT        NOT NULL,
  role             user_role   NOT NULL,
  invited_by       TEXT        NOT NULL,   -- auth user ID of the inviting user
  token            TEXT        NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,            -- NULL = not yet accepted
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes: invitations
-- Primary: fetch all invitations for an org.
CREATE INDEX IF NOT EXISTS idx_invitations_org_id
  ON invitations(organization_id);

-- Lookup by email within an org (duplicate-invite check).
CREATE INDEX IF NOT EXISTS idx_invitations_org_email
  ON invitations(organization_id, email);

-- Token lookup (invite acceptance flow).
CREATE INDEX IF NOT EXISTS idx_invitations_token
  ON invitations(token);

-- Filter active (non-expired, non-accepted) invitations.
CREATE INDEX IF NOT EXISTS idx_invitations_org_pending
  ON invitations(organization_id, expires_at)
  WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security: users
-- Prevents cross-organization data access for any direct (non-service-role)
-- client queries. Service-role bypasses RLS entirely.
-- ---------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- A user may read any member of an organization they belong to.
CREATE POLICY users_select_own_org ON users
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users AS u
      WHERE u.id = auth.uid()
    )
  );

-- Inserts, updates, and deletes are performed exclusively via the service-role
-- client from API routes. These permissive policies ensure that no direct
-- client path is silently blocked while keeping RLS active.
CREATE POLICY users_insert_server ON users
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY users_update_server ON users
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY users_delete_server ON users
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Row Level Security: invitations
-- ---------------------------------------------------------------------------

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- A user may read invitations for any organization they are a member of.
CREATE POLICY invitations_select_own_org ON invitations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid()
    )
  );

CREATE POLICY invitations_insert_server ON invitations
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY invitations_update_server ON invitations
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY invitations_delete_server ON invitations
  FOR DELETE
  USING (auth.role() = 'service_role');
