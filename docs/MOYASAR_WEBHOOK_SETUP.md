# Moyasar Webhook Setup Guide

This guide explains how to set up webhooks to receive payment notifications from Moyasar.

## Overview

Moyasar sends webhooks to notify your application about payment events such as:
- `payment_paid` - Payment was successful
- `payment_failed` - Payment failed
- `payment_refunded` - Payment was refunded

## Setup Steps

### 1. Configure Webhook URL in Moyasar Dashboard

1. Log in to your [Moyasar Dashboard](https://moyasar.com/dashboard)
2. Go to **Settings** > **Webhooks**
3. Add your webhook endpoint URL:
   ```
   https://your-domain.com/api/webhooks/moyasar
   ```
4. Save the webhook secret provided by Moyasar

### 2. Implement Webhook Handler

You have two options for handling webhooks:

#### Option A: Supabase Edge Function (Recommended)

Create a Supabase Edge Function to handle webhooks:

```bash
supabase functions new moyasar-webhook
```

#### Option B: Custom Backend Server

Create an Express.js endpoint or similar.

## Sample Webhook Handler (Supabase Edge Function)

Create `supabase/functions/moyasar-webhook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const moyasarWebhookSecret = Deno.env.get('MOYASAR_WEBHOOK_SECRET')

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload = await req.json()

    // Verify webhook signature (if Moyasar provides one)
    // const signature = req.headers.get('X-Moyasar-Signature')
    // if (!verifySignature(payload, signature, moyasarWebhookSecret)) {
    //   return new Response('Invalid signature', { status: 401 })
    // }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle different webhook events
    switch (payload.type) {
      case 'payment_paid':
        await handlePaymentPaid(supabase, payload.data)
        break
      case 'payment_failed':
        await handlePaymentFailed(supabase, payload.data)
        break
      case 'payment_refunded':
        await handlePaymentRefunded(supabase, payload.data)
        break
      default:
        console.log('Unhandled webhook type:', payload.type)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

async function handlePaymentPaid(supabase: any, paymentData: any) {
  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'PAID',
      paid_at: new Date().toISOString(),
      metadata: paymentData
    })
    .eq('moyasar_payment_id', paymentData.id)

  if (error) throw error

  // Update order status
  const payment = data[0]
  if (payment) {
    await supabase
      .from('orders')
      .update({ status: 'IN_TRANSIT' })
      .eq('id', payment.order_id)
  }

  // Update invoice status
  await supabase
    .from('invoices')
    .update({
      status: 'PAID',
      paid_date: new Date().toISOString().split('T')[0]
    })
    .eq('order_id', payment.order_id)
}

async function handlePaymentFailed(supabase: any, paymentData: any) {
  await supabase
    .from('payments')
    .update({
      status: 'FAILED',
      failed_at: new Date().toISOString(),
      failure_reason: paymentData.source?.message || 'Payment failed',
      metadata: paymentData
    })
    .eq('moyasar_payment_id', paymentData.id)
}

async function handlePaymentRefunded(supabase: any, paymentData: any) {
  await supabase
    .from('payments')
    .update({
      status: 'REFUNDED',
      refunded_at: new Date().toISOString(),
      metadata: paymentData
    })
    .eq('moyasar_payment_id', paymentData.id)
}
```

## Deploy Edge Function

```bash
supabase functions deploy moyasar-webhook
```

## Configure Webhook URL

After deploying, your webhook URL will be:
```
https://[your-project-ref].supabase.co/functions/v1/moyasar-webhook
```

Add this URL to your Moyasar dashboard.

## Testing Webhooks

### Local Testing with ngrok

1. Install ngrok: `npm install -g ngrok`
2. Run your local server
3. Expose it: `ngrok http 3000`
4. Use the ngrok URL in Moyasar dashboard for testing

### Moyasar Test Webhooks

Moyasar provides test webhook events you can trigger from their dashboard to test your integration.

## Security Best Practices

1. **Verify Webhook Signatures**: Always verify that webhooks come from Moyasar
2. **Use HTTPS**: Only accept webhooks over HTTPS
3. **Idempotency**: Handle duplicate webhooks gracefully
4. **Retry Logic**: Implement retries for failed webhook processing
5. **Logging**: Log all webhook events for debugging

## Environment Variables

Add these to your `.env`:

```bash
MOYASAR_WEBHOOK_SECRET=your_webhook_secret_here
```

## Troubleshooting

### Webhook Not Received

1. Check that the URL is publicly accessible
2. Verify HTTPS is enabled
3. Check Supabase function logs: `supabase functions logs moyasar-webhook`

### Payment Status Not Updating

1. Check database RLS policies allow webhook updates
2. Verify Moyasar payment ID matches database record
3. Check function logs for errors

## References

- [Moyasar API Documentation](https://moyasar.com/docs/api/)
- [Moyasar Webhooks Guide](https://moyasar.com/docs/webhooks/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
