-- Migration: user_profiles
-- Creates the profiles table for storing user profile data within an
-- organization, plus a Supabase Storage bucket for avatar images.
--
-- Table name: profiles
-- Storage bucket: avatars (path: {organization_id}/{user_id}/avatar-{ts}.{ext})

-- ---------------------------------------------------------------------------
-- profiles table
-- ---------------------------------------------------------------------------
-- One row per (organization_id, user_id) pair.  user_id references the Better
-- Auth `user` table; organization_id references the Better Auth `organization`
-- table.  Both FK constraints are declared WITHOUT the REFERENCES clause here
-- because Better Auth manages those tables in its own schema migrations — the
-- application layer enforces referential integrity at the service layer.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL,
  user_id          TEXT        NOT NULL,
  display_name     TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 100),
  email            TEXT        NOT NULL,
  bio              TEXT                 CHECK (bio IS NULL OR char_length(bio) <= 500),
  avatar_url       TEXT,
  job_title        TEXT,
  department       TEXT,
  phone            TEXT,
  timezone         TEXT        NOT NULL DEFAULT 'UTC',
  role             TEXT        NOT NULL DEFAULT 'User'
                               CHECK (role IN ('Owner', 'Admin', 'User')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One profile per user per organisation.
  CONSTRAINT profiles_unique_user_org UNIQUE (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Auto-update updated_at
-- ---------------------------------------------------------------------------

-- Re-use set_updated_at() if it already exists (defined in the permissions
-- migration); otherwise create it here.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary query: list all profiles in an org (directory view).
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON profiles(organization_id);

-- Look up a single profile by user identity within an org.
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
  ON profiles(organization_id, user_id);

-- Full-text-style filters used by the directory search.
CREATE INDEX IF NOT EXISTS idx_profiles_display_name
  ON profiles(organization_id, lower(display_name));

CREATE INDEX IF NOT EXISTS idx_profiles_department
  ON profiles(organization_id, department)
  WHERE department IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row-Level Security (RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read any profile that belongs to their organisation.
-- auth.uid() returns the UUID of the currently-authenticated user.
-- The profiles.user_id column stores the Better Auth user ID (TEXT), so we
-- cast auth.uid() to TEXT for the sub-query that resolves the caller's org.
CREATE POLICY profiles_select_own_org ON profiles
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (
      SELECT p2.organization_id
      FROM   profiles p2
      WHERE  p2.user_id = auth.uid()::TEXT
      LIMIT  1
    )
  );

-- Authenticated users can insert their own profile row.
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::TEXT);

-- Authenticated users can update only their own profile row.
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE
  TO authenticated
  USING     (user_id = auth.uid()::TEXT)
  WITH CHECK (user_id = auth.uid()::TEXT);

-- Deletion is restricted to service-role (admin) operations only.
-- No DELETE policy is granted to authenticated users.

-- Allow the service role (used by server-side Next.js routes) to bypass RLS.
-- Supabase service-role key automatically bypasses RLS, so no extra policy
-- is needed — this comment documents the intent.
