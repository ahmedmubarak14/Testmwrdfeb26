// ============================================================================
// BANK TRANSFER SERVICE - Phase One Payment System
// ============================================================================

import { supabase } from '../lib/supabase';
import type {
  BankDetails,
  Order,
  OrderStatus,
  PaymentAuditAction,
  PaymentAuditLog,
  UserRole
} from '../types/types';
import type { Database } from '../types/database';
import { logger } from '../utils/logger';
import { canTransitionOrderStatus } from './orderStatusService';

type BankDetailsRow = Database['public']['Tables']['bank_details']['Row'];
type OrderRow = Database['public']['Tables']['orders']['Row'];
type PaymentAuditLogRow = Database['public']['Tables']['payment_audit_logs']['Row'];
type PaymentAuditLogInsert = Database['public']['Tables']['payment_audit_logs']['Insert'];

interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

type AuthenticatedRole = 'ADMIN' | 'CLIENT' | 'SUPPLIER';

async function requireAuthenticatedUserRole(expectedRole: AuthenticatedRole): Promise<string> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Authentication required');
  }

  const userId = authData.user.id;
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (userError || !userRow) {
    throw new Error('Unable to resolve current user role');
  }

  if (userRow.role !== expectedRole) {
    throw new Error(`Only ${expectedRole.toLowerCase()} users can perform this action`);
  }

  return userId;
}

function applyPagination<T>(query: T, pagination?: PaginationOptions): T {
  const requestedPageSize = Number(pagination?.pageSize);
  if (!Number.isFinite(requestedPageSize) || requestedPageSize <= 0) {
    return query;
  }

  const pageSize = Math.min(Math.max(Math.floor(requestedPageSize), 1), 200);
  const page = Math.max(Math.floor(Number(pagination?.page) || 1), 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return (query as any).range(from, to) as T;
}

function mapDbBankDetailsToModel(row: BankDetailsRow): BankDetails {
  return {
    id: row.id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    iban: row.iban ?? undefined,
    swiftCode: row.swift_code ?? undefined,
    branchName: row.branch_name ?? undefined,
    branchCode: row.branch_code ?? undefined,
    currency: row.currency,
    notes: row.notes ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDbOrderToModel(row: OrderRow): Order {
  return {
    id: row.id,
    quoteId: row.quote_id ?? undefined,
    clientId: row.client_id,
    supplierId: row.supplier_id,
    amount: row.amount,
    status: row.status as OrderStatus,
    date: row.date,
    paymentReference: row.payment_reference ?? undefined,
    paymentConfirmedAt: row.payment_confirmed_at ?? undefined,
    paymentConfirmedBy: row.payment_confirmed_by ?? undefined,
    paymentNotes: row.payment_notes ?? undefined,
    paymentReceiptUrl: row.payment_receipt_url ?? undefined,
    paymentSubmittedAt: row.payment_submitted_at ?? undefined,
    paymentLinkUrl: row.payment_link_url ?? undefined,
    paymentLinkSentAt: row.payment_link_sent_at ?? undefined,
    shipment: (row.shipment_details as any) ?? undefined,
    system_po_generated: row.system_po_generated,
    client_po_uploaded: row.client_po_uploaded,
    admin_verified: row.admin_verified,
    admin_verified_by: row.admin_verified_by ?? undefined,
    admin_verified_at: row.admin_verified_at ?? undefined,
    items: row.items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDbPaymentAuditLogToModel(row: PaymentAuditLogRow): PaymentAuditLog {
  return {
    id: row.id,
    orderId: row.order_id,
    actorUserId: row.actor_user_id ?? undefined,
    actorRole: (row.actor_role as UserRole | null) ?? undefined,
    action: row.action as PaymentAuditAction,
    fromStatus: (row.from_status as OrderStatus | null) ?? undefined,
    toStatus: (row.to_status as OrderStatus | null) ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    notes: row.notes ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.created_at,
  };
}

async function logPaymentAuditEvent(entry: PaymentAuditLogInsert): Promise<void> {
  const { error } = await supabase
    .from('payment_audit_logs')
    .insert(entry);

  if (error) {
    logger.error('Failed to create payment audit log:', error);
  }
}

// ============================================================================
// BANK DETAILS OPERATIONS
// ============================================================================

/**
 * Get active bank details (MWRD's bank account)
 */
export async function getActiveBankDetails(): Promise<BankDetails | null> {
  const { data, error } = await supabase
    .from('bank_details')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error) {
    logger.error('Error fetching bank details:', error);
    return null;
  }

  return mapDbBankDetailsToModel(data);
}

/**
 * Get all bank details (Admin only)
 */
export async function getAllBankDetails(): Promise<BankDetails[]> {
  const { data, error } = await supabase
    .from('bank_details')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch bank details: ${error.message}`);
  return (data || []).map(mapDbBankDetailsToModel);
}

/**
 * Create new bank details
 */
export async function createBankDetails(
  bankDetails: Omit<BankDetails, 'id' | 'createdAt' | 'updatedAt'>
): Promise<BankDetails> {
  // If setting as active, deactivate all others first
  if (bankDetails.isActive) {
    await supabase
      .from('bank_details')
      .update({ is_active: false })
      .eq('is_active', true);
  }

  const { data, error } = await supabase
    .from('bank_details')
    .insert([{
      bank_name: bankDetails.bankName,
      account_name: bankDetails.accountName,
      account_number: bankDetails.accountNumber,
      iban: bankDetails.iban,
      swift_code: bankDetails.swiftCode,
      branch_name: bankDetails.branchName,
      branch_code: bankDetails.branchCode,
      currency: bankDetails.currency,
      notes: bankDetails.notes,
      is_active: bankDetails.isActive,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create bank details: ${error.message}`);
  return mapDbBankDetailsToModel(data);
}

/**
 * Update bank details
 */
export async function updateBankDetails(
  id: string,
  updates: Partial<Omit<BankDetails, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<BankDetails> {
  // If setting as active, deactivate all others first
  if (updates.isActive) {
    await supabase
      .from('bank_details')
      .update({ is_active: false })
      .eq('is_active', true)
      .neq('id', id);
  }

  const updateData: any = {};
  if (updates.bankName) updateData.bank_name = updates.bankName;
  if (updates.accountName) updateData.account_name = updates.accountName;
  if (updates.accountNumber) updateData.account_number = updates.accountNumber;
  if (updates.iban !== undefined) updateData.iban = updates.iban;
  if (updates.swiftCode !== undefined) updateData.swift_code = updates.swiftCode;
  if (updates.branchName !== undefined) updateData.branch_name = updates.branchName;
  if (updates.branchCode !== undefined) updateData.branch_code = updates.branchCode;
  if (updates.currency) updateData.currency = updates.currency;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('bank_details')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update bank details: ${error.message}`);
  return mapDbBankDetailsToModel(data);
}

/**
 * Set active bank details (deactivates all others)
 */
export async function setActiveBankDetails(id: string): Promise<void> {
  // Deactivate all
  await supabase
    .from('bank_details')
    .update({ is_active: false })
    .eq('is_active', true);

  // Activate selected
  const { error } = await supabase
    .from('bank_details')
    .update({ is_active: true })
    .eq('id', id);

  if (error) throw new Error(`Failed to set active bank details: ${error.message}`);
}

/**
 * Delete bank details
 */
export async function deleteBankDetails(id: string): Promise<void> {
  const { error } = await supabase
    .from('bank_details')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete bank details: ${error.message}`);
}

// ============================================================================
// ORDER PAYMENT CONFIRMATION
// ============================================================================

/**
 * Mark order as paid (Admin confirms payment received)
 */
export async function markOrderAsPaid(
  orderId: string,
  paymentReference?: string,
  paymentNotes?: string
): Promise<Order> {
  const adminId = await requireAuthenticatedUserRole('ADMIN');
  const currentOrder = await getOrderById(orderId);
  if (!currentOrder) {
    throw new Error('Order not found');
  }

  if (!canTransitionOrderStatus(currentOrder.status, 'PAYMENT_CONFIRMED')) {
    throw new Error(
      `Invalid order status transition: ${currentOrder.status} -> PAYMENT_CONFIRMED`
    );
  }

  const { data, error } = await supabase.rpc('mark_order_as_paid', {
    p_order_id: orderId,
    p_payment_reference: paymentReference ?? null,
    p_payment_notes: paymentNotes ?? null,
  });

  if (error) {
    throw new Error(`Failed to mark order as paid: ${error.message}`);
  }

  const updatedOrder = mapDbOrderToModel(data as OrderRow);
  if (currentOrder.status !== 'PAYMENT_CONFIRMED') {
    await logPaymentAuditEvent({
      order_id: orderId,
      actor_user_id: adminId,
      actor_role: 'ADMIN',
      action: 'PAYMENT_CONFIRMED',
      from_status: currentOrder.status,
      to_status: 'PAYMENT_CONFIRMED',
      payment_reference: paymentReference || currentOrder.paymentReference || null,
      notes: paymentNotes || null,
      metadata: {
        source: 'bankTransferService.markOrderAsPaid',
      },
    });
  }

  return updatedOrder;
}

/**
 * Reject a submitted payment reference and move the order back to pending payment
 */
export async function rejectPaymentSubmission(
  orderId: string,
  reason: string
): Promise<Order> {
  const currentOrder = await getOrderById(orderId);
  if (!currentOrder) {
    throw new Error('Order not found');
  }

  if (currentOrder.status !== 'AWAITING_CONFIRMATION') {
    throw new Error(
      `Invalid order status transition: ${currentOrder.status} -> PENDING_PAYMENT`
    );
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error('Rejection reason is required');
  }

  const { data, error } = await supabase.rpc('reject_payment_submission', {
    p_order_id: orderId,
    p_reason: trimmedReason,
  });

  if (error) throw new Error(`Failed to reject payment submission: ${error.message}`);
  return mapDbOrderToModel(data as OrderRow);
}

/**
 * Client adds payment reference to order
 */
export async function addPaymentReference(
  orderId: string,
  paymentReference: string,
  paymentNotes?: string
): Promise<Order> {
  const clientId = await requireAuthenticatedUserRole('CLIENT');
  const currentOrder = await getOrderById(orderId);
  if (!currentOrder) {
    throw new Error('Order not found');
  }

  if (currentOrder.clientId !== clientId) {
    throw new Error('You can only submit payment references for your own orders');
  }

  if (!canTransitionOrderStatus(currentOrder.status, 'AWAITING_CONFIRMATION')) {
    throw new Error(
      `Invalid order status transition: ${currentOrder.status} -> AWAITING_CONFIRMATION`
    );
  }

  const normalizedReference = paymentReference.trim();
  if (!normalizedReference) {
    throw new Error('Payment reference is required');
  }

  const auditAction: PaymentAuditAction =
    currentOrder.status === 'AWAITING_CONFIRMATION'
      ? 'REFERENCE_RESUBMITTED'
      : 'REFERENCE_SUBMITTED';

  const updateData: any = {
    status: 'AWAITING_CONFIRMATION',
    payment_reference: normalizedReference,
    payment_submitted_at: new Date().toISOString(),
  };

  if (paymentNotes) {
    updateData.payment_notes = paymentNotes;
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new Error(`Failed to add payment reference: ${error.message}`);
  const updatedOrder = mapDbOrderToModel(data);

  await logPaymentAuditEvent({
    order_id: orderId,
    actor_user_id: clientId,
    actor_role: 'CLIENT',
    action: auditAction,
    from_status: currentOrder.status,
    to_status: 'AWAITING_CONFIRMATION',
    payment_reference: normalizedReference,
    notes: paymentNotes || null,
    metadata: {
      source: 'bankTransferService.addPaymentReference',
      previousReference: currentOrder.paymentReference || null,
    },
  });

  return updatedOrder;
}

/**
 * Get orders pending payment confirmation
 */
export async function getPendingPaymentOrders(pagination?: PaginationOptions): Promise<Order[]> {
  let query = supabase
    .from('orders')
    .select('*')
    .in('status', ['PENDING_PAYMENT', 'AWAITING_CONFIRMATION'])
    .order('date', { ascending: false });

  query = applyPagination(query, pagination);
  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch pending orders: ${error.message}`);
  return (data || []).map(mapDbOrderToModel);
}

/**
 * Get order by ID
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) {
    logger.error('Error fetching order:', error);
    return null;
  }

  return mapDbOrderToModel(data);
}

/**
 * Get payment audit logs for an order
 */
export async function getPaymentAuditLogs(orderId: string): Promise<PaymentAuditLog[]> {
  const { data, error } = await supabase
    .from('payment_audit_logs')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching payment audit logs:', error);
    return [];
  }

  return (data || []).map(mapDbPaymentAuditLogToModel);
}

/**
 * Get orders for a client
 */
export async function getClientOrders(clientId: string, pagination?: PaginationOptions): Promise<Order[]> {
  let query = supabase
    .from('orders')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false });

  query = applyPagination(query, pagination);
  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
  return (data || []).map(mapDbOrderToModel);
}

// ============================================================================
// PAYMENT STATISTICS
// ============================================================================

/**
 * Get payment statistics for admin dashboard
 */
export async function getPaymentStatistics() {
  // Get all orders
  const { data: orders, error } = await supabase
    .from('orders')
    .select('status, amount');

  if (error) throw new Error(`Failed to fetch statistics: ${error.message}`);

  const stats = {
    pendingPayment: {
      count: 0,
      amount: 0,
    },
    paid: {
      count: 0,
      amount: 0,
    },
    total: {
      count: orders?.length || 0,
      amount: 0,
    },
  };

  orders?.forEach(order => {
    stats.total.amount += order.amount;

    if (order.status === 'PENDING_PAYMENT' || order.status === 'AWAITING_CONFIRMATION') {
      stats.pendingPayment.count++;
      stats.pendingPayment.amount += order.amount;
    } else if (
      order.status === 'PAYMENT_CONFIRMED' ||
      order.status === 'PROCESSING' ||
      order.status === 'READY_FOR_PICKUP' ||
      order.status === 'PICKUP_SCHEDULED' ||
      order.status === 'OUT_FOR_DELIVERY' ||
      order.status === 'IN_TRANSIT' ||
      order.status === 'SHIPPED' ||
      order.status === 'DELIVERED'
    ) {
      stats.paid.count++;
      stats.paid.amount += order.amount;
    }
  });

  return stats;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const bankTransferService = {
  // Bank details
  getActiveBankDetails,
  getAllBankDetails,
  createBankDetails,
  updateBankDetails,
  setActiveBankDetails,
  deleteBankDetails,

  // Order payment
  markOrderAsPaid,
  rejectPaymentSubmission,
  addPaymentReference,
  getPendingPaymentOrders,
  getOrderById,
  getPaymentAuditLogs,
  getClientOrders,

  // Statistics
  getPaymentStatistics,
};

export default bankTransferService;
