-- ============================================================================
-- COMPLETE MIGRATIONS (SAFE RECONCILIATION MODE)
-- Date: 2026-02-08
--
-- Purpose:
--   Reconcile _migration_log ONLY after verifying critical production-hardening
--   artifacts already exist in the database.
--
-- IMPORTANT:
--   This script DOES NOT apply schema/function changes.
--   Use APPLY_ALL_MIGRATIONS.sql to apply migrations.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public._migration_log (
  id SERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Safety checks: abort if critical objects are missing.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Critical functions
  IF to_regprocedure('public.accept_quote_and_deduct_credit(uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.accept_quote_and_deduct_credit(uuid)');
  END IF;

  IF to_regprocedure('public.create_rfq_with_items(uuid,jsonb,text,date)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.create_rfq_with_items(uuid,jsonb,text,date)');
  END IF;

  IF to_regprocedure('public.decrement_stock_atomic(uuid,integer)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.decrement_stock_atomic(uuid,integer)');
  END IF;

  IF to_regprocedure('public.verify_client_po_and_confirm_order(uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.verify_client_po_and_confirm_order(uuid)');
  END IF;

  IF to_regprocedure('public.mark_order_as_paid(uuid,text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.mark_order_as_paid(uuid,text,text)');
  END IF;

  IF to_regprocedure('public.mark_order_as_paid(uuid,uuid,text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.mark_order_as_paid(uuid,uuid,text,text)');
  END IF;

  IF to_regprocedure('public.reject_payment_submission(uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.reject_payment_submission(uuid,text)');
  END IF;

  IF to_regprocedure('public.order_status_transition_is_valid(order_status,order_status)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.order_status_transition_is_valid(order_status,order_status)');
  END IF;

  -- Hardened assign_custom_request signature must exist
  IF to_regprocedure('public.assign_custom_request(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.assign_custom_request(uuid,uuid,text)');
  END IF;

  -- Legacy insecure signature must NOT exist
  IF to_regprocedure('public.assign_custom_request(uuid,uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION
      'Unsafe legacy function signature still present: public.assign_custom_request(uuid,uuid,uuid,text). Run SECURITY_HOTFIX_assign_custom_request.sql first.';
  END IF;

  -- Core hardened table and trigger
  IF to_regclass('public.payment_audit_logs') IS NULL THEN
    v_missing := array_append(v_missing, 'public.payment_audit_logs table');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_enforce_order_status_transition'
      AND tgrelid = 'public.orders'::regclass
      AND NOT tgisinternal
  ) THEN
    v_missing := array_append(v_missing, 'public.orders trigger trg_enforce_order_status_transition');
  END IF;

  -- Payment policies should not be permissive
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND (
        position('true' in coalesce(qual, '')) > 0
        OR position('true' in coalesce(with_check, '')) > 0
      )
  ) THEN
    RAISE EXCEPTION 'Permissive payment RLS policy detected (USING/WITH CHECK true). Re-run security hardening migrations.';
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Critical artifacts missing. Do not reconcile _migration_log yet. Missing: %', array_to_string(v_missing, ', ');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Reconcile migration log after checks pass.
-- -----------------------------------------------------------------------------
INSERT INTO public._migration_log (migration_name) VALUES
  ('001_initial_schema.sql'),
  ('002_row_level_security.sql'),
  ('003_seed_data.sql'),
  ('004_auth_trigger.sql'),
  ('005_payment_tables.sql'),
  ('006_bank_transfer_payment.sql'),
  ('007_retail_pricing.sql'),
  ('008_custom_item_requests.sql'),
  ('009_mvp_refinements.sql'),
  ('010_sprint1_quote_comparison.sql'),
  ('20260203_add_order_payment_link.sql'),
  ('20260203_add_search_path_security.sql'),
  ('20260203_lock_down_sensitive_columns.sql'),
  ('20260203_payment_link_rls_policy.sql'),
  ('20260203_restrict_supplier_order_updates.sql'),
  ('20260205_credit_limit_adjustments.sql'),
  ('20260207_atomic_inventory_decrement.sql'),
  ('20260207_phase1_security_hardening.sql'),
  ('20260207_phase2_data_integrity.sql'),
  ('20260207_phase3_payment_audit.sql'),
  ('20260207_phase4_rpc_hardening_and_invoice_sequence.sql'),
  ('20260207_security_and_quote_acceptance.sql'),
  ('20260207_verify_client_po_atomic.sql'),
  ('20260208_phase5_po_verification_payment_transition.sql'),
  ('20260208_phase6_order_status_transition_guard.sql'),
  ('20260208_phase7_mark_order_as_paid_consistency.sql'),
  ('20260208_phase8_reject_payment_submission_rpc.sql'),
  ('create_leads_and_custom_requests.sql'),
  ('20260208_phase9_decimal_precision_standardization.sql'),
  ('20260208_phase10_admin_audit_log.sql'),
  ('20260208_phase11_login_attempts_table.sql')
ON CONFLICT (migration_name) DO NOTHING;

-- Summary
SELECT
  'Safe migration reconciliation completed' AS message,
  COUNT(*) AS total_migrations
FROM public._migration_log;

SELECT migration_name, applied_at
FROM public._migration_log
ORDER BY migration_name;

COMMIT;
