// ============================================================================
// PAYMENT SERVICE - Database & Moyasar Integration
// ============================================================================

import { supabase } from '../lib/supabase';
import moyasarService from './moyasarService';
import { appConfig } from '../config/appConfig';
import type { Database } from '../types/database';
import { logger } from '../utils/logger';
import {
  PaymentStatus,
  PaymentMethodType,
  InvoiceStatus,
  type Payment,
  type Invoice,
  type Refund,
  type CheckoutFormData,
  type PaymentIntent,
  type MoyasarPaymentResponse,
} from '../types/payment';

type PaymentRow = Database['public']['Tables']['payments']['Row'];
type PaymentInsert = Database['public']['Tables']['payments']['Insert'];
type PaymentUpdate = Database['public']['Tables']['payments']['Update'];
type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];
type RefundRow = Database['public']['Tables']['refunds']['Row'];
type RefundInsert = Database['public']['Tables']['refunds']['Insert'];

const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.AUTHORIZED,
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.AUTHORIZED]: [
    PaymentStatus.CAPTURED,
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.CAPTURED]: [
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.PAID]: [
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.AWAITING_CONFIRMATION]: [PaymentStatus.CONFIRMED, PaymentStatus.REJECTED],
  [PaymentStatus.CONFIRMED]: [],
  [PaymentStatus.REJECTED]: [],
};

export function canTransitionPaymentStatus(currentStatus: PaymentStatus, nextStatus: PaymentStatus): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  return PAYMENT_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}

function mapDbPayment(row: PaymentRow): Payment {
  return {
    ...row,
    payment_method: row.payment_method as PaymentMethodType,
    status: row.status as PaymentStatus,
    metadata: (row.metadata as Record<string, any> | null) ?? undefined,
  };
}

function mapDbInvoice(row: InvoiceRow): Invoice {
  return {
    ...row,
    status: row.status as InvoiceStatus,
    paid_date: row.paid_date ?? undefined,
    notes: row.notes ?? undefined,
    terms: row.terms ?? undefined,
    pdf_url: row.pdf_url ?? undefined,
    payment_id: row.payment_id ?? undefined,
  };
}

function mapDbRefund(row: RefundRow): Refund {
  return {
    ...row,
    status: row.status as PaymentStatus,
    processed_by: row.processed_by ?? undefined,
    moyasar_refund_id: row.moyasar_refund_id ?? undefined,
  };
}

// ============================================================================
// PAYMENT OPERATIONS
// ============================================================================

/**
 * Create a payment record in the database
 */
export async function createPayment(payment: Partial<Payment>): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert(payment as PaymentInsert)
    .select()
    .single();

  if (error) throw new Error(`Failed to create payment: ${error.message}`);
  return mapDbPayment(data);
}

/**
 * Get payment by ID
 */
export async function getPaymentById(paymentId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error) {
    logger.error('Error fetching payment:', error);
    return null;
  }

  return mapDbPayment(data);
}

/**
 * Get payments for an order
 */
export async function getPaymentsByOrderId(orderId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch payments: ${error.message}`);
  return (data || []).map(mapDbPayment);
}

/**
 * Get payments for a client
 */
export async function getPaymentsByClientId(clientId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch payments: ${error.message}`);
  return (data || []).map(mapDbPayment);
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  additionalData?: Partial<Payment>
): Promise<Payment> {
  const currentPayment = await getPaymentById(paymentId);
  if (!currentPayment) {
    throw new Error('Payment not found');
  }

  if (!canTransitionPaymentStatus(currentPayment.status, status)) {
    throw new Error(
      `Invalid payment status transition: ${currentPayment.status} -> ${status}`
    );
  }

  const updateData: PaymentUpdate = {
    status,
    ...additionalData,
  } as PaymentUpdate;

  const { data, error } = await supabase
    .from('payments')
    .update(updateData)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update payment: ${error.message}`);
  return mapDbPayment(data);
}

// ============================================================================
// PAYMENT PROCESSING
// ============================================================================

/**
 * Process a checkout and create payment with Moyasar
 */
export async function processCheckout(
  orderId: string,
  clientId: string,
  amount: number,
  checkoutData: CheckoutFormData,
  callbackUrl: string
): Promise<{ payment: Payment; moyasarResponse: MoyasarPaymentResponse }> {
  try {
    // 1. Process payment with Moyasar first so we don't persist orphan payment rows on API failure.
    const moyasarResponse = await moyasarService.processCreditCard(
      orderId,
      amount,
      {
        name: checkoutData.cardName,
        number: checkoutData.cardNumber,
        cvc: checkoutData.cvc,
        month: checkoutData.expiryMonth,
        year: checkoutData.expiryYear,
      },
      callbackUrl,
      `Order #${orderId}`
    );

    // 2. Persist the payment with final status/details returned by Moyasar.
    const payment = await createPayment({
      order_id: orderId,
      client_id: clientId,
      amount,
      currency: 'SAR',
      payment_method: PaymentMethodType.CREDITCARD,
      status: moyasarService.mapMoyasarStatus(moyasarResponse.status),
      description: `Payment for order ${orderId}`,
      callback_url: callbackUrl,
      moyasar_payment_id: moyasarResponse.id,
      moyasar_transaction_url: moyasarResponse.source.transaction_url,
      card_last_four: moyasarResponse.source.number,
      card_brand: moyasarResponse.source.company,
      metadata: moyasarResponse.metadata,
    });

    return { payment, moyasarResponse };
  } catch (error) {
    logger.error('Checkout processing error:', error);
    throw error;
  }
}

/**
 * Sync payment status with Moyasar
 */
export async function syncPaymentWithMoyasar(paymentId: string): Promise<Payment> {
  const { data, error } = await supabase.functions.invoke(
    appConfig.payment.moyasarWebhookFunctionName,
    {
      body: {
        mode: 'sync_by_payment_id',
        paymentId,
      },
    }
  );

  if (error) {
    throw new Error(`Failed to sync payment with webhook function: ${error.message}`);
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Payment sync failed');
  }

  if (!data?.payment) {
    throw new Error('Payment sync did not return updated payment data');
  }

  return mapDbPayment(data.payment as PaymentRow);
}

// ============================================================================
// INVOICE OPERATIONS
// ============================================================================

/**
 * Create an invoice
 */
export async function createInvoice(invoice: Partial<Invoice>): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .insert(invoice as InvoiceInsert)
    .select()
    .single();

  if (error) throw new Error(`Failed to create invoice: ${error.message}`);
  return mapDbInvoice(data);
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (error) {
    logger.error('Error fetching invoice:', error);
    return null;
  }

  return mapDbInvoice(data);
}

/**
 * Get invoices for a client
 */
export async function getInvoicesByClientId(clientId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch invoices: ${error.message}`);
  return (data || []).map(mapDbInvoice);
}

/**
 * Get invoice for an order
 */
export async function getInvoiceByOrderId(orderId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (error) {
    logger.error('Error fetching invoice:', error);
    return null;
  }

  return mapDbInvoice(data);
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus
): Promise<Invoice> {
  const updateData: InvoiceUpdate = { status } as InvoiceUpdate;

  if (status === InvoiceStatus.PAID) {
    updateData.paid_date = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updateData)
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update invoice: ${error.message}`);
  return mapDbInvoice(data);
}

/**
 * Generate invoice for order
 */
export async function generateInvoiceForOrder(
  orderId: string,
  clientId: string,
  supplierId: string,
  subtotal: number,
  taxPercent: number = appConfig.pricing.vatRatePercent
): Promise<Invoice> {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // 30 days payment term

  const invoice = await createInvoice({
    order_id: orderId,
    client_id: clientId,
    supplier_id: supplierId,
    subtotal,
    tax_percent: taxPercent,
    status: InvoiceStatus.DRAFT,
    issue_date: new Date().toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    terms: 'Payment due within 30 days of invoice date.',
  });

  return invoice;
}

// ============================================================================
// REFUND OPERATIONS
// ============================================================================

/**
 * Create a refund
 */
export async function createRefund(refund: Partial<Refund>): Promise<Refund> {
  const { data, error } = await supabase
    .from('refunds')
    .insert(refund as RefundInsert)
    .select()
    .single();

  if (error) throw new Error(`Failed to create refund: ${error.message}`);
  return mapDbRefund(data);
}

/**
 * Process a refund through Moyasar
 */
export async function processRefund(
  paymentId: string,
  amount: number,
  reason: string,
  processedBy: string
): Promise<Refund> {
  const payment = await getPaymentById(paymentId);
  if (!payment || !payment.moyasar_payment_id) {
    throw new Error('Payment not found or missing Moyasar ID');
  }

  // Create refund in Moyasar
  const moyasarRefund = await moyasarService.refundPayment(
    payment.moyasar_payment_id,
    {
      amount: moyasarService.toHalalas(amount),
      reason,
    }
  );

  // Create refund record in database
  const refund = await createRefund({
    payment_id: paymentId,
    order_id: payment.order_id,
    moyasar_refund_id: moyasarRefund.id,
    amount,
    reason,
    status: PaymentStatus.PENDING,
    processed_by: processedBy,
  });

  // Update payment status
  await updatePaymentStatus(paymentId, PaymentStatus.REFUNDED, {
    refunded_at: new Date().toISOString(),
  });

  return refund;
}

/**
 * Get refunds for a payment
 */
export async function getRefundsByPaymentId(paymentId: string): Promise<Refund[]> {
  const { data, error } = await supabase
    .from('refunds')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch refunds: ${error.message}`);
  return (data || []).map(mapDbRefund);
}

// ============================================================================
// PAYMENT STATISTICS
// ============================================================================

/**
 * Get payment statistics for a client
 */
export async function getClientPaymentStats(clientId: string) {
  const payments = await getPaymentsByClientId(clientId);

  const stats = {
    total: payments.length,
    paid: payments.filter(p => p.status === PaymentStatus.PAID).length,
    pending: payments.filter(p => p.status === PaymentStatus.PENDING).length,
    failed: payments.filter(p => p.status === PaymentStatus.FAILED).length,
    totalAmount: payments
      .filter(p => p.status === PaymentStatus.PAID)
      .reduce((sum, p) => sum + p.amount, 0),
  };

  return stats;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const paymentService = {
  // Payments
  createPayment,
  getPaymentById,
  getPaymentsByOrderId,
  getPaymentsByClientId,
  updatePaymentStatus,
  processCheckout,
  syncPaymentWithMoyasar,

  // Invoices
  createInvoice,
  getInvoiceById,
  getInvoicesByClientId,
  getInvoiceByOrderId,
  updateInvoiceStatus,
  generateInvoiceForOrder,

  // Refunds
  createRefund,
  processRefund,
  getRefundsByPaymentId,

  // Statistics
  getClientPaymentStats,
};

export default paymentService;
