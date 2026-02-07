-- ============================================================================
-- Add external payment link fields to orders
-- Date: 2026-02-03
-- Purpose: Allow admins to store a manually generated payment link per order
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_sent_at TIMESTAMPTZ;

