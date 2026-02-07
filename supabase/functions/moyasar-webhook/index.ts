import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MOYASAR_SECRET_KEY = Deno.env.get("MOYASAR_SECRET_KEY") ?? "";
const MOYASAR_WEBHOOK_SECRET = Deno.env.get("MOYASAR_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-moyasar-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DbPaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CANCELLED";

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  : null;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function mapMoyasarStatus(moyasarStatus: string): DbPaymentStatus {
  const statusMap: Record<string, DbPaymentStatus> = {
    initiated: "PENDING",
    paid: "PAID",
    failed: "FAILED",
    authorized: "AUTHORIZED",
    captured: "CAPTURED",
    refunded: "REFUNDED",
    voided: "CANCELLED",
  };

  return statusMap[moyasarStatus] || "PENDING";
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const normalizedSignature = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!normalizedSignature || !secret) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  const computed = toHex(new Uint8Array(signed)).toLowerCase();
  return constantTimeEqual(computed, normalizedSignature);
}

async function fetchMoyasarPayment(moyasarPaymentId: string) {
  if (!MOYASAR_SECRET_KEY) {
    throw new Error("Missing MOYASAR_SECRET_KEY");
  }

  const basic = btoa(`${MOYASAR_SECRET_KEY}:`);
  const response = await fetch(`https://api.moyasar.com/v1/payments/${moyasarPaymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Moyasar fetch failed (${response.status}): ${responseText}`);
  }

  return response.json();
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return null;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

async function applyMoyasarPaymentUpdate(moyasarPayment: any) {
  if (!adminClient) {
    throw new Error("Supabase service role env vars are not configured");
  }

  const moyasarPaymentId = String(moyasarPayment?.id || "");
  if (!moyasarPaymentId) {
    throw new Error("Missing Moyasar payment id");
  }

  const mappedStatus = mapMoyasarStatus(String(moyasarPayment.status || ""));

  const { data: paymentRecord, error: paymentLookupError } = await adminClient
    .from("payments")
    .select("*")
    .eq("moyasar_payment_id", moyasarPaymentId)
    .maybeSingle();

  if (paymentLookupError) {
    throw new Error(`Failed to find payment record: ${paymentLookupError.message}`);
  }

  if (!paymentRecord) {
    throw new Error(`No payment found for moyasar_payment_id=${moyasarPaymentId}`);
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: mappedStatus,
    updated_at: nowIso,
    moyasar_transaction_url: moyasarPayment?.source?.transaction_url || paymentRecord.moyasar_transaction_url,
    metadata: moyasarPayment?.metadata ?? paymentRecord.metadata,
  };

  if (mappedStatus === "AUTHORIZED") updatePayload.authorized_at = nowIso;
  if (mappedStatus === "PAID" || mappedStatus === "CAPTURED") updatePayload.paid_at = nowIso;
  if (mappedStatus === "FAILED" || mappedStatus === "CANCELLED") {
    updatePayload.failed_at = nowIso;
    updatePayload.failure_reason = moyasarPayment?.source?.message || "Payment failed";
  }
  if (mappedStatus === "REFUNDED" || mappedStatus === "PARTIALLY_REFUNDED") {
    updatePayload.refunded_at = nowIso;
  }

  const { data: updatedPayment, error: paymentUpdateError } = await adminClient
    .from("payments")
    .update(updatePayload)
    .eq("id", paymentRecord.id)
    .select("*")
    .single();

  if (paymentUpdateError) {
    throw new Error(`Failed to update payment record: ${paymentUpdateError.message}`);
  }

  if (mappedStatus === "PAID" || mappedStatus === "CAPTURED") {
    await adminClient
      .from("orders")
      .update({
        status: "PAYMENT_CONFIRMED",
        updated_at: nowIso,
      })
      .eq("id", paymentRecord.order_id)
      .in("status", ["PENDING_PAYMENT", "AWAITING_CONFIRMATION"]);

    await adminClient
      .from("invoices")
      .update({
        status: "PAID",
        paid_date: nowIso.split("T")[0],
        updated_at: nowIso,
      })
      .eq("order_id", paymentRecord.order_id)
      .in("status", ["SENT", "OVERDUE"]);
  }

  return updatedPayment;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, {
      success: false,
      error: "Missing required Supabase environment variables",
    });
  }

  try {
    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    const signatureHeader = req.headers.get("x-moyasar-signature") || "";

    const isWebhookRequest = Boolean(signatureHeader);
    if (isWebhookRequest) {
      const signatureValid = await verifyWebhookSignature(rawBody, signatureHeader, MOYASAR_WEBHOOK_SECRET);
      if (!signatureValid) {
        return jsonResponse(401, { success: false, error: "Invalid webhook signature" });
      }

      const moyasarPayment = body?.data || body;
      const payment = await applyMoyasarPaymentUpdate(moyasarPayment);
      return jsonResponse(200, {
        success: true,
        source: "webhook",
        payment,
      });
    }

    if (body?.mode === "sync_by_payment_id") {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) {
        return jsonResponse(401, { success: false, error: "Unauthorized" });
      }

      const paymentId = String(body?.paymentId || "");
      if (!paymentId) {
        return jsonResponse(400, { success: false, error: "paymentId is required" });
      }

      const { data: userRow, error: userError } = await adminClient
        .from("users")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (userError || !userRow) {
        return jsonResponse(403, { success: false, error: "User role lookup failed" });
      }

      const { data: paymentRow, error: paymentRowError } = await adminClient
        .from("payments")
        .select("id, client_id, moyasar_payment_id")
        .eq("id", paymentId)
        .single();

      if (paymentRowError || !paymentRow) {
        return jsonResponse(404, { success: false, error: "Payment not found" });
      }

      const isAdmin = userRow.role === "ADMIN";
      if (!isAdmin && paymentRow.client_id !== userId) {
        return jsonResponse(403, { success: false, error: "Forbidden" });
      }

      if (!paymentRow.moyasar_payment_id) {
        return jsonResponse(400, { success: false, error: "Payment missing moyasar_payment_id" });
      }

      const moyasarPayment = await fetchMoyasarPayment(paymentRow.moyasar_payment_id);
      const payment = await applyMoyasarPaymentUpdate(moyasarPayment);
      return jsonResponse(200, {
        success: true,
        source: "sync",
        payment,
      });
    }

    return jsonResponse(400, {
      success: false,
      error: "Unsupported request payload",
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected function error",
    });
  }
});
