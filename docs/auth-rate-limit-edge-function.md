# Auth Rate Limit Edge Function Contract

The app now supports optional server-side login throttling through a Supabase Edge Function.

## Function Name

Default: `auth-rate-limit`  
Override via env: `VITE_AUTH_RATE_LIMIT_FUNCTION_NAME`

## Request Body

```json
{
  "action": "check_login_attempt | record_failed_login | reset_login_attempts",
  "email": "user@example.com"
}
```

## Expected Responses

### `check_login_attempt`

```json
{
  "allowed": true
}
```

or

```json
{
  "allowed": false,
  "message": "Too many login attempts. Please wait and try again.",
  "retryAfterSeconds": 300
}
```

### `record_failed_login`

```json
{
  "ok": true
}
```

### `reset_login_attempts`

```json
{
  "ok": true
}
```

## App Behavior

- If function exists: app checks server limit before sign-in, records failures, resets on success.
- If function does not exist or errors: app fails open and uses local in-browser throttling.
