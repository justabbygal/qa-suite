-- Migration: permission_management
-- Creates the module_permissions and permission_audit_log tables for the
-- two-layer permission system (feature access + settings access).

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

  CONSTRAINT module_permissions_unique_scope
    UNIQUE (organization_id, module, role),

  -- Disallow the invalid state: feature_access=false AND settings_access=true.
  CONSTRAINT module_permissions_settings_requires_feature
    CHECK (NOT (settings_access = TRUE AND feature_access = FALSE))
);

-- Auto-update updated_at on every write.
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

CREATE INDEX IF NOT EXISTS idx_module_permissions_org_id
  ON module_permissions(organization_id);

CREATE INDEX IF NOT EXISTS idx_module_permissions_org_role
  ON module_permissions(organization_id, role);

CREATE INDEX IF NOT EXISTS idx_module_permissions_org_module
  ON module_permissions(organization_id, module);

-- ---------------------------------------------------------------------------
-- permission_audit_log table
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

CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_id
  ON permission_audit_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_created_at
  ON permission_audit_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_permission_audit_log_actor
  ON permission_audit_log(organization_id, actor_id);

CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_module_role
  ON permission_audit_log(organization_id, module, role);
