-- ============================================================================
-- Phase 21: Fix RLS policy for client order updates (phase 20 hotfix)
-- Date: 2026-02-21
-- The phase 20 policy used OLD.status in WITH CHECK which is NOT valid in RLS.
-- This migration rewrites the policy correctly using a SELECT subquery.
-- ============================================================================

DROP POLICY IF EXISTS "Clients can update own PO fields" ON public.orders;

CREATE POLICY "Clients can update own PO fields"
  ON public.orders
  FOR UPDATE
  USING (auth.uid() = client_id)
  WITH CHECK (
    auth.uid() = client_id
    -- Prevent clients from changing status — only system/admin may do that.
    -- We re-read the current status from the DB and compare with the proposed NEW.status.
    AND status = (SELECT status FROM public.orders WHERE id = orders.id)
  );

INSERT INTO public._migration_log (migration_name)
VALUES ('20260221_phase21_fix_client_order_rls.sql')
ON CONFLICT (migration_name) DO NOTHING;
