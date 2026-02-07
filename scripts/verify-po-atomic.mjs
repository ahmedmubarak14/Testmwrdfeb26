import { createClient } from '@supabase/supabase-js';

function getEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrderItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const productId = item.productId || item.product_id;
      const quantity = Number(item.quantity ?? 0);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { productId, quantity };
    })
    .filter(Boolean);
}

function aggregateQuantities(items) {
  const map = new Map();
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) || 0) + item.quantity);
  }
  return map;
}

async function resolveOrderItems(supabase, order) {
  const directItems = normalizeOrderItems(order.items);
  if (directItems.length > 0) {
    return directItems;
  }

  if (!order.quote_id) {
    return [];
  }

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('rfq_id')
    .eq('id', order.quote_id)
    .single();

  if (quoteError || !quote?.rfq_id) {
    throw new Error(`Unable to resolve quote/rfq for order ${order.id}: ${quoteError?.message || 'missing rfq_id'}`);
  }

  const { data: rfqItems, error: rfqItemsError } = await supabase
    .from('rfq_items')
    .select('product_id, quantity')
    .eq('rfq_id', quote.rfq_id);

  if (rfqItemsError) {
    throw new Error(`Unable to fetch rfq_items for rfq ${quote.rfq_id}: ${rfqItemsError.message}`);
  }

  return (rfqItems || [])
    .map((item) => ({
      productId: item.product_id,
      quantity: Number(item.quantity || 0),
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

async function fetchStocks(supabase, productIds) {
  if (!productIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, stock_quantity')
    .in('id', productIds);

  if (error) {
    throw new Error(`Failed to fetch product stocks: ${error.message}`);
  }

  const map = new Map();
  for (const row of data || []) {
    map.set(row.id, Number(row.stock_quantity || 0));
  }
  return map;
}

async function main() {
  const url = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  const adminEmail = getEnv('ADMIN_EMAIL');
  const adminPassword = getEnv('ADMIN_PASSWORD');
  const documentId = getEnv('TEST_DOCUMENT_ID');
  const concurrentRequests = asInt(process.env.CONCURRENT_REQUESTS, 5);

  const supabase = createClient(url, anonKey);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (authError || !authData.user) {
    throw new Error(`Admin authentication failed: ${authError?.message || 'unknown error'}`);
  }

  const { data: doc, error: docError } = await supabase
    .from('order_documents')
    .select('id, order_id, verified_at')
    .eq('id', documentId)
    .single();
  if (docError || !doc) {
    throw new Error(`Could not load order document ${documentId}: ${docError?.message || 'not found'}`);
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, items, quote_id, admin_verified')
    .eq('id', doc.order_id)
    .single();
  if (orderError || !order) {
    throw new Error(`Could not load order ${doc.order_id}: ${orderError?.message || 'not found'}`);
  }

  const orderItems = await resolveOrderItems(supabase, order);
  const expectedByProduct = aggregateQuantities(orderItems);
  const productIds = [...expectedByProduct.keys()];

  const beforeStocks = await fetchStocks(supabase, productIds);

  const results = await Promise.all(
    Array.from({ length: concurrentRequests }, async (_, idx) => {
      const startedAt = Date.now();
      const { data, error } = await supabase.rpc('verify_client_po_and_confirm_order', {
        p_document_id: documentId,
      });
      const durationMs = Date.now() - startedAt;
      return {
        call: idx + 1,
        success: !error,
        durationMs,
        error: error?.message || null,
        status: data?.status || null,
      };
    })
  );

  const afterStocks = await fetchStocks(supabase, productIds);

  const { data: orderAfter, error: orderAfterError } = await supabase
    .from('orders')
    .select('status, admin_verified')
    .eq('id', doc.order_id)
    .single();
  if (orderAfterError || !orderAfter) {
    throw new Error(`Could not reload order after verification: ${orderAfterError?.message || 'unknown'}`);
  }

  const allRpcSucceeded = results.every((r) => r.success);
  const wasAlreadyVerified = Boolean(doc.verified_at);
  const mismatches = [];

  for (const productId of productIds) {
    const before = beforeStocks.get(productId) ?? 0;
    const after = afterStocks.get(productId) ?? 0;
    const actualDelta = before - after;
    const expectedDelta = wasAlreadyVerified ? 0 : (expectedByProduct.get(productId) ?? 0);
    if (actualDelta !== expectedDelta) {
      mismatches.push({
        productId,
        before,
        after,
        expectedDelta,
        actualDelta,
      });
    }
  }

  const statusOk = orderAfter.status === 'CONFIRMED' && Boolean(orderAfter.admin_verified);

  console.log(JSON.stringify({
    documentId,
    orderId: doc.order_id,
    concurrentRequests,
    wasAlreadyVerified,
    rpcResults: results,
    allRpcSucceeded,
    statusAfter: orderAfter,
    mismatches,
  }, null, 2));

  if (!allRpcSucceeded) {
    throw new Error('One or more concurrent RPC calls failed');
  }
  if (!statusOk) {
    throw new Error(`Order not in expected verified state (status=${orderAfter.status}, admin_verified=${orderAfter.admin_verified})`);
  }
  if (mismatches.length > 0) {
    throw new Error('Stock delta mismatch detected (possible non-idempotent inventory update)');
  }

  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
