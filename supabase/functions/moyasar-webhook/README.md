# `moyasar-webhook` Edge Function

Secure server-side handler for:

1. Moyasar webhook signature verification (`x-moyasar-signature`)
2. Payment status synchronization by `paymentId` (invoked by authenticated clients)

## Required Function Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `MOYASAR_SECRET_KEY`
- `MOYASAR_WEBHOOK_SECRET`

## Deploy

```bash
supabase functions deploy moyasar-webhook
```

## Set Secrets

```bash
supabase secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_ANON_KEY=... \
  MOYASAR_SECRET_KEY=... \
  MOYASAR_WEBHOOK_SECRET=...
```

## Frontend Invocation

Client code calls:

```ts
supabase.functions.invoke('moyasar-webhook', {
  body: { mode: 'sync_by_payment_id', paymentId }
});
```
