-- ============================================================================
-- MWRD MARKETPLACE - PAYMENT SYSTEM (MOYASAR INTEGRATION)
-- ============================================================================

-- Payment status enum
CREATE TYPE payment_status AS ENUM (
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CANCELLED'
);

-- Payment method enum
CREATE TYPE payment_method_type AS ENUM (
  'CREDITCARD',  -- Visa/Mastercard
  'MADA',        -- Saudi MADA cards
  'APPLEPAY',    -- Apple Pay
  'STC_PAY',     -- STC Pay
  'BANK_TRANSFER' -- Direct bank transfer
);

-- Invoice status enum
CREATE TYPE invoice_status AS ENUM (
  'DRAFT',
  'SENT',
  'PAID',
  'OVERDUE',
  'CANCELLED'
);

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Moyasar details
  moyasar_payment_id TEXT UNIQUE,  -- Moyasar's payment ID
  moyasar_transaction_url TEXT,

  -- Payment information
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  payment_method payment_method_type NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',

  -- Card details (if applicable, stored securely)
  card_last_four TEXT,
  card_brand TEXT,

  -- Metadata
  description TEXT,
  callback_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Status tracking
  authorized_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,

  -- Error handling
  failure_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INVOICES TABLE
-- ============================================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Invoice details
  invoice_number TEXT UNIQUE NOT NULL,

  -- Financial details
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax_percent DECIMAL(5, 2) DEFAULT 15.00,  -- Saudi VAT is 15%
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount > 0),

  -- Status
  status invoice_status NOT NULL DEFAULT 'DRAFT',

  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,

  -- Notes
  notes TEXT,
  terms TEXT,

  -- PDF storage (if generated)
  pdf_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- REFUNDS TABLE
-- ============================================================================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Moyasar details
  moyasar_refund_id TEXT UNIQUE,

  -- Refund information
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',

  -- Admin who processed refund
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Payments indexes
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_client_id ON payments(client_id);
CREATE INDEX idx_payments_moyasar_id ON payments(moyasar_payment_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Invoices indexes
CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_supplier_id ON invoices(supplier_id);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- Refunds indexes
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_order_id ON refunds(order_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate invoice number (format: INV-YYYY-NNNN)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  invoice_num TEXT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

  -- Get the next sequence number for this year
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM invoices
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);

  invoice_num := 'INV-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate invoice number on insert
CREATE OR REPLACE FUNCTION auto_generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_invoice_number_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_invoice_number();

-- Auto-calculate invoice totals
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate tax amount
  NEW.tax_amount := NEW.subtotal * (NEW.tax_percent / 100);

  -- Calculate total
  NEW.total_amount := NEW.subtotal + NEW.tax_amount - COALESCE(NEW.discount_amount, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_invoice_totals_trigger
  BEFORE INSERT OR UPDATE OF subtotal, tax_percent, discount_amount ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals();

-- Update order status when payment is completed
CREATE OR REPLACE FUNCTION update_order_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PAID' AND OLD.status != 'PAID' THEN
    -- Update payment timestamp
    NEW.paid_at := NOW();

    -- You might want to update order status here
    -- UPDATE orders SET status = 'PROCESSING' WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_on_payment_trigger
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_order_on_payment();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- PAYMENTS POLICIES
CREATE POLICY "Clients can view own payments" ON payments
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Clients can create payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = client_id AND get_user_role() = 'CLIENT');

CREATE POLICY "Admins can view all payments" ON payments
  FOR SELECT USING (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can update all payments" ON payments
  FOR UPDATE USING (get_user_role() = 'ADMIN');

CREATE POLICY "System can update payments" ON payments
  FOR UPDATE USING (get_user_role() = 'ADMIN');  -- Keep direct updates admin-only

-- INVOICES POLICIES
CREATE POLICY "Clients can view own invoices" ON invoices
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Suppliers can view their invoices" ON invoices
  FOR SELECT USING (auth.uid() = supplier_id);

CREATE POLICY "Admins can manage all invoices" ON invoices
  FOR ALL USING (get_user_role() = 'ADMIN');

-- REFUNDS POLICIES
CREATE POLICY "Clients can view own refunds" ON refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = refunds.payment_id AND p.client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage refunds" ON refunds
  FOR ALL USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
