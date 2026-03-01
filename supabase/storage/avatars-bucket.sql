-- Storage: avatars bucket
-- Creates the Supabase Storage bucket used for user profile avatar images and
-- sets the access policies so that:
--   - Authenticated users can READ any object whose path starts with their
--     organisation's folder ({organization_id}/**).
--   - Authenticated users can INSERT (upload) objects only into their own
--     user folder ({organization_id}/{user_id}/**).
--   - Authenticated users can DELETE their own objects for replacement /
--     cleanup (the API route handles this server-side via service role, but
--     the policy is included for completeness).
--   - All other access is denied.
--
-- Path convention enforced by application code:
--   {organization_id}/{user_id}/avatar-{timestamp}.{ext}
--   {organization_id}/{user_id}/avatar-thumb-{timestamp}.webp
--
-- Apply via:  psql $DATABASE_URL -f supabase/storage/avatars-bucket.sql
-- Or paste into the Supabase Dashboard → SQL Editor.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  -- public = true so getPublicUrl() returns a usable URL without signed tokens.
  -- The folder-scoped policies below still control who may write.
  true,
  5242880,   -- 5 MB per file
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
-- Supabase storage policies target the storage.objects table.
-- `name` in storage.objects is the full object path (e.g.
-- "org-uuid/user-id/avatar-1700000000000.jpg").
-- ---------------------------------------------------------------------------

-- 1. SELECT: authenticated users may read any object in their org's folder.
--    We identify the caller's org by looking up their profile row.
DROP POLICY IF EXISTS avatars_select_own_org ON storage.objects;
CREATE POLICY avatars_select_own_org ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (
      SELECT p.organization_id::TEXT
      FROM   profiles p
      WHERE  p.user_id = auth.uid()::TEXT
      LIMIT  1
    )
  );

-- 2. INSERT: authenticated users may upload only into their own user folder.
--    Path must start with "{their_org_id}/{their_user_id}/".
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (
      SELECT p.organization_id::TEXT
      FROM   profiles p
      WHERE  p.user_id = auth.uid()::TEXT
      LIMIT  1
    )
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
  );

-- 3. DELETE: authenticated users may delete their own avatar objects.
--    (Server-side cleanup uses the service-role key, but this policy allows
--    the client to perform it directly if needed.)
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (
      SELECT p.organization_id::TEXT
      FROM   profiles p
      WHERE  p.user_id = auth.uid()::TEXT
      LIMIT  1
    )
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
  );
