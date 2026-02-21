import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockContext = vi.hoisted(() => {
  const state = {
    activeAuthUserId: 'client-1',
    acceptQuoteRpcResultMode: 'ORDER_ROW' as 'ORDER_ROW' | 'JSONB_WITH_ORDER_ID' | 'ORDER_ARRAY',
    users: [] as Array<{ id: string; role: string }>,
    quotes: [] as Array<Record<string, any>>,
    orders: [] as Array<Record<string, any>>,
    order_documents: [] as Array<Record<string, any>>,
    payment_audit_logs: [] as Array<Record<string, any>>,
  };

  const reset = () => {
    state.activeAuthUserId = 'client-1';
    state.acceptQuoteRpcResultMode = 'ORDER_ROW';
    state.users = [
      { id: 'client-1', role: 'CLIENT' },
      { id: 'supplier-1', role: 'SUPPLIER' },
      { id: 'admin-1', role: 'ADMIN' },
    ];
    state.quotes = [
      {
        id: 'quote-1',
        rfq_id: 'rfq-1',
        client_id: 'client-1',
        supplier_id: 'supplier-1',
        supplier_price: 1000,
        margin_percent: 20,
        final_price: 1200,
        lead_time: '5 days',
        status: 'SENT_TO_CLIENT',
      },
    ];
    state.orders = [];
    state.order_documents = [];
    state.payment_audit_logs = [];
  };

  const applyFilters = (rows: any[], filters: Array<(row: any) => boolean>): any[] =>
    rows.filter((row) => filters.every((predicate) => predicate(row)));

  const executeQuery = async (
    tableName: keyof typeof state,
    options: {
      mode: 'select' | 'update' | 'insert';
      filters: Array<(row: any) => boolean>;
      updatePayload?: Record<string, any>;
      insertPayload?: Record<string, any> | Record<string, any>[];
      expectSingle?: boolean;
    }
  ) => {
    const table = state[tableName] as any[];

    if (options.mode === 'insert') {
      const rows = Array.isArray(options.insertPayload) ? options.insertPayload : [options.insertPayload];
      const insertedRows = rows.map((row) => {
        const inserted = {
          id: row?.id ?? `${tableName}-${table.length + 1}`,
          created_at: row?.created_at ?? new Date().toISOString(),
          ...row,
        };
        table.push(inserted);
        return inserted;
      });

      return { data: Array.isArray(options.insertPayload) ? insertedRows : insertedRows[0], error: null };
    }

    const matchedRows = applyFilters(table, options.filters);
    if (options.mode === 'update') {
      matchedRows.forEach((row) => Object.assign(row, options.updatePayload));
      if (options.expectSingle) {
        return { data: matchedRows[0] ?? null, error: matchedRows[0] ? null : { message: 'No rows found' } };
      }
      return { data: matchedRows, error: null };
    }

    if (options.expectSingle) {
      return { data: matchedRows[0] ?? null, error: matchedRows[0] ? null : { message: 'No rows found' } };
    }
    return { data: matchedRows, error: null };
  };

  const buildQuery = (tableName: keyof typeof state) => {
    const context = {
      mode: 'select' as 'select' | 'update' | 'insert',
      filters: [] as Array<(row: any) => boolean>,
      updatePayload: undefined as Record<string, any> | undefined,
      insertPayload: undefined as Record<string, any> | Record<string, any>[] | undefined,
    };

    const query: any = {
      select: () => query,
      eq: (column: string, value: any) => {
        context.filters.push((row) => row[column] === value);
        return query;
      },
      in: (column: string, values: any[]) => {
        context.filters.push((row) => values.includes(row[column]));
        return query;
      },
      order: () => query,
      range: () => query,
      limit: () => query,
      update: (payload: Record<string, any>) => {
        context.mode = 'update';
        context.updatePayload = payload;
        return query;
      },
      insert: (payload: Record<string, any> | Record<string, any>[]) => {
        context.mode = 'insert';
        context.insertPayload = payload;
        return query;
      },
      async single() {
        return executeQuery(tableName, {
          mode: context.mode,
          filters: context.filters,
          updatePayload: context.updatePayload,
          insertPayload: context.insertPayload,
          expectSingle: true,
        });
      },
      then(resolve: any, reject: any) {
        return executeQuery(tableName, {
          mode: context.mode,
          filters: context.filters,
          updatePayload: context.updatePayload,
          insertPayload: context.insertPayload,
          expectSingle: false,
        }).then(resolve, reject);
      },
    };

    return query;
  };

  const supabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: state.activeAuthUserId } }, error: null };
      },
    },
    from(tableName: string) {
      if (!Object.prototype.hasOwnProperty.call(state, tableName)) {
        throw new Error(`Unsupported table in test mock: ${tableName}`);
      }
      return buildQuery(tableName as keyof typeof state);
    },
    async rpc(functionName: string, params: Record<string, any>) {
      if (functionName === 'accept_quote_and_deduct_credit') {
        const quote = state.quotes.find((item) => item.id === params.p_quote_id);
        if (!quote) {
          return { data: null, error: { message: 'Quote not found' } };
        }

        quote.status = 'ACCEPTED';
        const order = {
          id: `order-${state.orders.length + 1}`,
          quote_id: quote.id,
          client_id: quote.client_id,
          supplier_id: quote.supplier_id,
          amount: quote.final_price,
          status: 'PENDING_PAYMENT',
          date: '2026-02-07',
          payment_reference: null,
          payment_notes: null,
          payment_confirmed_at: null,
          payment_confirmed_by: null,
          payment_receipt_url: null,
          payment_submitted_at: null,
          payment_link_url: null,
          payment_link_sent_at: null,
          system_po_generated: false,
          client_po_uploaded: false,
          admin_verified: false,
          admin_verified_by: null,
          admin_verified_at: null,
          items: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        state.orders.push(order);
        if (state.acceptQuoteRpcResultMode === 'JSONB_WITH_ORDER_ID') {
          return {
            data: {
              success: true,
              order_id: order.id,
              quote_id: quote.id,
              amount: quote.final_price,
            },
            error: null,
          };
        }
        if (state.acceptQuoteRpcResultMode === 'ORDER_ARRAY') {
          return { data: [order], error: null };
        }
        return { data: order, error: null };
      }

      if (functionName === 'mark_order_as_paid') {
        const order = state.orders.find((item) => item.id === params.p_order_id);
        if (!order) {
          return { data: null, error: { message: 'Order not found' } };
        }

        order.status = 'PAYMENT_CONFIRMED';
        order.payment_reference = params.p_payment_reference ?? order.payment_reference;
        order.payment_notes = params.p_payment_notes ?? order.payment_notes;
        order.payment_confirmed_by = state.activeAuthUserId;
        order.payment_confirmed_at = new Date().toISOString();
        order.updated_at = new Date().toISOString();
        return { data: order, error: null };
      }

      if (functionName === 'reject_payment_submission') {
        const order = state.orders.find((item) => item.id === params.p_order_id);
        if (!order) {
          return { data: null, error: { message: 'Order not found' } };
        }

        if (order.status !== 'AWAITING_CONFIRMATION') {
          return { data: null, error: { message: 'Order is not awaiting confirmation' } };
        }

        order.status = 'PENDING_PAYMENT';
        order.payment_confirmed_by = null;
        order.payment_confirmed_at = null;
        order.payment_submitted_at = null;
        order.payment_notes = params.p_reason ?? order.payment_notes;
        order.updated_at = new Date().toISOString();

        state.payment_audit_logs.push({
          id: `payment_audit_logs-${state.payment_audit_logs.length + 1}`,
          order_id: order.id,
          actor_user_id: state.activeAuthUserId,
          actor_role: 'ADMIN',
          action: 'PAYMENT_REJECTED',
          from_status: 'AWAITING_CONFIRMATION',
          to_status: 'PENDING_PAYMENT',
          payment_reference: order.payment_reference ?? null,
          notes: params.p_reason ?? null,
          created_at: new Date().toISOString(),
        });

        return { data: order, error: null };
      }

      if (functionName === 'verify_client_po_and_confirm_order') {
        const document = state.order_documents.find((item) => item.id === params.p_document_id);
        if (!document) {
          return { data: null, error: { message: 'Document not found' } };
        }

        if (state.activeAuthUserId !== 'admin-1') {
          return { data: null, error: { message: 'Only admins can verify client POs' } };
        }

        const order = state.orders.find((item) => item.id === document.order_id);
        if (!order) {
          return { data: null, error: { message: 'Order not found' } };
        }

        if (order.status !== 'PENDING_ADMIN_CONFIRMATION') {
          return { data: null, error: { message: 'Order must be in PENDING_ADMIN_CONFIRMATION status for verification' } };
        }

        order.status = 'PENDING_PAYMENT';
        order.admin_verified = true;
        order.admin_verified_by = state.activeAuthUserId;
        order.admin_verified_at = new Date().toISOString();
        order.updated_at = new Date().toISOString();

        document.verified_by = state.activeAuthUserId;
        document.verified_at = new Date().toISOString();
        document.updated_at = new Date().toISOString();

        return { data: order, error: null };
      }

      return { data: null, error: { message: `Unsupported RPC: ${functionName}` } };
    },
  };

  reset();
  return { state, reset, supabase };
});

vi.mock('../lib/supabase', () => ({
  supabase: mockContext.supabase,
  auth: mockContext.supabase.auth,
  default: mockContext.supabase,
}));

import { api } from './api';
import { addPaymentReference, markOrderAsPaid, rejectPaymentSubmission } from './bankTransferService';
import { orderDocumentService } from './orderDocumentService';

describe('RFQ -> Quote -> Order -> Payment confirmation integration', () => {
  beforeEach(() => {
    mockContext.reset();
  });

  it('completes the happy-path flow with payment audit logs', async () => {
    const accepted = await api.acceptQuote('quote-1');

    expect(accepted.quote?.status).toBe('ACCEPTED');
    expect(accepted.order?.status).toBe('PENDING_PAYMENT');
    const orderId = accepted.order?.id;
    expect(orderId).toBeTruthy();

    mockContext.state.activeAuthUserId = 'client-1';
    const awaitingConfirmation = await addPaymentReference(
      orderId!,
      'BANK-REF-2026-001',
      'Client submitted transfer reference'
    );

    expect(awaitingConfirmation.status).toBe('AWAITING_CONFIRMATION');
    expect(awaitingConfirmation.paymentReference).toBe('BANK-REF-2026-001');

    mockContext.state.activeAuthUserId = 'admin-1';
    const paidOrder = await markOrderAsPaid(
      orderId!,
      'BANK-REF-2026-001',
      'Verified in bank statement'
    );

    expect(paidOrder.status).toBe('PAYMENT_CONFIRMED');
    expect(paidOrder.paymentReference).toBe('BANK-REF-2026-001');
    expect(paidOrder.paymentConfirmedBy).toBe('admin-1');

    expect(mockContext.state.payment_audit_logs).toHaveLength(2);
    expect(mockContext.state.payment_audit_logs[0].action).toBe('REFERENCE_SUBMITTED');
    expect(mockContext.state.payment_audit_logs[1].action).toBe('PAYMENT_CONFIRMED');
  });

  it('accepts quotes when RPC returns a JSON payload with order_id', async () => {
    mockContext.state.acceptQuoteRpcResultMode = 'JSONB_WITH_ORDER_ID';

    const accepted = await api.acceptQuote('quote-1');

    expect(accepted.quote?.status).toBe('ACCEPTED');
    expect(accepted.order?.id).toBeTruthy();
    expect(accepted.order?.quoteId).toBe('quote-1');
    expect(accepted.order?.status).toBe('PENDING_PAYMENT');
  });

  it('accepts quotes when RPC returns an array payload', async () => {
    mockContext.state.acceptQuoteRpcResultMode = 'ORDER_ARRAY';

    const accepted = await api.acceptQuote('quote-1');

    expect(accepted.quote?.status).toBe('ACCEPTED');
    expect(accepted.order?.id).toBeTruthy();
    expect(accepted.order?.quoteId).toBe('quote-1');
    expect(accepted.order?.status).toBe('PENDING_PAYMENT');
  });

  it('blocks non-admin users from confirming payment', async () => {
    const accepted = await api.acceptQuote('quote-1');
    const orderId = accepted.order?.id as string;

    mockContext.state.activeAuthUserId = 'client-1';
    await addPaymentReference(orderId, 'BANK-REF-2026-002');

    await expect(markOrderAsPaid(orderId, 'BANK-REF-2026-002')).rejects.toThrow(
      'Only admin users can perform this action'
    );
  });

  it('supports admin rejection and client resubmission of payment references', async () => {
    const accepted = await api.acceptQuote('quote-1');
    const orderId = accepted.order?.id as string;

    mockContext.state.activeAuthUserId = 'client-1';
    await addPaymentReference(orderId, 'BANK-REF-2026-003', 'First submission');

    mockContext.state.activeAuthUserId = 'admin-1';
    const rejectedOrder = await rejectPaymentSubmission(orderId, 'Reference does not match bank statement');
    expect(rejectedOrder.status).toBe('PENDING_PAYMENT');

    mockContext.state.activeAuthUserId = 'client-1';
    const resubmittedOrder = await addPaymentReference(orderId, 'BANK-REF-2026-003-RETRY', 'Resubmitted');
    expect(resubmittedOrder.status).toBe('AWAITING_CONFIRMATION');
    expect(resubmittedOrder.paymentReference).toBe('BANK-REF-2026-003-RETRY');

    expect(mockContext.state.payment_audit_logs).toHaveLength(3);
    expect(mockContext.state.payment_audit_logs[0].action).toBe('REFERENCE_SUBMITTED');
    expect(mockContext.state.payment_audit_logs[1].action).toBe('PAYMENT_REJECTED');
    expect(mockContext.state.payment_audit_logs[2].action).toBe('REFERENCE_SUBMITTED');
  });

  it('moves verified client PO orders from PENDING_ADMIN_CONFIRMATION to PENDING_PAYMENT', async () => {
    const orderId = 'order-po-1';
    const documentId = 'doc-po-1';

    mockContext.state.orders.push({
      id: orderId,
      quote_id: 'quote-1',
      client_id: 'client-1',
      supplier_id: 'supplier-1',
      amount: 1200,
      status: 'PENDING_ADMIN_CONFIRMATION',
      date: '2026-02-07',
      payment_reference: null,
      payment_notes: null,
      payment_confirmed_at: null,
      payment_confirmed_by: null,
      payment_receipt_url: null,
      payment_submitted_at: null,
      payment_link_url: null,
      payment_link_sent_at: null,
      system_po_generated: true,
      client_po_uploaded: true,
      admin_verified: false,
      admin_verified_by: null,
      admin_verified_at: null,
      items: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContext.state.order_documents.push({
      id: documentId,
      order_id: orderId,
      document_type: 'CLIENT_PO',
      file_url: 'storage://order-documents/po.pdf',
      file_name: 'client-po.pdf',
      uploaded_by: 'client-1',
      verified_by: null,
      verified_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContext.state.activeAuthUserId = 'admin-1';
    await orderDocumentService.verifyClientPO(documentId);

    const updatedOrder = mockContext.state.orders.find((order) => order.id === orderId);
    expect(updatedOrder?.status).toBe('PENDING_PAYMENT');
    expect(updatedOrder?.admin_verified).toBe(true);
    expect(updatedOrder?.admin_verified_by).toBe('admin-1');

    const updatedDocument = mockContext.state.order_documents.find((doc) => doc.id === documentId);
    expect(updatedDocument?.verified_by).toBe('admin-1');
    expect(updatedDocument?.verified_at).toBeTruthy();
  });

  it('rejects client PO verification for non-admin users', async () => {
    const orderId = 'order-po-2';
    const documentId = 'doc-po-2';

    mockContext.state.orders.push({
      id: orderId,
      quote_id: 'quote-1',
      client_id: 'client-1',
      supplier_id: 'supplier-1',
      amount: 1200,
      status: 'PENDING_ADMIN_CONFIRMATION',
      date: '2026-02-07',
      payment_reference: null,
      payment_notes: null,
      payment_confirmed_at: null,
      payment_confirmed_by: null,
      payment_receipt_url: null,
      payment_submitted_at: null,
      payment_link_url: null,
      payment_link_sent_at: null,
      system_po_generated: true,
      client_po_uploaded: true,
      admin_verified: false,
      admin_verified_by: null,
      admin_verified_at: null,
      items: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContext.state.order_documents.push({
      id: documentId,
      order_id: orderId,
      document_type: 'CLIENT_PO',
      file_url: 'storage://order-documents/po.pdf',
      file_name: 'client-po.pdf',
      uploaded_by: 'client-1',
      verified_by: null,
      verified_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContext.state.activeAuthUserId = 'client-1';
    await expect(orderDocumentService.verifyClientPO(documentId)).rejects.toMatchObject({
      message: 'Only admins can verify client POs',
    });
  });

  it('blocks invalid status transition when confirming payment', async () => {
    mockContext.state.orders.push({
      id: 'order-invalid-transition',
      quote_id: 'quote-1',
      client_id: 'client-1',
      supplier_id: 'supplier-1',
      amount: 1200,
      status: 'PENDING_ADMIN_CONFIRMATION',
      date: '2026-02-07',
      payment_reference: null,
      payment_notes: null,
      payment_confirmed_at: null,
      payment_confirmed_by: null,
      payment_receipt_url: null,
      payment_submitted_at: null,
      payment_link_url: null,
      payment_link_sent_at: null,
      system_po_generated: true,
      client_po_uploaded: true,
      admin_verified: true,
      admin_verified_by: 'admin-1',
      admin_verified_at: new Date().toISOString(),
      items: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContext.state.activeAuthUserId = 'admin-1';
    await expect(
      markOrderAsPaid('order-invalid-transition', 'BANK-REF-INVALID')
    ).rejects.toThrow('Invalid order status transition: PENDING_ADMIN_CONFIRMATION -> PAYMENT_CONFIRMED');
  });

  it('requires a non-empty reason when rejecting a payment submission', async () => {
    const accepted = await api.acceptQuote('quote-1');
    const orderId = accepted.order?.id as string;

    mockContext.state.activeAuthUserId = 'client-1';
    await addPaymentReference(orderId, 'BANK-REF-2026-004');

    mockContext.state.activeAuthUserId = 'admin-1';
    await expect(rejectPaymentSubmission(orderId, '   ')).rejects.toThrow('Rejection reason is required');
  });
});
