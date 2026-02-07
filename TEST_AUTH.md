# Authentication Investigation Test

## Test the authentication flow

Open browser console and try logging in with:
- Email: client+demo@example.com
- Password: CHANGE_ME_CLIENT_PASSWORD

Check the console output for:
1. App mode (SUPABASE vs MOCK)
2. Authentication attempt logs
3. Any error messages

## Expected Console Output:

```
╔══════════════════════════════════════╗
║   MWRD Application Configuration   ║
╚══════════════════════════════════════╝
🔧 Mode: SUPABASE
📊 Database: ENABLED (Supabase)
```

Then on login:
```
═══════════════════════════════════
🔐 LOGIN ATTEMPT
   Email: client+demo@example.com
   Mode: SUPABASE
═══════════════════════════════════
→ Using Supabase authentication
🔐 Attempting Supabase authentication...
```

If you see errors, paste them here.

## Common Issues:

1. **If console shows "Mode: MOCK"** → Environment variables not loaded
2. **If you see "Supabase not configured"** → Config issue
3. **If you see "Invalid login credentials"** → Password mismatch in Supabase Auth
4. **If you see "User profile not found"** → RLS policy or ID linking issue
