// 4Keys Partner Portal (4PP) for 4MED, as in 4POS. The 4PP API key must never
// reach the browser, so the app calls this function, which adds the key.
// Secrets: FOURKEYS_PARTNER_URL (e.g. https://partners.4-keys.net) and
// FOURKEYS_PARTNER_API_KEY; SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are built in. API reference: docs/INTEGRATION.md
// in the 4PP repository.
//
// POST { action: "check", code }
//   Anyone (the sign-up form isn't signed in yet).
//   -> { status: "valid", code, partner_name } | { status: "invalid" | "unavailable", code }
//
// POST { action: "record", doctor_id }
//   4MED admins only. Reports the practice's first paid invoice to 4PP once,
//   so the partner earns their fee, and saves the outcome on partner_referrals.
//   -> { status: "recorded", fee } | { status: "rejected" | "failed", detail } | { status: "nothing", detail }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const PARTNER_CODE = /^4PP[A-Z0-9]+$/;

function portalConfig() {
  const base = Deno.env.get("FOURKEYS_PARTNER_URL")?.trim().replace(/\/+$/, "");
  const key = Deno.env.get("FOURKEYS_PARTNER_API_KEY")?.trim();
  return base && key ? { base, key } : null;
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The caller's user id when they are a 4MED admin (profiles.role), else null. */
async function adminId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: anon } });
  if (!res.ok) return null;
  const user = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!user?.id) return null;
  const { data } = await serviceClient().from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user.id : null;
}

async function checkCode(raw: string) {
  const code = raw.toUpperCase().replace(/\s+/g, "").slice(0, 40);
  if (!PARTNER_CODE.test(code)) return { status: "invalid", code };
  const cfg = portalConfig();
  if (!cfg) return { status: "unavailable", code };
  try {
    const res = await fetch(`${cfg.base}/api/v1/referral-codes/${encodeURIComponent(code)}`, {
      headers: { "X-API-Key": cfg.key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: "unavailable", code };
    const body = (await res.json()) as { valid?: boolean; code?: string; partner?: { display_name?: string } };
    if (!body.valid) return { status: "invalid", code };
    return { status: "valid", code: body.code ?? code, partner_name: body.partner?.display_name ?? null };
  } catch {
    return { status: "unavailable", code };
  }
}

async function recordReferral(doctorId: string) {
  const db = serviceClient();
  const { data: ref } = await db.from("partner_referrals").select("*").eq("doctor_id", doctorId).maybeSingle();
  if (!ref) return { status: "nothing", detail: "No partner code on this practice" };
  if (ref.status === "recorded") return { status: "nothing", detail: "Already credited in 4PP" };

  // Stick to the invoice of an earlier attempt so a retry reports the same one;
  // otherwise the practice's first paid invoice.
  let q = db.from("subscription_invoices").select("*").eq("doctor_id", doctorId).eq("status", "paid");
  q = ref.invoice_id ? q.eq("id", ref.invoice_id) : q.order("paid_at", { ascending: true }).limit(1);
  const { data: invoices } = await q;
  const inv = invoices?.[0];
  if (!inv) return { status: "nothing", detail: "No paid invoice yet" };
  // 4PP gets the price before the welcome discount and any referral credit.
  const gross = Number(inv.gross ?? (Number(inv.amount) + Number(inv.discount ?? 0) + Number(inv.credit_used ?? 0)));
  if (!(gross > 0)) return { status: "nothing", detail: "The first paid invoice had no amount" };

  const { data: prof } = await db.from("profiles").select("full_name").eq("id", doctorId).maybeSingle();

  let result: { status: string; fee?: number; detail?: string };
  const cfg = portalConfig();
  if (!cfg) {
    result = { status: "failed", detail: "4PP connection is not configured" };
  } else {
    // 4PP refuses dates in the future
    const paid = new Date(inv.paid_at ?? Date.now());
    const subscribedAt = Number.isNaN(paid.getTime()) || paid.getTime() > Date.now() ? new Date() : paid;
    try {
      const res = await fetch(`${cfg.base}/api/v1/referrals`, {
        method: "POST",
        headers: { "X-API-Key": cfg.key, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          referral_code: ref.code,
          external_ref: inv.id,
          subscription_amount: gross,
          currency: "PHP",
          plan: `4MED ${inv.plan_id ?? "plan"} · ${inv.billing_cycle === "annual" ? "yearly" : "monthly"}`,
          referred_name: prof?.full_name ?? undefined,
          subscribed_at: subscribedAt.toISOString(),
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; reason?: string; referral?: { referral_fee?: number } } | null;
      if (res.ok) result = { status: "recorded", fee: Number(body?.referral?.referral_fee ?? 0) };
      else if (res.status === 422) result = { status: "rejected", detail: body?.error ?? body?.reason ?? "Partner code is not valid in 4PP" };
      else result = { status: "failed", detail: body?.error ?? `4PP returned HTTP ${res.status}` };
    } catch {
      result = { status: "failed", detail: "4PP could not be reached" };
    }
  }

  const now = new Date().toISOString();
  await db.from("partner_referrals").update({
    status: result.status,
    invoice_id: inv.id,
    amount: gross,
    fee: result.status === "recorded" ? result.fee : ref.fee,
    detail: result.status === "recorded" ? `Recorded in 4PP: ₱${gross.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : result.detail,
    attempted_at: now,
    recorded_at: result.status === "recorded" ? now : null,
  }).eq("doctor_id", doctorId).neq("status", "recorded");

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  try {
    if (body.action === "check") return json(await checkCode(String(body.code ?? "")));
    if (body.action === "record") {
      if (!(await adminId(req.headers.get("Authorization")))) return json({ error: "Forbidden: 4MED admins only" }, 403);
      const doctorId = String(body.doctor_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(doctorId)) return json({ error: "doctor_id is required" }, 400);
      return json(await recordReferral(doctorId));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
