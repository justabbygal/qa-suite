-- Migration: Create automated cleanup job for expired invitations
-- Requires the pg_cron extension. In Supabase, enable it via:
--   Dashboard > Database > Extensions > pg_cron
-- or run the CREATE EXTENSION line as a superuser before applying this migration.

-- ============================================================
-- 1. Enable pg_cron extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Allow the postgres role (used by cron jobs) to access the cron schema
GRANT USAGE ON SCHEMA cron TO postgres;

-- ============================================================
-- 2. Performance index for cleanup queries
--    Filters on (status, expires_at) in all cleanup operations.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invitation_status_expires_at
  ON invitation (status, expires_at)
  WHERE status IN ('pending', 'expired');

-- ============================================================
-- 3. Cleanup function
--
-- Behaviour (runs in a single transaction):
--   a) UPDATE pending invitations whose expires_at has passed → 'expired'
--   b) DELETE all invitations in 'expired' status
--   c) INSERT one audit_logs row summarising the run
--   d) RETURN a JSON summary: { newly_expired, deleted, cleaned_at }
--
-- The two-step update-then-delete approach ensures every deleted
-- invitation was first marked 'expired', providing a clear audit trail
-- even if the function is interrupted mid-run.
--
-- SECURITY DEFINER lets the function execute with the privileges of
-- its owner (postgres) so it can bypass RLS on the invitation table.
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_newly_expired INTEGER := 0;
  v_deleted       INTEGER := 0;
  v_result        jsonb;
BEGIN
  -- Step 1: Transition pending invitations that have passed their expiry
  --         to 'expired' status so they appear correctly in the audit trail
  --         even if this function is interrupted before Step 2.
  UPDATE invitation
  SET    status = 'expired'
  WHERE  status = 'pending'
    AND  expires_at < NOW();

  GET DIAGNOSTICS v_newly_expired = ROW_COUNT;

  -- Step 2: Delete all invitations currently in 'expired' status.
  --         This covers both invitations just transitioned above and
  --         any that were already marked 'expired' in prior runs but
  --         not yet removed (e.g., after a failed deletion).
  DELETE FROM invitation
  WHERE  status = 'expired'
    AND  expires_at < NOW();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  v_result := jsonb_build_object(
    'newly_expired', v_newly_expired,
    'deleted',       v_deleted,
    'cleaned_at',    NOW()
  );

  -- Step 3: Write one audit log entry per run regardless of whether any
  --         rows were affected, so operators can verify the job is running.
  INSERT INTO audit_logs (
    id,
    organization_id,
    actor_id,
    actor_email,
    actor_name,
    action,
    resource_type,
    resource_id,
    resource_name,
    changes,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    'system',
    'system',
    'system@internal',
    'Automated Cleanup',
    'invite_cleanup',
    'invitation',
    'batch',
    'Expired Invitation Cleanup',
    jsonb_build_object(
      'cleanup_summary', jsonb_build_object(
        'before', NULL::jsonb,
        'after',  v_result
      )
    ),
    NULL,
    'pg_cron/cleanup_expired_invitations',
    NOW()
  );

  RETURN v_result;
END;
$$;

-- Allow the service role (used by Next.js API routes) to call this function
-- so the manual-trigger endpoint can invoke the same logic as the cron job.
GRANT EXECUTE ON FUNCTION cleanup_expired_invitations() TO service_role;

-- ============================================================
-- 4. Schedule the cron job
--
-- Runs daily at 02:00 UTC. The unschedule block makes this
-- migration idempotent — safe to re-run without creating
-- duplicate jobs.
-- ============================================================
DO $$
BEGIN
  -- Remove existing job if present (idempotency)
  PERFORM cron.unschedule('cleanup-expired-invitations')
  FROM    cron.job
  WHERE   jobname = 'cleanup-expired-invitations';
EXCEPTION WHEN OTHERS THEN
  -- cron.job table may not exist yet on first run; ignore
  NULL;
END;
$$;

SELECT cron.schedule(
  'cleanup-expired-invitations',  -- unique job name
  '0 2 * * *',                    -- daily at 02:00 UTC
  $$SELECT cleanup_expired_invitations()$$
);
