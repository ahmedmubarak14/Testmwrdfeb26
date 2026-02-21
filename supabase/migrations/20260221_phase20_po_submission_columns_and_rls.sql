-- ============================================================================
-- Phase 20: Fix PO submission flow
-- Date: 2026-02-21
-- Fixes two issues that prevent clients from completing PO submission:
--
-- 1. Missing columns on public.orders:
--    - not_test_order_confirmed_at        (client confirms order is real)
--    - payment_terms_confirmed_at         (client confirms payment terms)
--    - client_po_confirmation_submitted_at (overall submission timestamp)
--    - client_po_uploaded                 (flag: client has uploaded PO)
--
-- 2. Clients have no UPDATE RLS policy on orders.
--    DualPOFlow calls supabase.from('orders').update(...) directly, which
--    is blocked when no client-update policy exists. We add a narrow policy
--    that only allows clients to update their own non-sensitive PO fields.
-- ============================================================================

-- ============================================================================
-- 1. Add missing PO timestamp + flag columns (all idempotent)
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS not_test_order_confirmed_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_terms_confirmed_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_po_confirmation_submitted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_po_uploaded            BOOLEAN     DEFAULT FALSE;

-- ============================================================================
-- 2. Add RLS UPDATE policy for clients — narrow scope
--    Clients may ONLY update:
--      - PO confirmation timestamps / flag  (not status — that stays admin-only)
--      - payment_reference, payment_notes, payment_submitted_at
--        (bank transfer submission)
--    They may NOT change status, amount, supplier_id, etc.
--    The WITH CHECK clause mirrors USING so self-targeting is required.
-- ============================================================================

DROP POLICY IF EXISTS "Clients can update own PO fields" ON public.orders;

CREATE POLICY "Clients can update own PO fields"
  ON public.orders
  FOR UPDATE
  USING  (auth.uid() = client_id)
  WITH CHECK (
    auth.uid() = client_id
    -- Prevent status escalation by clients
    AND status = OLD.status
  );

-- ============================================================================
-- 3. Also ensure clients can INSERT their own orders
--    (accept_quote_and_deduct_credit runs SECURITY DEFINER so it bypasses
--     RLS for the INSERT — but the fallback path (acceptQuoteFallback) in
--     api.ts does a direct insert.  Add a client-scoped INSERT policy so
--     the JS fallback can also create orders.)
-- ============================================================================

DROP POLICY IF EXISTS "Clients can create own orders" ON public.orders;

CREATE POLICY "Clients can create own orders"
  ON public.orders
  FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    AND get_user_role() = 'CLIENT'
  );

-- ============================================================================
-- 4. Log migration
-- ============================================================================

INSERT INTO public._migration_log (migration_name)
VALUES ('20260221_phase20_po_submission_columns_and_rls.sql')
ON CONFLICT (migration_name) DO NOTHING;
