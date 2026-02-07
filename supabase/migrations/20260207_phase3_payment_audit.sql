-- ============================================================================
-- Phase 3 Bank Transfer Audit Trail
-- Date: 2026-02-07
-- Focus:
--   1) Persistent payment audit log for bank-transfer lifecycle
--   2) RLS policies for admin/client visibility and controlled inserts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role public.user_role,
  action TEXT NOT NULL CHECK (
    action IN (
      'REFERENCE_SUBMITTED',
      'REFERENCE_RESUBMITTED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_REJECTED'
    )
  ),
  from_status public.order_status,
  to_status public.order_status,
  payment_reference TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_order_created_at
  ON public.payment_audit_logs (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_created_at
  ON public.payment_audit_logs (created_at DESC);

ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Admins can read all payment audit logs'
  ) THEN
    CREATE POLICY "Admins can read all payment audit logs"
      ON public.payment_audit_logs
      FOR SELECT
      TO authenticated
      USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Clients can read own payment audit logs'
  ) THEN
    CREATE POLICY "Clients can read own payment audit logs"
      ON public.payment_audit_logs
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = payment_audit_logs.order_id
            AND o.client_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Admins can insert payment audit logs'
  ) THEN
    CREATE POLICY "Admins can insert payment audit logs"
      ON public.payment_audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
        AND actor_user_id = auth.uid()
        AND action IN ('PAYMENT_CONFIRMED', 'PAYMENT_REJECTED')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Clients can insert own payment submission audit logs'
  ) THEN
    CREATE POLICY "Clients can insert own payment submission audit logs"
      ON public.payment_audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        actor_user_id = auth.uid()
        AND action IN ('REFERENCE_SUBMITTED', 'REFERENCE_RESUBMITTED')
        AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = payment_audit_logs.order_id
            AND o.client_id = auth.uid()
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT ON public.payment_audit_logs TO authenticated;
