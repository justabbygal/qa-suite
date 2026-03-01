-- Migration: 001_initial_schema
-- Creates Better Auth core auth tables and the organizations table.
--
-- Run order: this migration runs AFTER 001_create_users_schema.sql
-- (alphabetically: 'c' < 'i').  The users and invitations tables are already
-- created by 001_create_users_schema.sql; this migration adds the auth
-- infrastructure those tables depend on.
--
-- Better Auth default name → project table name:
--   user         → auth_user          (avoids PostgreSQL reserved word; separate from app "users")
--   session      → sessions
--   account      → accounts
--   verification → verifications
--   organization → organizations      (organization plugin)
--   member       → organization_members  (organization plugin)
--   invitation   → org_invitations    (organization plugin; separate from app "invitations")
--
-- All columns use snake_case; Better Auth is configured with field mappings
-- in src/lib/auth.ts to translate camelCase ↔ snake_case automatically.

-- ---------------------------------------------------------------------------
-- organizations
-- Better Auth organization plugin table (custom name: "organizations").
-- Referenced by users.organization_id (no FK constraint there; see
-- 001_create_users_schema.sql for rationale).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  slug        TEXT        UNIQUE,
  logo        TEXT,
  -- owner_id is set via the organizationCreatedHook in auth.ts after creation.
  owner_id    UUID,
  metadata    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug
  ON organizations(slug);

-- ---------------------------------------------------------------------------
-- auth_user
-- Better Auth core user table (custom name: "auth_user").
-- Stores authentication identity only; application profile data lives in
-- the "users" table (001_create_users_schema.sql) with a matching id.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_user (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT        NOT NULL,
  email          TEXT        NOT NULL UNIQUE,
  email_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  image          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_user_email
  ON auth_user(email);

-- ---------------------------------------------------------------------------
-- sessions
-- Better Auth session table (custom name: "sessions").
-- active_organization_id supports the org plugin's multi-org switching.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id                       UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expires_at               TIMESTAMPTZ NOT NULL,
  token                    TEXT        NOT NULL UNIQUE,
  ip_address               TEXT,
  user_agent               TEXT,
  user_id                  UUID        NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  active_organization_id   UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token
  ON sessions(token);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions(user_id);

-- ---------------------------------------------------------------------------
-- accounts
-- Better Auth account table (custom name: "accounts").
-- Stores credentials and OAuth tokens per provider per user.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts (
  id                          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id                  TEXT        NOT NULL,
  provider_id                 TEXT        NOT NULL,
  user_id                     UUID        NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token                TEXT,
  refresh_token               TEXT,
  id_token                    TEXT,
  access_token_expires_at     TIMESTAMPTZ,
  refresh_token_expires_at    TIMESTAMPTZ,
  scope                       TEXT,
  password                    TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT accounts_unique_provider
    UNIQUE (provider_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON accounts(user_id);

-- ---------------------------------------------------------------------------
-- verifications
-- Better Auth verification token table (custom name: "verifications").
-- Used for email verification, password reset, and magic links.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS verifications (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier  TEXT        NOT NULL,
  value       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_verifications_identifier
  ON verifications(identifier);

-- ---------------------------------------------------------------------------
-- organization_members
-- Better Auth organization plugin member table (custom name: "organization_members").
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_members (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL DEFAULT 'member',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT organization_members_unique
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id
  ON organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON organization_members(user_id);

-- ---------------------------------------------------------------------------
-- org_invitations
-- Better Auth organization plugin invitation table (custom name: "org_invitations").
-- Separate from the application-level "invitations" table which uses signed
-- tokens for the custom invite-acceptance flow.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS org_invitations (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL,
  role             TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending',
  expires_at       TIMESTAMPTZ NOT NULL,
  inviter_id       UUID        NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id
  ON org_invitations(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email
  ON org_invitations(email);

-- ---------------------------------------------------------------------------
-- updated_at trigger function
-- Guard with CREATE OR REPLACE; 001_create_users_schema.sql also defines
-- this function and may run before or after this migration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_set_updated_at ON organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS auth_user_set_updated_at ON auth_user;
CREATE TRIGGER auth_user_set_updated_at
  BEFORE UPDATE ON auth_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS sessions_set_updated_at ON sessions;
CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS accounts_set_updated_at ON accounts;
CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
