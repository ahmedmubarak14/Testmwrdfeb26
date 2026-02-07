# Edge Function Deployment Guide

## ⚠️ Security Critical: auth-rate-limit Function

The `auth-rate-limit` edge function is **required for production** to prevent brute-force login attacks.

### Current Status

**The function fails open** - if the edge function is missing or unreachable, the app will:
- Log a warning (first time only)
- Fall back to client-side rate limiting only
- **Allow logins to proceed**

This is acceptable for development but **NOT for production**.

---

## Deployment Steps

### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Or via npm
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to Your Project

```bash
supabase link --project-ref tuneojmajsqgvdkjcuen
```

### 4. Deploy the Edge Function

```bash
# Deploy auth-rate-limit function
supabase functions deploy auth-rate-limit

# Verify deployment
supabase functions list
```

### 5. Verify Deployment

Run this test to confirm the function is callable:

```bash
curl -i --location --request POST \
  'https://tuneojmajsqgvdkjcuen.supabase.co/functions/v1/auth-rate-limit' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"action":"check_login_attempt","email":"test@example.com"}'
```

Expected response:
```json
{"allowed":true}
```

---

## Alternative: Manual Deployment via Dashboard

1. Go to https://supabase.com/dashboard/project/tuneojmajsqgvdkjcuen/functions
2. Click "Create a new function"
3. Name: `auth-rate-limit`
4. Copy the contents of `/supabase/functions/auth-rate-limit/index.ts`
5. Click "Deploy function"

---

## Verification Checklist

After deployment, verify:

- [ ] Function appears in Supabase Dashboard → Edge Functions
- [ ] Function status shows "Active" (green)
- [ ] Test curl command returns `{"allowed":true}`
- [ ] App console shows NO warnings about missing rate limit function
- [ ] Login attempts are tracked in `login_attempts` table

---

## Production Hardening (Optional)

### Option 1: Fail Closed Instead of Open

Edit `src/services/authService.ts` lines 189-196:

```typescript
// BEFORE (fails open - allows login if function missing)
if (this.isLikelyMissingFunctionError(error)) {
  if (!this.hasWarnedAboutMissingRateLimitFunction) {
    logger.warn(`Rate limit function is not deployed. Falling back to local throttling.`);
    this.hasWarnedAboutMissingRateLimitFunction = true;
  }
  return { allowed: true }; // ⚠️ ALLOWS LOGIN
}

// AFTER (fails closed - blocks login if function missing)
if (this.isLikelyMissingFunctionError(error)) {
  logger.error(`Rate limit function is not deployed. Login blocked for security.`);
  return { 
    allowed: false, 
    error: 'Security service unavailable. Please try again later.' 
  };
}
```

### Option 2: Environment-Based Behavior

Only fail open in development:

```typescript
if (this.isLikelyMissingFunctionError(error)) {
  if (import.meta.env.DEV) {
    // Development: fail open
    logger.warn('Rate limit function missing (dev mode)');
    return { allowed: true };
  } else {
    // Production: fail closed
    logger.error('Rate limit function missing (production)');
    return { 
      allowed: false, 
      error: 'Security service unavailable.' 
    };
  }
}
```

---

## Monitoring

### Check Function Logs

```bash
supabase functions logs auth-rate-limit
```

### Monitor Login Attempts Table

```sql
-- Recent login attempts
SELECT email, COUNT(*) as attempts, MAX(attempted_at) as last_attempt
FROM login_attempts
WHERE attempted_at > NOW() - INTERVAL '1 hour'
GROUP BY email
ORDER BY attempts DESC;

-- Blocked users (8+ attempts in 15 min)
SELECT email, COUNT(*) as attempts
FROM login_attempts
WHERE attempted_at > NOW() - INTERVAL '15 minutes'
GROUP BY email
HAVING COUNT(*) >= 8;
```

---

## Troubleshooting

### Function returns 404

- Function not deployed or wrong name
- Check: `supabase functions list`

### Function returns 500

- Missing environment variables
- Check: Supabase Dashboard → Edge Functions → auth-rate-limit → Settings
- Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)

### Table doesn't exist error

- Run phase11 migration first:
  ```sql
  -- In Supabase SQL Editor
  \i supabase/migrations/20260208_phase11_login_attempts_table.sql
  ```

---

## Next Steps

1. ✅ Deploy the edge function
2. ✅ Run phase11 migration (creates `login_attempts` table)
3. ✅ Test with curl
4. ✅ Verify in app (no warnings in console)
5. ⚠️ Consider failing closed for production
