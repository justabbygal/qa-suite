-- Migration: create_modules_table
-- Creates the modules table for the dynamic module registration system.
-- Each row represents a module registered for a specific organization,
-- storing its display metadata and linking to the module_permissions table
-- via the (organization_id, module_key) composite key.

-- ---------------------------------------------------------------------------
-- modules table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS modules (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key       TEXT        NOT NULL,
  display_name     TEXT        NOT NULL,
  has_settings     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One registration per module per organization.
  CONSTRAINT modules_unique_org_module
    UNIQUE (organization_id, module_key),

  -- module_key must be a non-empty kebab-case slug.
  CONSTRAINT modules_module_key_format
    CHECK (module_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- display_name must be non-empty.
  CONSTRAINT modules_display_name_nonempty
    CHECK (length(trim(display_name)) > 0)
);

-- Auto-update updated_at on every write.
-- Reuses set_updated_at() created by the permission_management migration.
-- If that migration hasn't run yet the function is created here as a fallback.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS modules_set_updated_at ON modules;
CREATE TRIGGER modules_set_updated_at
  BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary access pattern: look up all modules for an organization.
CREATE INDEX IF NOT EXISTS idx_modules_org_id
  ON modules(organization_id);

-- Lookup a specific module registration by org + key (used for upserts).
CREATE INDEX IF NOT EXISTS idx_modules_org_module_key
  ON modules(organization_id, module_key);
