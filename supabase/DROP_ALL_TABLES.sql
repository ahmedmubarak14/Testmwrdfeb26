-- ============================================================================
-- CLEAN SLATE: Drop All Tables and Start Fresh
-- ============================================================================
-- WARNING: This will delete ALL data in your database!
-- Only run this if you're okay losing current data
-- ============================================================================

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS refunds CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS payment_audit_logs CASCADE;
DROP TABLE IF EXISTS order_documents CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS rfq_items CASCADE;
DROP TABLE IF EXISTS rfqs CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS custom_item_requests CASCADE;
DROP TABLE IF EXISTS client_margins CASCADE;
DROP TABLE IF EXISTS master_products CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS credit_limit_adjustments CASCADE;
DROP TABLE IF EXISTS bank_details CASCADE;
DROP TABLE IF EXISTS margin_settings CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS _migration_log CASCADE;

-- Drop all custom types
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS payment_method_type CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS custom_request_status CASCADE;
DROP TYPE IF EXISTS request_priority CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS quote_status CASCADE;
DROP TYPE IF EXISTS rfq_status CASCADE;
DROP TYPE IF EXISTS product_status CASCADE;
DROP TYPE IF EXISTS kyc_status CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS generate_public_id(TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS auto_generate_public_id() CASCADE;
DROP FUNCTION IF EXISTS calculate_final_price() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS create_rfq_with_items(UUID, JSONB, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS accept_quote_and_deduct_credit(UUID) CASCADE;
DROP FUNCTION IF EXISTS decrement_stock_atomic(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS verify_client_po_and_confirm_order(UUID) CASCADE;
DROP FUNCTION IF EXISTS mark_order_as_paid(UUID, UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS mark_order_as_paid(UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS reject_payment_submission(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS order_status_transition_is_valid(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS enforce_order_status_transition() CASCADE;

-- Drop all sequences
DROP SEQUENCE IF EXISTS invoice_number_seq CASCADE;

SELECT 'Database cleaned successfully! Now run APPLY_ALL_MIGRATIONS.sql' AS message;
