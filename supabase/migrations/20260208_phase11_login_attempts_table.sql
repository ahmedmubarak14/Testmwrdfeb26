-- Phase 11: Login attempts tracking table for auth-rate-limit edge function
-- Used by supabase/functions/auth-rate-limit to enforce server-side login throttling

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at DESC);

-- RLS: only the service role (edge function) can access this table
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- No client-side access - all access is via the edge function using service_role key
-- The edge function uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS

-- Auto-cleanup: delete attempts older than 1 hour to keep table lean
-- (The edge function also prunes on each write, but this is a safety net)
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

COMMENT ON TABLE login_attempts IS 'Tracks failed login attempts for server-side rate limiting via auth-rate-limit edge function';
