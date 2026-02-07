# Moyasar Payment Integration

Complete payment gateway integration for MWRD B2B Marketplace using Moyasar.

## Overview

This integration provides:
- ✅ Secure credit card payments (MADA, Visa, Mastercard)
- ✅ Payment tracking and history
- ✅ Invoice generation with VAT (15%)
- ✅ Refund processing
- ✅ Webhook support for payment notifications
- ✅ Client payment dashboard

## Quick Start

### 1. Get Moyasar API Keys

1. Sign up at [Moyasar](https://moyasar.com)
2. Go to **Dashboard** > **Settings** > **API Keys**
3. Copy your:
   - Secret Key (for server-side)
   - Publishable Key (for client-side)

### 2. Configure Environment Variables

Update `.env.local`:

```bash
# Moyasar Payment Gateway
VITE_MOYASAR_API_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxx
VITE_MOYASAR_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxx
```

### 3. Run Database Migrations

Execute the payment tables migration in Supabase SQL Editor:

```bash
supabase/migrations/005_payment_tables.sql
```

This creates:
- `payments` table
- `invoices` table
- `refunds` table
- Related enums, indexes, and RLS policies

### 4. Test the Integration

1. Start the dev server: `npm run dev`
2. Log in as a client: `client+demo@example.com` / `CHANGE_ME_CLIENT_PASSWORD`
3. Navigate to an order
4. Click "Pay Now" to proceed to checkout
5. Use Moyasar test cards for testing

## Features

### Payment Processing

**Supported Payment Methods:**
- Credit Cards (Visa, Mastercard)
- MADA cards (Saudi local cards)
- Apple Pay (coming soon)
- STC Pay (coming soon)

**Payment Flow:**
1. Client accepts a quote
2. Order is created
3. Client clicks "Pay Now"
4. Checkout page displays payment form
5. Payment is processed through Moyasar
6. Status is updated via webhook
7. Invoice is generated

### Database Schema

#### Payments Table
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  client_id UUID REFERENCES users(id),
  moyasar_payment_id TEXT,
  amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'SAR',
  payment_method payment_method_type,
  status payment_status,
  card_last_four TEXT,
  card_brand TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Invoices Table
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  invoice_number TEXT UNIQUE,
  subtotal DECIMAL(10, 2),
  tax_percent DECIMAL(5, 2) DEFAULT 15.00,
  tax_amount DECIMAL(10, 2),
  total_amount DECIMAL(10, 2),
  status invoice_status,
  issue_date DATE,
  due_date DATE,
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Services

#### Moyasar Service (`src/services/moyasarService.ts`)

```typescript
import moyasarService from './services/moyasarService'

// Create a payment
const payment = await moyasarService.createPayment({
  amount: moyasarService.toHalalas(100), // 100 SAR
  currency: 'SAR',
  description: 'Order #12345',
  callback_url: 'https://yourdomain.com/callback',
  source: {
    type: 'creditcard',
    name: 'Ahmed Ali',
    number: '4111111111111111',
    cvc: '123',
    month: '12',
    year: '25'
  }
})

// Fetch payment status
const paymentStatus = await moyasarService.fetchPayment(paymentId)

// Process refund
const refund = await moyasarService.refundPayment(paymentId, {
  amount: moyasarService.toHalalas(50),
  reason: 'Customer request'
})
```

#### Payment Service (`src/services/paymentService.ts`)

```typescript
import paymentService from './services/paymentService'

// Process checkout
const result = await paymentService.processCheckout(
  orderId,
  clientId,
  amount,
  checkoutFormData,
  callbackUrl
)

// Get payment history
const payments = await paymentService.getPaymentsByClientId(clientId)

// Generate invoice
const invoice = await paymentService.generateInvoiceForOrder(
  orderId,
  clientId,
  supplierId,
  subtotal
)
```

### Components

#### Checkout Page
```typescript
import { Checkout } from './pages/Checkout'

<Checkout
  orderId="uuid"
  clientId="uuid"
  amount={1500}
  onSuccess={() => console.log('Payment successful')}
  onCancel={() => console.log('Payment cancelled')}
/>
```

#### Payment History
```typescript
import { PaymentHistory } from './components/PaymentHistory'

<PaymentHistory clientId="uuid" />
```

## Testing

### Test Card Numbers

Moyasar provides test cards for testing different scenarios:

**Successful Payment:**
```
Card Number: 4111 1111 1111 1111
Expiry: Any future date
CVC: Any 3 digits
```

**Failed Payment:**
```
Card Number: 4000 0000 0000 0002
Expiry: Any future date
CVC: Any 3 digits
```

**MADA Card (Saudi):**
```
Card Number: 5297 4100 0000 0332
Expiry: Any future date
CVC: Any 3 digits
```

### Testing Locally

1. Use test API keys from Moyasar dashboard
2. All test payments will be in test mode
3. No real money will be charged
4. Test webhooks can be triggered from Moyasar dashboard

## Webhooks

Webhooks notify your application when payment events occur.

**Setup:**
1. Create Supabase Edge Function (see `docs/MOYASAR_WEBHOOK_SETUP.md`)
2. Configure webhook URL in Moyasar dashboard
3. Verify webhook signatures for security

**Webhook Events:**
- `payment_paid` - Payment succeeded
- `payment_failed` - Payment failed
- `payment_refunded` - Payment refunded

See full webhook setup guide: `docs/MOYASAR_WEBHOOK_SETUP.md`

## Security

### Best Practices

1. **API Keys:**
   - Never commit API keys to git
   - Use environment variables
   - Use test keys for development
   - Use production keys only in production

2. **PCI Compliance:**
   - Never store full card numbers
   - Only store last 4 digits
   - Use Moyasar's tokenization
   - All card data is encrypted by Moyasar

3. **Webhooks:**
   - Verify webhook signatures
   - Use HTTPS only
   - Implement idempotency
   - Log all webhook events

4. **Database Security:**
   - RLS policies protect payment data
   - Clients can only see their own payments
   - Admins have full access
   - Audit logs for sensitive operations

## VAT Calculation

Saudi Arabia applies 15% VAT on most goods and services:

```typescript
const subtotal = 1000 // SAR
const taxPercent = 15
const taxAmount = subtotal * (taxPercent / 100) // 150 SAR
const total = subtotal + taxAmount // 1150 SAR
```

Invoices automatically calculate VAT using the `calculate_invoice_totals()` trigger.

## Troubleshooting

### Payment Failed

**Common causes:**
- Invalid card details
- Insufficient funds
- Card expired
- Card blocked by bank

**Solution:**
- Check error message in `failure_reason` field
- Ask user to try different card
- Contact Moyasar support for persistent issues

### Webhook Not Received

**Check:**
1. Webhook URL is publicly accessible
2. HTTPS is enabled
3. Supabase Edge Function is deployed
4. Check function logs for errors

### Payment Status Not Updating

**Check:**
1. Database RLS policies
2. Moyasar payment ID matches
3. Webhook is being received
4. Check application logs

## API Reference

### Payment Statuses

- `PENDING` - Payment initiated, awaiting processing
- `AUTHORIZED` - Payment authorized, not yet captured
- `CAPTURED` - Payment captured (for authorize-then-capture flow)
- `PAID` - Payment successful and completed
- `FAILED` - Payment failed
- `REFUNDED` - Payment fully refunded
- `PARTIALLY_REFUNDED` - Payment partially refunded
- `CANCELLED` - Payment cancelled

### Invoice Statuses

- `DRAFT` - Invoice created but not sent
- `SENT` - Invoice sent to client
- `PAID` - Invoice paid
- `OVERDUE` - Payment past due date
- `CANCELLED` - Invoice cancelled

## Production Checklist

Before going live:

- [ ] Switch to production Moyasar API keys
- [ ] Set up webhook endpoint in production
- [ ] Configure SSL/HTTPS for webhook URL
- [ ] Test payment flow end-to-end
- [ ] Set up payment monitoring and alerts
- [ ] Configure invoice email notifications
- [ ] Set up backup payment processor (optional)
- [ ] Review and test refund process
- [ ] Train support team on payment issues
- [ ] Set up fraud detection rules (if applicable)

## Support

### Moyasar Support
- Email: support@moyasar.com
- Docs: https://moyasar.com/docs/
- Dashboard: https://moyasar.com/dashboard

### Internal Support
- Check logs in Supabase dashboard
- Review payment records in database
- Check webhook delivery logs
- Contact development team

## Future Enhancements

Planned features:
- [ ] Recurring payments / subscriptions
- [ ] Payment plans / installments
- [ ] Multiple currency support
- [ ] Saved payment methods
- [ ] Apple Pay integration
- [ ] STC Pay integration
- [ ] Payment analytics dashboard
- [ ] Automated invoice PDF generation
- [ ] Email notifications for payments
- [ ] SMS notifications for receipts

## License

This payment integration is part of the MWRD Marketplace platform.
