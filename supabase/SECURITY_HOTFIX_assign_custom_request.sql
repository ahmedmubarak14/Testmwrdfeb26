-- ============================================================================
-- SECURITY HOTFIX: Restore Hardened assign_custom_request Function
-- Date: 2026-02-08
-- Issue: COMPLETE_MIGRATIONS.sql accidentally reverted to old insecure signature
-- Fix: Re-apply the hardened version from phase4 migration
-- ============================================================================

-- Drop the insecure 4-parameter version
DROP FUNCTION IF EXISTS public.assign_custom_request(UUID, UUID, UUID, TEXT);

-- Create the secure 3-parameter version (uses auth.uid() instead of p_admin_id)
CREATE OR REPLACE FUNCTION public.assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.custom_item_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  IF (SELECT role FROM public.users WHERE id = p_supplier_id) <> 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  UPDATE public.custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Custom request not found';
  END IF;

  RETURN v_request;
END;
$$;

-- Set proper permissions
REVOKE ALL ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) TO authenticated;

-- Verify the fix
SELECT 
  'Security hotfix applied successfully' AS status,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS new_signature,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path = public, pg_temp%' THEN '✅ SECURE'
    ELSE '❌ MISSING search_path'
  END AS search_path_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND p.proname = 'assign_custom_request';
