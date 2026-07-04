// MediPulse — send-notifications Edge Function
// Delivers any due, pending rows from the `notifications` table via
// Semaphore (Philippine SMS) and Resend (email). Called on a schedule
// by pg_cron (see medipulse-notifications-worker.sql), or manually for
// testing via `supabase functions invoke send-notifications`.
//
// Required secrets (set via `supabase secrets set`):
//   SEMAPHORE_API_KEY   — from semaphore.co dashboard
//   SEMAPHORE_SENDER_NAME — your approved sender name, e.g. "MediPulse"
//   RESEND_API_KEY       — from resend.com dashboard
//   RESEND_FROM          — a verified sender, e.g. "MediPulse <noreply@yourclinic.com>"
//
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// automatically inside Edge Functions — no need to set those.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), // service role: bypasses RLS, needed to read/update all pending rows
);

async function sendSms(recipient, body) {
  const apiKey = Deno.env.get("SEMAPHORE_API_KEY");
  const senderName = Deno.env.get("SEMAPHORE_SENDER_NAME") || "MediPulse";
  if (!apiKey) throw new Error("SEMAPHORE_API_KEY not configured");
  const res = await fetch("https://api.semaphore.co/api/v4/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, number: recipient, message: body, sendername: senderName }),
  });
  if (!res.ok) throw new Error(`Semaphore error ${res.status}: ${await res.text()}`);
}

async function sendEmail(recipient, body) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") || "MediPulse <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: recipient, subject: "MediPulse notification", text: body }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

Deno.serve(async () => {
  const { data: due, error: fetchErr } = await supabase
    .from("notifications")
    .select("id, channel, recipient, body")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .limit(100); // safety cap per run; cron runs every 2 min so backlog clears quickly

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  let sent = 0, failed = 0;
  for (const n of due || []) {
    try {
      if (n.channel === "sms") await sendSms(n.recipient, n.body);
      else await sendEmail(n.recipient, n.body);
      await supabase.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", n.id);
      sent++;
    } catch (e) {
      await supabase.from("notifications").update({ status: "failed", error: String(e?.message || e) }).eq("id", n.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed: (due || []).length, sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
