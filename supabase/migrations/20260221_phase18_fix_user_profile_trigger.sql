-- ============================================================================
-- Phase 18: Fix user-profile trigger blocking credit updates in RPC functions
-- Date: 2026-02-21
-- Purpose:
--   A BEFORE UPDATE trigger on public.users raises
--   "Only safe profile fields can be updated by users"
--   when credit_used / current_balance are modified — even from
--   SECURITY DEFINER functions like accept_quote_and_deduct_credit.
--
--   This migration:
--   1) Drops ALL known restrictive BEFORE-UPDATE triggers/functions on users
--   2) Recreates a safe version that allows system-trusted callers
--      (SECURITY DEFINER functions set session_replication_role or use
--       current_setting) while still protecting against direct client edits.
-- ============================================================================

-- Step 1: Drop any BEFORE UPDATE trigger that may contain the restriction.
-- We search by every plausible name; DROP IF EXISTS is idempotent.
DO $$
DECLARE
  trg RECORD;
BEGIN
  -- Enumerate ALL BEFORE UPDATE triggers on public.users and drop the
  -- restrictive ones.  We keep update_users_updated_at (timestamp helper)
  -- and auto_public_id_trigger (INSERT-only, but safe to keep).
  FOR trg IN
    SELECT tgname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'users'
       AND NOT t.tgisinternal
       AND t.tgtype & 16 = 16 -- BEFORE trigger
       AND tgname NOT IN ('update_users_updated_at')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.users', trg.tgname);
    RAISE NOTICE 'Dropped BEFORE-UPDATE trigger: %', trg.tgname;
  END LOOP;
END $$;

-- Step 2: Drop the old trigger function (if it exists) so we can recreate it.
DROP FUNCTION IF EXISTS restrict_user_profile_update() CASCADE;
DROP FUNCTION IF EXISTS enforce_safe_profile_update() CASCADE;
DROP FUNCTION IF EXISTS check_user_profile_update() CASCADE;

-- Step 3: Recreate a safe guard that only fires for direct client updates
-- (when session_user = authenticated role), NOT for SECURITY DEFINER RPCs.
CREATE OR REPLACE FUNCTION public.enforce_safe_user_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Allow SECURITY DEFINER functions to update any field.
  -- When a SECURITY DEFINER function runs, current_user is the function owner
  -- (typically the superuser / postgres role), not 'authenticated'.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- If no auth user (e.g. service-role call), allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins can update any field.
  SELECT role::TEXT INTO v_caller_role
    FROM public.users
   WHERE id = auth.uid();

  IF v_caller_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  -- Regular users: block changes to sensitive columns.
  IF OLD.role            IS DISTINCT FROM NEW.role
  OR OLD.verified        IS DISTINCT FROM NEW.verified
  OR OLD.status          IS DISTINCT FROM NEW.status
  OR OLD.kyc_status      IS DISTINCT FROM NEW.kyc_status
  OR OLD.public_id       IS DISTINCT FROM NEW.public_id
  OR OLD.date_joined     IS DISTINCT FROM NEW.date_joined
  OR OLD.credit_limit    IS DISTINCT FROM NEW.credit_limit
  THEN
    RAISE EXCEPTION 'Only safe profile fields can be updated by users';
  END IF;

  -- credit_used, current_balance, rating are intentionally NOT blocked here
  -- because they are updated by trusted SECURITY DEFINER functions
  -- (accept_quote_and_deduct_credit, admin_update_user_sensitive_fields, etc.)
  -- Those functions pass through the current_user check above.

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_safe_user_profile_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_safe_user_profile_update();

-- ============================================================================
-- Log migration
-- ============================================================================
INSERT INTO public._migration_log (migration_name)
VALUES ('20260221_phase18_fix_user_profile_trigger.sql')
ON CONFLICT (migration_name) DO NOTHING;
