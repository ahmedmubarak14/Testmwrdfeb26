// ============================================================================
// PAYMENT SYSTEM TYPES (MOYASAR INTEGRATION)
// ============================================================================

export enum PaymentStatus {
  PENDING = 'PENDING',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethodType {
  CREDITCARD = 'CREDITCARD',
  MADA = 'MADA',
  APPLEPAY = 'APPLEPAY',
  STC_PAY = 'STC_PAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface Payment {
  id: string;
  order_id: string;
  client_id: string;

  // Moyasar details
  moyasar_payment_id?: string;
  moyasar_transaction_url?: string;

  // Payment information
  amount: number;
  currency: string;
  payment_method: PaymentMethodType;
  status: PaymentStatus;

  // Card details
  card_last_four?: string;
  card_brand?: string;

  // Metadata
  description?: string;
  callback_url?: string;
  metadata?: Record<string, any>;

  // Status tracking
  authorized_at?: string;
  paid_at?: string;
  failed_at?: string;
  refunded_at?: string;

  // Error handling
  failure_reason?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  order_id: string;
  payment_id?: string;
  client_id: string;
  supplier_id: string;

  // Invoice details
  invoice_number: string;

  // Financial details
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;

  // Status
  status: InvoiceStatus;

  // Dates
  issue_date: string;
  due_date: string;
  paid_date?: string;

  // Notes
  notes?: string;
  terms?: string;

  // PDF
  pdf_url?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface Refund {
  id: string;
  payment_id: string;
  order_id: string;

  // Moyasar details
  moyasar_refund_id?: string;

  // Refund information
  amount: number;
  reason: string;
  status: PaymentStatus;

  // Admin tracking
  processed_by?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ============================================================================
// MOYASAR API TYPES
// ============================================================================

export interface MoyasarPaymentRequest {
  amount: number; // Amount in halalas (e.g., 1000 = 10 SAR)
  currency: string;
  description: string;
  callback_url: string;
  source: MoyasarPaymentSource;
  metadata?: Record<string, any>;
}

export interface MoyasarPaymentSource {
  type: 'creditcard' | 'applepay' | 'stcpay';
  name?: string;
  number?: string;
  cvc?: string;
  month?: string;
  year?: string;
  token?: string; // For Apple Pay or saved cards
}

export interface MoyasarPaymentResponse {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'authorized' | 'captured' | 'refunded';
  amount: number;
  fee: number;
  currency: string;
  refunded: number;
  captured: number;
  refunded_at?: string;
  captured_at?: string;
  voided_at?: string;
  description: string;
  amount_format: string;
  fee_format: string;
  refunded_format: string;
  captured_format: string;
  invoice_id?: string;
  ip: string;
  callback_url: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
  source: MoyasarSource;
}

export interface MoyasarSource {
  type: string;
  company: string;
  name: string;
  number: string;
  gateway_id: string;
  reference_number?: string;
  token?: string;
  message?: string;
  transaction_url?: string;
}

export interface MoyasarRefundRequest {
  amount: number; // Amount in halalas
  reason?: string;
}

export interface MoyasarRefundResponse {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  note?: string;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface MoyasarWebhookPayload {
  type: 'payment_paid' | 'payment_failed' | 'payment_refunded';
  data: MoyasarPaymentResponse;
  created_at: string;
  id: string;
}

// ============================================================================
// FRONTEND TYPES
// ============================================================================

export interface CheckoutFormData {
  cardName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvc: string;
  saveCard?: boolean;
}

export interface PaymentIntent {
  order_id: string;
  amount: number;
  currency: string;
  description: string;
  payment_method: PaymentMethodType;
}

export interface PaymentSummary {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
}
