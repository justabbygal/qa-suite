-- Migration: 20260301000004_create_permissions_tables
-- Establishes the complete permissions schema with Row Level Security.
--
-- Tables created or augmented:
--   modules              – dynamic module registry per organization
--   module_permissions   – role-level feature/settings access flags
--   permission_audit_log – append-only change log
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS
-- allow this migration to run safely after the earlier partial migrations
-- (20260301000001 and 20260301000003) that created the tables without RLS.

-- ---------------------------------------------------------------------------
-- Enum types (guard against duplicates from prior migrations)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE permission_role AS ENUM ('owner', 'admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE permission_level AS ENUM ('feature_access', 'settings_access');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Shared trigger function (idempotent via CREATE OR REPLACE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- modules table
-- Each row is one module registered for a specific organization, storing
-- display metadata and default role access configuration.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS modules (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key          TEXT        NOT NULL,
  display_name        TEXT        NOT NULL,
  has_settings        BOOLEAN     NOT NULL DEFAULT FALSE,
  default_access_json JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One registration per module per organization.
  CONSTRAINT modules_unique_org_module
    UNIQUE (organization_id, module_key),

  -- module_key must be a non-empty kebab-case slug.
  CONSTRAINT modules_module_key_format
    CHECK (module_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- display_name must be non-empty after trimming whitespace.
  CONSTRAINT modules_display_name_nonempty
    CHECK (length(trim(display_name)) > 0)
);

-- Backfill default_access_json for instances upgraded from migration
-- 20260301000003 which did not include this column.
ALTER TABLE modules
  ADD COLUMN IF NOT EXISTS default_access_json JSONB NOT NULL DEFAULT '{}';

DROP TRIGGER IF EXISTS modules_set_updated_at ON modules;
CREATE TRIGGER modules_set_updated_at
  BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes ------------------------------------------------------------------

-- Primary access pattern: fetch all modules registered for an organization.
CREATE INDEX IF NOT EXISTS idx_modules_org_id
  ON modules(organization_id);

-- Upsert/lookup by composite key (org + module slug).
CREATE INDEX IF NOT EXISTS idx_modules_org_module_key
  ON modules(organization_id, module_key);

-- Row Level Security -------------------------------------------------------

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

-- Authenticated org members can read any module registered for their org.
CREATE POLICY modules_select_own_org ON modules
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- All writes are performed by server-side API routes via the service-role
-- client, which bypasses RLS automatically.
CREATE POLICY modules_insert_server ON modules
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY modules_update_server ON modules
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY modules_delete_server ON modules
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- module_permissions table
-- Stores per-role, per-module access flags for each organization.
-- The two-layer model: feature_access (can use) + settings_access (can config).
-- Business rule: settings_access requires feature_access to be enabled.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS module_permissions (
  id               UUID            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID            NOT NULL,
  module           TEXT            NOT NULL,
  role             permission_role NOT NULL,
  feature_access   BOOLEAN         NOT NULL DEFAULT FALSE,
  settings_access  BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),

  -- Exactly one row per (org, module, role) triple.
  CONSTRAINT module_permissions_unique_scope
    UNIQUE (organization_id, module, role),

  -- Disallow the logically invalid state: settings on without feature on.
  CONSTRAINT module_permissions_settings_requires_feature
    CHECK (NOT (settings_access = TRUE AND feature_access = FALSE))
);

DROP TRIGGER IF EXISTS module_permissions_set_updated_at ON module_permissions;
CREATE TRIGGER module_permissions_set_updated_at
  BEFORE UPDATE ON module_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes ------------------------------------------------------------------

-- All permissions for an organization (main dashboard query).
CREATE INDEX IF NOT EXISTS idx_module_permissions_org_id
  ON module_permissions(organization_id);

-- Permissions for a specific role across all modules in an org.
CREATE INDEX IF NOT EXISTS idx_module_permissions_org_role
  ON module_permissions(organization_id, role);

-- Permissions for a specific module across all roles in an org.
CREATE INDEX IF NOT EXISTS idx_module_permissions_org_module
  ON module_permissions(organization_id, module);

-- Row Level Security -------------------------------------------------------

ALTER TABLE module_permissions ENABLE ROW LEVEL SECURITY;

-- Authenticated org members can read the permission configuration for their org.
-- This allows the UI to display the current state of toggles.
CREATE POLICY module_permissions_select_own_org ON module_permissions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Writes are performed exclusively via service-role API routes.
CREATE POLICY module_permissions_insert_server ON module_permissions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY module_permissions_update_server ON module_permissions
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY module_permissions_delete_server ON module_permissions
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- permission_audit_log table
-- Append-only record of every permission toggle change.
-- Captures actor identity, old/new values, and request metadata.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permission_audit_log (
  id               UUID             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID             NOT NULL,
  module           TEXT             NOT NULL,
  role             permission_role  NOT NULL,
  actor_id         TEXT             NOT NULL,   -- auth user ID of the person making the change
  actor_email      TEXT             NOT NULL,
  actor_name       TEXT             NOT NULL,
  changed_field    permission_level NOT NULL,   -- which toggle was flipped
  previous_value   BOOLEAN          NOT NULL,
  new_value        BOOLEAN          NOT NULL,
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
  -- No updated_at: audit rows are immutable once written.
);

-- Indexes ------------------------------------------------------------------

-- All audit events for an organization.
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_id
  ON permission_audit_log(organization_id);

-- Recent events first (default sort for the audit log UI).
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_created_at
  ON permission_audit_log(organization_id, created_at DESC);

-- Events by actor within an org (filter by who made changes).
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_actor
  ON permission_audit_log(organization_id, actor_id);

-- Events for a specific module+role combination (scoped audit view).
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_module_role
  ON permission_audit_log(organization_id, module, role);

-- Row Level Security -------------------------------------------------------

ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated org members can read the audit log for their organization.
CREATE POLICY permission_audit_log_select_own_org ON permission_audit_log
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Inserts are performed only via service-role API routes.
-- Audit rows are intentionally immutable: no UPDATE or DELETE policies granted.
CREATE POLICY permission_audit_log_insert_server ON permission_audit_log
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
