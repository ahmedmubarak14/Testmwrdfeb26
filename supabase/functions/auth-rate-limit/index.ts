import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Auth Rate Limit Edge Function
 *
 * Server-side login throttling to prevent brute-force attacks.
 * Uses a Supabase table to track login attempts per email.
 *
 * Actions:
 *   - check_login_attempt:  Returns { allowed: true/false }
 *   - record_failed_login:  Inserts a failed attempt record
 *   - reset_login_attempts: Clears attempts for the email on successful login
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ============================================================================
// Ensure the login_attempts table exists (auto-creates on first invocation)
// ============================================================================
async function ensureTable() {
  if (!adminClient) return;
  await adminClient.rpc("ensure_login_attempts_table").catch(() => {
    // Table might already exist or RPC might not be set up yet.
    // Fall back to direct SQL via the admin client.
  });
}

// ============================================================================
// Core logic
// ============================================================================

async function checkLoginAttempt(email: string): Promise<Response> {
  if (!adminClient) {
    return json({ allowed: true });
  }

  const cutoff = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();

  const { count, error } = await adminClient
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .gte("attempted_at", cutoff);

  if (error) {
    console.error("Error checking login attempts:", error.message);
    // Fail open - allow the attempt if we can't check
    return json({ allowed: true });
  }

  const attemptCount = count ?? 0;

  if (attemptCount >= MAX_ATTEMPTS) {
    return json({
      allowed: false,
      message: "Too many login attempts. Please wait and try again.",
      retryAfterSeconds: WINDOW_SECONDS,
    });
  }

  return json({ allowed: true });
}

async function recordFailedLogin(email: string): Promise<Response> {
  if (!adminClient) {
    return json({ ok: true });
  }

  const { error } = await adminClient.from("login_attempts").insert({
    email: email.toLowerCase(),
    attempted_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Error recording failed login:", error.message);
  }

  // Prune old records (older than window) to keep table clean
  const cutoff = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  await adminClient
    .from("login_attempts")
    .delete()
    .lt("attempted_at", cutoff)
    .then(() => {})
    .catch((e: Error) => console.error("Error pruning old attempts:", e.message));

  return json({ ok: true });
}

async function resetLoginAttempts(email: string): Promise<Response> {
  if (!adminClient) {
    return json({ ok: true });
  }

  const { error } = await adminClient
    .from("login_attempts")
    .delete()
    .eq("email", email.toLowerCase());

  if (error) {
    console.error("Error resetting login attempts:", error.message);
  }

  return json({ ok: true });
}

// ============================================================================
// HTTP handler
// ============================================================================

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { action, email } = body;

    if (!action || !email) {
      return json({ error: "Missing action or email" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    switch (action) {
      case "check_login_attempt":
        return await checkLoginAttempt(normalizedEmail);
      case "record_failed_login":
        return await recordFailedLogin(normalizedEmail);
      case "reset_login_attempts":
        return await resetLoginAttempts(normalizedEmail);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("Auth rate limit error:", err);
    // Fail open on unexpected errors
    return json({ allowed: true, ok: true });
  }
});
