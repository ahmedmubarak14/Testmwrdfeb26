-- ============================================================================
-- Phase 1 Security Hardening
-- Date: 2026-02-07
-- Focus:
--   1) Remove user-table recursion risk in role helper
--   2) Keep JWT role claims synchronized with public.users.role
--   3) Remove seed helper functions from runtime surface
-- ============================================================================

-- 1) Role helper must not query public.users (avoids RLS recursion paths).
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
BEGIN
  v_role_text := COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'user_role'
  );

  IF v_role_text IS NULL OR v_role_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_role_text::public.user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2) Sync role claim to auth.users raw_app_meta_data for policy checks.
CREATE OR REPLACE FUNCTION public.sync_auth_user_role_claim(
  p_user_id UUID,
  p_role public.user_role
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_role IS NULL THEN
    RETURN;
  END IF;

  UPDATE auth.users
  SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('user_role', p_role::TEXT),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.sync_auth_user_role_claim_from_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.sync_auth_user_role_claim(NEW.id, NEW.role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_auth_user_role_claim ON public.users;
CREATE TRIGGER trg_sync_auth_user_role_claim
AFTER INSERT OR UPDATE OF role ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_auth_user_role_claim_from_profile();

-- Backfill existing users into auth claim metadata.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT u.id, u.role
    FROM public.users u
  LOOP
    PERFORM public.sync_auth_user_role_claim(r.id, r.role);
  END LOOP;
END
$$;

-- 3) Drop seed-only helper functions so they are not callable in runtime.
DROP FUNCTION IF EXISTS public.create_user_profile(
  UUID,
  TEXT,
  TEXT,
  public.user_role,
  TEXT,
  BOOLEAN,
  public.user_status,
  public.kyc_status
);

DROP FUNCTION IF EXISTS public.create_test_user(
  TEXT,
  TEXT,
  TEXT,
  public.user_role,
  TEXT,
  BOOLEAN,
  public.user_status,
  public.kyc_status
);

