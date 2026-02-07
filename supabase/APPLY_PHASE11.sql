-- ============================================================================
-- APPLY PHASE 11 ONLY
-- For databases that already have 30 migrations applied
-- ============================================================================

BEGIN;

-- ============================================================================
-- Phase 11: Login Attempts Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at DESC);

-- RLS: only service role can access
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup function
CREATE OR REPLACE FUNCTION prune_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '1 hour';
END;
$$;

INSERT INTO public._migration_log (migration_name) 
VALUES ('20260208_phase11_login_attempts_table.sql') 
ON CONFLICT (migration_name) DO NOTHING;

-- Verify
SELECT 'Phase 11 applied successfully!' AS status, COUNT(*) AS total_migrations FROM _migration_log;

COMMIT;
