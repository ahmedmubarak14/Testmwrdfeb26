-- ============================================================================
-- SUPABASE DATABASE VERIFICATION SCRIPT
-- Purpose: Verify all critical functions, triggers, and policies after migration
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Run this script AFTER applying APPLY_ALL_MIGRATIONS.sql
-- 2. Review all outputs carefully
-- 3. All checks should return expected results as documented
-- 
-- ============================================================================

-- ============================================================================
-- 1. CRITICAL FUNCTIONS VERIFICATION
-- ============================================================================

SELECT
  '=== CRITICAL FUNCTIONS VERIFICATION ===' AS section;

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path = public, pg_temp%' THEN '✅ SECURE'
    WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path%' THEN '⚠️  NON-STANDARD'
    ELSE '❌ MISSING'
  END AS search_path_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'accept_quote_and_deduct_credit',
    'create_rfq_with_items',
    'decrement_stock_atomic',
    'verify_client_po_and_confirm_order',
    'mark_order_as_paid',
    'reject_payment_submission',
    'order_status_transition_is_valid',
    'enforce_order_status_transition',
    'assign_custom_request',
    'log_admin_action',
    'audit_user_changes',
    'audit_product_changes',
    'audit_order_changes',
    'admin_update_user_sensitive_fields',
    'prune_old_login_attempts'
  )
ORDER BY p.proname, arguments;

-- Expected: All functions should exist with SECURITY DEFINER and ✅ SECURE status

-- ============================================================================
-- 2. FUNCTION SIGNATURE DETAILS
-- ============================================================================

SELECT
  '=== FUNCTION SIGNATURES ===' AS section;

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS full_signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'accept_quote_and_deduct_credit',
    'create_rfq_with_items',
    'decrement_stock_atomic',
    'verify_client_po_and_confirm_order',
    'mark_order_as_paid',
    'reject_payment_submission',
    'order_status_transition_is_valid'
  )
ORDER BY p.proname, p.oid;

-- Expected signatures:
-- accept_quote_and_deduct_credit(p_quote_id uuid)
-- create_rfq_with_items(p_client_id uuid, p_items jsonb, p_status text, p_date date)
-- decrement_stock_atomic(p_product_id uuid, p_quantity integer)
-- verify_client_po_and_confirm_order(p_document_id uuid)
-- mark_order_as_paid(p_order_id uuid, p_admin_id uuid, p_payment_reference text, p_payment_notes text) [LEGACY]
-- mark_order_as_paid(p_order_id uuid, p_payment_reference text, p_payment_notes text) [PREFERRED]
-- reject_payment_submission(p_order_id uuid, p_reason text)
-- order_status_transition_is_valid(p_from order_status, p_to order_status)

-- ============================================================================
-- 3. ORDER STATUS TRANSITION TRIGGER VERIFICATION
-- ============================================================================

SELECT
  '=== ORDER STATUS TRIGGER ===' AS section;

SELECT
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  CASE tgtype & 1
    WHEN 1 THEN 'ROW'
    ELSE 'STATEMENT'
  END AS level,
  CASE tgtype & 66
    WHEN 2 THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  CASE
    WHEN tgtype & 4 = 4 THEN 'INSERT'
    WHEN tgtype & 8 = 8 THEN 'DELETE'
    WHEN tgtype & 16 = 16 THEN 'UPDATE'
    ELSE 'OTHER'
  END AS event
FROM pg_trigger
WHERE tgname = 'trg_enforce_order_status_transition'
  AND tgrelid = 'public.orders'::regclass
  AND NOT tgisinternal;

-- Expected: 1 row - BEFORE UPDATE trigger on public.orders

-- ============================================================================
-- 4. PAYMENT AUDIT TABLE VERIFICATION
-- ============================================================================

SELECT
  '=== PAYMENT AUDIT TABLE ===' AS section;

-- Check table exists
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'payment_audit_logs'
) AS audit_table_exists;

-- Expected: true

-- Check supported actions (via CHECK constraint)
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.payment_audit_logs'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) LIKE '%action%';

-- Expected: CHECK constraint allowing REFERENCE_SUBMITTED, REFERENCE_RESUBMITTED, PAYMENT_CONFIRMED, PAYMENT_REJECTED

-- ============================================================================
-- 5. PAYMENT AUDIT POLICIES VERIFICATION
-- ============================================================================

SELECT
  '=== PAYMENT AUDIT POLICIES ===' AS section;

SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payment_audit_logs'
ORDER BY policyname;

-- Expected policies:
-- 1. Admins can insert payment audit logs (INSERT)
-- 2. Admins can read all payment audit logs (SELECT)
-- 3. Clients can insert own payment submission audit logs (INSERT)
-- 4. Clients can read own payment audit logs (SELECT)

-- ============================================================================
-- 6. PAYMENT TABLE POLICIES AUDIT (Security Check)
-- ============================================================================

SELECT
  '=== PAYMENT TABLE POLICIES (NO PERMISSIVE POLICIES) ===' AS section;

SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payments'
  AND (qual = 'true' OR with_check = 'true');

-- Expected: 0 rows (no permissive USING (true) or WITH CHECK (true) policies)

-- All payment policies
SELECT
  policyname,
  cmd,
  CASE
    WHEN qual = 'true' THEN '❌ PERMISSIVE'
    ELSE '✅ RESTRICTED'
  END AS qual_status,
  CASE
    WHEN with_check = 'true' THEN '❌ PERMISSIVE'
    ELSE '✅ RESTRICTED'
  END AS check_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'payments'
ORDER BY policyname;

-- ============================================================================
-- 7. ALL SECURITY DEFINER FUNCTIONS AUDIT
-- ============================================================================

SELECT
  '=== ALL SECURITY DEFINER FUNCTIONS ===' AS section;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path = public, pg_temp%' THEN '✅ SECURE'
    WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path%' THEN '⚠️  NON-STANDARD'
    ELSE '❌ MISSING search_path'
  END AS search_path_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY search_path_status, p.proname;

-- Expected: All SECURITY DEFINER functions should have ✅ SECURE status

-- ============================================================================
-- 8. MIGRATION LOG VERIFICATION
-- ============================================================================

SELECT
  '=== APPLIED MIGRATIONS ===' AS section;

SELECT
  migration_name,
  applied_at
FROM public._migration_log
ORDER BY applied_at;

-- Expected: 31 migrations listed in chronological order

SELECT
  COUNT(*) AS total_migrations_applied
FROM public._migration_log;

-- Expected: 31

-- ============================================================================
-- 9. INVOICE SEQUENCE VERIFICATION
-- ============================================================================

SELECT
  '=== INVOICE SEQUENCE ===' AS section;

SELECT
  sequencename,
  last_value,
  is_called
FROM pg_sequences
WHERE schemaname = 'public'
  AND sequencename = 'invoice_number_seq';

-- Expected: Sequence exists with appropriate last_value

-- ============================================================================
-- 10. ORDER STATUS ENUM VALUES
-- ============================================================================

SELECT
  '=== ORDER STATUS ENUM VALUES ===' AS section;

SELECT
  enumlabel AS status_value
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'order_status'
ORDER BY e.enumsortorder;

-- Expected values (at minimum):
-- PENDING_PO, CONFIRMED, PENDING_PAYMENT, AWAITING_CONFIRMATION, PAYMENT_CONFIRMED,
-- PROCESSING, READY_FOR_PICKUP, PICKUP_SCHEDULED, OUT_FOR_DELIVERY, SHIPPED,
-- IN_TRANSIT, DELIVERED, CANCELLED

-- ============================================================================
-- 11. ADMIN AUDIT LOG VERIFICATION
-- ============================================================================

SELECT
  '=== ADMIN AUDIT LOG ===' AS section;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'admin_audit_log'
) AS admin_audit_table_exists;

-- Expected: true

-- Check audit triggers exist
SELECT
  tgname AS trigger_name,
  tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN (
  'trg_audit_user_changes',
  'trg_audit_product_changes',
  'trg_audit_order_changes'
)
AND NOT tgisinternal
ORDER BY tgname;

-- Expected: 3 rows (user, product, order audit triggers)

-- ============================================================================
-- 12. LOGIN ATTEMPTS TABLE VERIFICATION (for auth-rate-limit edge function)
-- ============================================================================

SELECT
  '=== LOGIN ATTEMPTS TABLE ===' AS section;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'login_attempts'
) AS login_attempts_table_exists;

-- Expected: true

-- ============================================================================
-- 13. DECIMAL PRECISION VERIFICATION
-- ============================================================================

SELECT
  '=== DECIMAL PRECISION CHECK ===' AS section;

SELECT
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'numeric'
  AND table_name IN ('users', 'products', 'quotes', 'orders', 'payments', 'invoices', 'refunds')
ORDER BY table_name, column_name;

-- Expected: All monetary columns should be numeric(12,2), rating should be numeric(3,2)

-- ============================================================================
-- VERIFICATION COMPLETE
-- ============================================================================

SELECT
  '=== VERIFICATION COMPLETE ===' AS section,
  'Review all sections above for expected results' AS instruction;
