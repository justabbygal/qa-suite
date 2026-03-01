-- Schema: Permission Management
-- Tables for the two-layer permission system (feature + settings access)
-- and a dedicated audit log for permission changes.
--
-- NOTE: For deployment, apply this via Supabase migrations.
-- Reference migration: supabase/migrations/20260301000001_permission_management.sql

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE permission_role AS ENUM ('owner', 'admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE permission_level AS ENUM ('feature_access', 'settings_access');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- module_permissions table
-- Stores the effective two-layer permission for each org + module + role
-- combination.  One row per (organization_id, module, role) triplet.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS module_permissions (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL,
  module           TEXT        NOT NULL,
  role             permission_role NOT NULL,
  feature_access   BOOLEAN     NOT NULL DEFAULT FALSE,
  settings_access  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per org + module + role triplet.
  CONSTRAINT module_permissions_unique_scope
    UNIQUE (organization_id, module, role),

  -- Settings access is only meaningful when feature access is granted.
  -- Prevents the invalid state: feature_access=false, settings_access=true.
  CONSTRAINT module_permissions_settings_requires_feature
    CHECK (NOT (settings_access = TRUE AND feature_access = FALSE))
);

-- Keep updated_at current on every row modification.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS module_permissions_set_updated_at ON module_permissions;
CREATE TRIGGER module_permissions_set_updated_at
  BEFORE UPDATE ON module_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes: module_permissions
-- ---------------------------------------------------------------------------

-- Primary query pattern: look up all permissions for an org.
CREATE INDEX IF NOT EXISTS idx_module_permissions_org_id
  ON module_permissions(organization_id);

-- Secondary query pattern: look up all permissions for an org + role pair
-- (e.g. "what can admins do in this org?").
CREATE INDEX IF NOT EXISTS idx_module_permissions_org_role
  ON module_permissions(organization_id, role);

-- Tertiary query pattern: look up all permissions for a specific module
-- across all roles (e.g. render the permission toggle row for a module).
CREATE INDEX IF NOT EXISTS idx_module_permissions_org_module
  ON module_permissions(organization_id, module);

-- ---------------------------------------------------------------------------
-- permission_audit_log table
-- Immutable append-only log capturing every individual permission toggle.
-- One row per changed boolean field (feature_access OR settings_access).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permission_audit_log (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL,
  module           TEXT        NOT NULL,
  role             permission_role NOT NULL,
  actor_id         TEXT        NOT NULL,
  actor_email      TEXT        NOT NULL,
  actor_name       TEXT        NOT NULL,
  changed_field    permission_level NOT NULL,
  previous_value   BOOLEAN     NOT NULL,
  new_value        BOOLEAN     NOT NULL,
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes: permission_audit_log
-- ---------------------------------------------------------------------------

-- Primary query pattern: show audit history for an org (timeline view).
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_id
  ON permission_audit_log(organization_id);

-- Sort/filter by time within an org (most recent first).
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_created_at
  ON permission_audit_log(organization_id, created_at DESC);

-- Filter by actor (e.g. "what did this admin change?").
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_actor
  ON permission_audit_log(organization_id, actor_id);

-- Filter by module + role (e.g. "full history for integrations / admin").
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_module_role
  ON permission_audit_log(organization_id, module, role);
