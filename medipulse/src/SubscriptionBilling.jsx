import React, { useState, useEffect } from "react";
import { Lock, Receipt, LogOut, Upload, X, ExternalLink } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/AuthContext";
import { friendlyError } from "./lib/errors";
import { validateUpload, uploadPrivate, signedUrl } from "./lib/uploads";
import { panel, btnSm, btnGhostSm, inputSm, FieldLabel, Notice, StatusMark, Stamp } from "./ui";
import { reportPartnerReferral, partnerReportNote } from "./Referrals";

/* ------------------------------------------------------------------ */
/*  4MED subscription billing, paid manually for now.                  */
/*                                                                     */
/*  The database issues an invoice 3 days before a trial or paid       */
/*  period ends and emails the doctor. The doctor pays and sends proof */
/*  (reference + screenshot); an admin confirms it, which records the  */
/*  payment (medipulse-subscription-payments.sql).                     */
/*  An invoice left unpaid past its due date makes the subscription    */
/*  past_due, which locks the Clinic App until it's settled.           */
/* ------------------------------------------------------------------ */

// Whole pesos stay whole (₱1,499); centavos always show two digits (₱1,349.10).
const peso = (n) => {
  const v = Number(n || 0);
  const cents = Number.isInteger(v) ? 0 : 2;
  return "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: cents, maximumFractionDigits: 2 });
};
const BUCKET_SUBSCRIPTION_PROOFS = "subscription-proofs";
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

async function paymentInstructions() {
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "billing_payment_instructions").maybeSingle();
  return data?.value || "";
}

// Billing state for the practice(s) the signed-in staff member works in.
export function useBillingStatus() {
  const { profile } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!profile || !["doctor", "secretary"].includes(profile.role)) { setRows([]); return; }
    supabase.rpc("my_billing_status").then(({ data, error }) => setRows(error ? [] : data || []));
  }, [profile?.id, profile?.role]);
  const pastDue = (rows || []).find((r) => r.status === "past_due");
  const open = (rows || []).find((r) => r.open_invoice_no);
  return { loaded: rows !== null, pastDue, open };
}

// Shown above every Clinic App screen while an invoice is open.
export function BillingBanner({ open }) {
  if (!open) return null;
  return (
    <div className="border-b border-amber-500/40 bg-butter/70 px-4 sm:px-6 py-2.5 text-sm font-body text-ink flex flex-wrap items-center gap-x-3 gap-y-1">
      <Receipt size={15} className="shrink-0" />
      <span>4MED invoice <b className="tnum">{open.open_invoice_no}</b> for <b className="tnum">{peso(open.open_amount)}</b> is due {fmtDate(open.due_at)}.</span>
      <span className="text-slate-200">Pay it, then send your proof of payment in Practice → Subscription.</span>
    </div>
  );
}

// Replaces the Clinic App while the subscription is past due.
export function BillingLock({ pastDue }) {
  const { profile, signOut } = useAuth();
  const [howToPay, setHowToPay] = useState("");
  useEffect(() => { paymentInstructions().then(setHowToPay); }, []);
  const isDoctor = profile?.role === "doctor";
  return (
    <div className="max-w-xl mx-auto px-5 py-14">
      <div className="rounded-xl border border-rose-500/40 bg-white overflow-hidden">
        <div className="bg-blush px-6 py-5 border-b border-rose-500/30 flex items-start justify-between gap-4">
          <div>
            <FieldLabel>Subscription</FieldLabel>
            <h1 className="font-display text-3xl font-bold text-ink mt-1">The Clinic App is paused</h1>
          </div>
          <Stamp tone="void" size="lg">Past due</Stamp>
        </div>
        <div className="px-6 py-6 font-body space-y-4">
          <p className="text-slate-200">
            {isDoctor
              ? <>Invoice <b className="tnum">{pastDue.open_invoice_no}</b> for <b className="tnum">{peso(pastDue.open_amount)}</b> was due {fmtDate(pastDue.due_at)}. Patients can still find and book you, but the Clinic App (records, queue and billing) is paused until it's paid.</>
              : <>This practice's 4MED subscription is past due. Please ask the doctor to settle invoice <b className="tnum">{pastDue.open_invoice_no}</b>.</>}
          </p>
          {isDoctor && howToPay && (
            <div className="rounded-lg border border-slate-700 bg-ground px-4 py-3">
              <div className="field-label mb-1">How to pay</div>
              <p className="whitespace-pre-wrap text-ink">{howToPay}</p>
            </div>
          )}
          {isDoctor && <OpenInvoicePayments doctorId={profile.id} />}
          <p className="text-sm text-slate-400">Once 4MED confirms your payment, the app opens again automatically.</p>
        </div>
        <div className="px-6 py-3 border-t border-slate-800">
          <button onClick={signOut} className={btnGhostSm}><LogOut size={14} /> Log out</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------ paying an invoice ------------------------ */

const PAY_METHODS = [["gcash", "GCash"], ["maya", "Maya"], ["bank", "Bank transfer"], ["card", "Card"], ["cash", "Cash"], ["other", "Other"]];
const methodLabel = (m) => (PAY_METHODS.find(([v]) => v === m) || [m, m])[1];

// Dev-only: the ?demo= preview has no database, so show sample rows.
const isDemo = () => import.meta.env.DEV && !!new URLSearchParams(window.location.search).get("demo");
const DEMO_INVOICES = [
  { id: "demo-1", invoice_no: "4MED-202610-0031", status: "open", gross: 1499, discount: 149.9, credit_used: 0, amount: 1349.1,
    period_start: "2026-11-08T00:00:00Z", period_end: "2026-12-08T00:00:00Z", due_at: "2026-11-15T00:00:00Z",
    proof: { status: "rejected", review_note: "The reference number doesn't match our GCash records." } },
  { id: "demo-2", invoice_no: "4MED-202609-0007", status: "paid", gross: 1499, discount: 0, credit_used: 0, amount: 1499,
    period_start: "2026-10-08T00:00:00Z", period_end: "2026-11-08T00:00:00Z", due_at: "2026-10-15T00:00:00Z", proof: null },
];
const DEMO_PROOFS = [
  { id: "demo-p1", invoice_id: "demo-1", doctor_id: "demo", amount: 1349.1, method: "gcash", reference_no: "1009 234 5567", note: "Paid from the clinic GCash",
    created_at: "2026-10-25T03:00:00Z", invoice: { invoice_no: "4MED-202610-0031", amount: 1349.1 }, doctor: { profiles: { full_name: "Dr. Maria Santos" } } },
];

// A doctor's invoices and the proofs they've sent, newest proof first.
function useInvoicesWithProofs(doctorId, openOnly = false) {
  const [rows, setRows] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!doctorId) return;
    (async () => {
      let q = supabase.from("subscription_invoices").select("*").eq("doctor_id", doctorId).order("period_start", { ascending: false }).limit(12);
      if (openOnly) q = q.eq("status", "open");
      const [inv, pr] = await Promise.all([
        q,
        supabase.from("subscription_payment_proofs").select("*").eq("doctor_id", doctorId).order("created_at", { ascending: false }),
      ]);
      if (inv.error && isDemo()) { setRows(DEMO_INVOICES.filter((r) => !openOnly || r.status === "open")); return; }
      const proofs = pr.data || [];
      setRows((inv.data || []).map((r) => ({ ...r, proof: proofs.find((p) => p.invoice_id === r.id) || null })));
    })();
  }, [doctorId, openOnly, tick]);
  return [rows, () => setTick((n) => n + 1)];
}

// Pay, then send the reference number and a screenshot or PDF (as in 4POS).
function SendProofModal({ invoice, onClose, onDone }) {
  const { session } = useAuth();
  const [f, setF] = useState({ amount: String(invoice.amount ?? ""), method: "gcash", reference: "", note: "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e) => {
    const picked = e.target.files?.[0] || null;
    const err = validateUpload(picked);
    setError(err);
    setFile(err ? null : picked);
  };
  const submit = async () => {
    const err = validateUpload(file);
    if (err) { setError(err); return; }
    if (!(Number(f.amount) > 0)) { setError("Enter the amount you paid."); return; }
    if (f.method !== "cash" && !f.reference.trim()) { setError("Enter the reference number from your receipt."); return; }
    setBusy(true); setError(null);
    // <doctor id>/<invoice id>/<file>: the folder the storage rules expect.
    const { path, error: upErr } = await uploadPrivate(BUCKET_SUBSCRIPTION_PROOFS, session.user.id, invoice.id, file);
    if (upErr) { setBusy(false); setError("Upload failed: " + upErr); return; }
    const { error: rpcErr } = await supabase.rpc("submit_subscription_payment", {
      p_invoice_id: invoice.id, p_amount: Number(f.amount), p_method: f.method,
      p_reference_no: f.reference.trim() || null, p_storage_path: path, p_note: f.note.trim() || null,
    });
    setBusy(false);
    if (rpcErr) { setError(friendlyError(rpcErr)); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Send proof of payment">
      <div className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <FieldLabel>Invoice {invoice.invoice_no}</FieldLabel>
            <h3 className="font-display text-xl font-bold text-ink mt-0.5">Send proof of payment</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-300 hover:text-ink" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto font-body">
          <p className="text-sm text-slate-200">Amount due: <b className="tnum text-ink">{peso(invoice.amount)}</b>. Pay it first, then send your receipt here. 4MED checks it before the invoice is marked paid.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><FieldLabel>Amount paid</FieldLabel><input type="number" min="0" step="0.01" className={inputSm + " mt-1.5 tnum"} value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} /></label>
            <label className="block"><FieldLabel>Paid with</FieldLabel>
              <select className={inputSm + " mt-1.5"} value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value }))}>
                {PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <label className="block"><FieldLabel>Reference number{f.method === "cash" ? " (optional)" : ""}</FieldLabel>
            <input className={inputSm + " mt-1.5 tnum"} value={f.reference} onChange={(e) => setF((x) => ({ ...x, reference: e.target.value }))} placeholder="From your GCash or bank receipt" />
          </label>
          <div>
            <FieldLabel>Screenshot or PDF of your receipt</FieldLabel>
            <label className="mt-1.5 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 bg-ground px-4 py-5 text-sm text-slate-200 cursor-pointer hover:border-ink">
              <Upload size={16} /> {file ? file.name : "Choose a file"}
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={pick} />
            </label>
            {preview && <img src={preview} alt="Your receipt" className="mt-2 max-h-48 rounded-md border border-slate-700 mx-auto" />}
            <p className="text-xs text-slate-400 mt-1">JPG, PNG or PDF · up to 5 MB</p>
          </div>
          <label className="block"><FieldLabel>Note for 4MED (optional)</FieldLabel>
            <input className={inputSm + " mt-1.5"} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <div className="px-5 py-3 border-t border-slate-800 flex gap-2 justify-end">
          <button onClick={onClose} className={btnGhostSm}>Cancel</button>
          <button onClick={submit} disabled={busy} className={btnSm}>{busy ? "Sending…" : "Send proof"}</button>
        </div>
      </div>
    </div>
  );
}

// What's left to do on one open invoice: send proof, wait, or send again.
function InvoicePayStatus({ invoice, onSend }) {
  const p = invoice.proof;
  if (p?.status === "submitted") {
    return <p className="text-sm text-ink"><span className="pending-mark">Checking your payment</span> <span className="text-slate-400">· {peso(p.amount)} by {methodLabel(p.method)} sent {fmtDate(p.created_at)}</span></p>;
  }
  return (
    <div className="space-y-2">
      {p?.status === "rejected" && <Notice tone="error">4MED couldn't confirm your last payment: {p.review_note}</Notice>}
      <button onClick={() => onSend(invoice)} className={btnSm}><Upload size={14} /> {p?.status === "rejected" ? "Send proof again" : "Send proof of payment"}</button>
    </div>
  );
}

// The lock screen's version: each open invoice with what to do next.
function OpenInvoicePayments({ doctorId }) {
  const [rows, reload] = useInvoicesWithProofs(doctorId, true);
  const [sending, setSending] = useState(null);
  if (!rows?.length) return null;
  return (
    <div className="space-y-3">
      {sending && <SendProofModal invoice={sending} onClose={() => setSending(null)} onDone={() => { setSending(null); reload(); }} />}
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg border border-slate-700 px-4 py-3 space-y-2">
          <div className="flex justify-between gap-3 text-sm"><b className="tnum text-ink">{r.invoice_no}</b><span className="tnum text-ink">{peso(r.amount)}</span></div>
          <InvoicePayStatus invoice={r} onSend={setSending} />
        </div>
      ))}
    </div>
  );
}

// Practice → Subscription: open and past invoices with how to pay.
export function DoctorInvoices({ doctorId }) {
  const [rows, reload] = useInvoicesWithProofs(doctorId);
  const [sending, setSending] = useState(null);
  const [howToPay, setHowToPay] = useState("");
  useEffect(() => { paymentInstructions().then(setHowToPay); }, []);
  if (!rows?.length) return null;
  const open = rows.filter((r) => r.status === "open");
  return (
    <div className="mt-5 pt-4 border-t border-slate-800">
      {sending && <SendProofModal invoice={sending} onClose={() => setSending(null)} onDone={() => { setSending(null); reload(); }} />}
      <div className="field-label mb-2">Invoices</div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="py-2 border-b border-slate-800 last:border-0 text-sm font-body">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink">
              <b className="tnum">{r.invoice_no}</b> · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
              {(Number(r.discount) > 0 || Number(r.credit_used) > 0) && (
                <span className="block text-xs text-slate-400 tnum">
                  {peso(r.gross)}{Number(r.discount) > 0 ? ` − ${peso(r.discount)} welcome discount` : ""}{Number(r.credit_used) > 0 ? ` − ${peso(r.credit_used)} referral credit` : ""}
                </span>
              )}
            </span>
            <span className="flex items-center gap-3"><span className="tnum">{peso(r.amount)}</span>
              {r.status === "paid" ? <Stamp>Paid</Stamp> : r.status === "void" ? <Stamp tone="void">Void</Stamp> : <span className="pending-mark">Due {fmtDate(r.due_at)}</span>}
            </span>
          </div>
          {r.status === "open" && <div className="mt-2"><InvoicePayStatus invoice={r} onSend={setSending} /></div>}
          </li>
        ))}
      </ul>
      {open.length > 0 && howToPay && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-butter/50 px-4 py-3 text-sm font-body text-ink">
          <div className="field-label mb-1">How to pay</div>
          <p className="whitespace-pre-wrap">{howToPay}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ admin ------------------------------ */

export function SubscriptionBillingTab() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("open");
  const [howToPay, setHowToPay] = useState("");
  const [grace, setGrace] = useState("7");
  const [refs, setRefs] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [savedSettings, setSavedSettings] = useState(false);
  const [note, setNote] = useState(null);
  const [proofs, setProofs] = useState([]); // proofs waiting to be checked
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    let q = supabase.from("subscription_invoices")
      .select("*, doctor:doctor_id(profiles(full_name))")
      .order("due_at", { ascending: true });
    if (filter !== "all") q = q.eq("status", filter);
    const [{ data, error }, pr] = await Promise.all([
      q,
      supabase.from("subscription_payment_proofs")
        .select("*, invoice:invoice_id(invoice_no, amount, due_at, plan_id, billing_cycle), doctor:doctor_id(profiles(full_name))")
        .eq("status", "submitted").order("created_at", { ascending: true }),
    ]);
    if (error && isDemo()) { setProofs(DEMO_PROOFS); return; }
    if (error) { setError(friendlyError(error)); return; }
    setRows(data || []);
    setProofs(pr.data || []);
  };

  // After a payment is recorded: a practice that came through a 4PP partner
  // has its first paid invoice reported to 4PP.
  const afterPaid = async (doctorId) => {
    const { data: partner } = await supabase.from("partner_referrals").select("code, status").eq("doctor_id", doctorId).maybeSingle();
    if (partner && partner.status !== "recorded") setNote(partnerReportNote(partner.code, await reportPartnerReferral(doctorId)) || null);
  };

  const openProof = async (p) => {
    const url = await signedUrl(BUCKET_SUBSCRIPTION_PROOFS, p.storage_path, 300);
    if (url) window.open(url, "_blank", "noopener");
    else setError("Couldn't open the proof file.");
  };
  const approve = async (p) => {
    setBusy(p.id); setError(null); setNote(null);
    const { error } = await supabase.rpc("approve_subscription_payment", { p_proof_id: p.id });
    if (error) { setBusy(null); setError(friendlyError(error)); return; }
    setNote(`Payment confirmed: invoice ${p.invoice?.invoice_no || ""} is paid.`);
    await afterPaid(p.doctor_id);
    setBusy(null);
    load();
  };
  const reject = async (p) => {
    setBusy(p.id); setError(null); setNote(null);
    const { error } = await supabase.rpc("reject_subscription_payment", { p_proof_id: p.id, p_reason: reason });
    setBusy(null);
    if (error) { setError(friendlyError(error)); return; }
    setRejecting(null); setReason("");
    load();
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => {
    supabase.from("platform_settings").select("key, value").in("key", ["billing_payment_instructions", "billing_grace_days"])
      .then(({ data }) => {
        (data || []).forEach((r) => (r.key === "billing_grace_days" ? setGrace(r.value || "7") : setHowToPay(r.value || "")));
      });
  }, []);

  const markPaid = async (inv) => {
    setBusy(inv.id); setError(null); setNote(null);
    const { error } = await supabase.rpc("mark_subscription_invoice_paid", { p_id: inv.id, p_reference: refs[inv.id] || null });
    if (error) { setBusy(null); setError(friendlyError(error)); return; }
    await afterPaid(inv.doctor_id);
    setBusy(null);
    load();
  };

  const saveSettings = async () => {
    setError(null);
    const { error } = await supabase.from("platform_settings").upsert([
      { key: "billing_payment_instructions", value: howToPay, updated_at: new Date().toISOString() },
      { key: "billing_grace_days", value: String(Number(grace) || 7), updated_at: new Date().toISOString() },
    ]);
    if (error) { setError(friendlyError(error)); return; }
    setSavedSettings(true);
    setTimeout(() => setSavedSettings(false), 1500);
  };

  const now = new Date();
  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="info">{note}</Notice>}

      <div className={panel}>
        <div className="font-display text-lg font-bold text-ink mb-1">Payments to check{proofs.length ? <span className="tnum text-slate-400 font-body font-normal text-base"> · {proofs.length}</span> : null}</div>
        <p className="text-sm text-slate-300 font-body mb-4">Proof of payment sent by doctors. Open the receipt, check it against your GCash or bank records, then confirm it (the invoice is marked paid) or turn it down with a reason the doctor will see.</p>
        {proofs.length === 0 ? <p className="text-sm text-slate-400 font-body">Nothing to check right now.</p> : (
          <ul className="font-body">
            {proofs.map((p) => {
              const short = Number(p.amount) < Number(p.invoice?.amount || 0);
              return (
                <li key={p.id} className="py-3 border-b border-slate-800 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-ink font-semibold">{p.doctor?.profiles?.full_name || "—"} <span className="tnum text-slate-300 font-normal">· {p.invoice?.invoice_no}</span></div>
                      <div className="text-sm text-slate-200 tnum">
                        Sent <b className={short ? "text-rose-300" : "text-ink"}>{peso(p.amount)}</b> of {peso(p.invoice?.amount)} by {methodLabel(p.method)}{p.reference_no ? ` · ref ${p.reference_no}` : ""} · {fmtDate(p.created_at)}
                      </div>
                      {short && <div className="text-xs text-rose-300">Less than the amount due.</div>}
                      {p.note && <div className="text-sm text-slate-300 mt-0.5">“{p.note}”</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => openProof(p)} className={btnGhostSm}><ExternalLink size={14} /> View proof</button>
                      <button onClick={() => approve(p)} disabled={busy === p.id} className={btnSm}>{busy === p.id ? "Saving…" : "Confirm payment"}</button>
                      <button onClick={() => { setRejecting(p.id); setReason(""); }} className={btnGhostSm}>Not confirmed…</button>
                    </div>
                  </div>
                  {rejecting === p.id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="block flex-1 min-w-[240px]">
                        <FieldLabel>What's wrong? The doctor sees this.</FieldLabel>
                        <input autoFocus className={inputSm + " mt-1.5"} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The reference number doesn't match our GCash records." />
                      </label>
                      <button onClick={() => reject(p)} disabled={busy === p.id || !reason.trim()} className={btnSm}>Send</button>
                      <button onClick={() => setRejecting(null)} className={btnGhostSm}>Cancel</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={panel}>
        <div className="font-display text-lg font-bold text-ink mb-1">Subscription invoices</div>
        <p className="text-sm text-slate-300 font-body mb-4">4MED issues an invoice 3 days before each trial or paid period ends and emails the doctor, who pays and sends proof (above). You can also record a payment by hand here; an unpaid invoice past its due date pauses that practice's Clinic App.</p>
        <div className="inline-flex gap-1 rounded-lg border border-slate-700 bg-white p-1 text-sm mb-4">
          {[["open", "Open"], ["paid", "Paid"], ["all", "All"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v} className={"px-3 py-1.5 rounded-md font-body " + (filter === v ? "bg-ink text-white font-semibold" : "text-slate-300 hover:text-ink")}>{l}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm font-body">
            <thead>
              <tr className="border-b border-slate-800">{["Invoice", "Doctor", "Amount", "Due", "Status", ""].map((h) => <th key={h} className="field-label font-semibold px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-300">No {filter === "all" ? "" : filter} invoices.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800 last:border-0">
                  <td className="px-3 py-3"><div className="text-ink font-semibold tnum">{r.invoice_no}</div><div className="text-xs text-slate-400">{r.plan_id} · {r.billing_cycle === "annual" ? "yearly" : "monthly"}</div></td>
                  <td className="px-3 py-3 text-slate-200">{r.doctor?.profiles?.full_name || "—"}</td>
                  <td className="px-3 py-3 tnum text-ink">{peso(r.amount)}</td>
                  <td className={"px-3 py-3 tnum " + (r.status === "open" && new Date(r.due_at) < now ? "text-rose-300 font-semibold" : "text-slate-200")}>{fmtDate(r.due_at)}</td>
                  <td className="px-3 py-3">{r.status === "paid" ? <Stamp>Paid</Stamp> : r.status === "void" ? <Stamp tone="void">Void</Stamp> : proofs.some((p) => p.invoice_id === r.id) ? <span className="pending-mark">Proof sent</span> : new Date(r.due_at) < now ? <Stamp tone="void">Overdue</Stamp> : <span className="pending-mark">Open</span>}</td>
                  <td className="px-3 py-3">
                    {r.status === "open" && (
                      <div className="flex items-center gap-2 justify-end">
                        <input className={inputSm + " w-36"} placeholder="Reference no." value={refs[r.id] || ""} onChange={(e) => setRefs((x) => ({ ...x, [r.id]: e.target.value }))} />
                        <button onClick={() => markPaid(r)} disabled={busy === r.id} className={btnSm}>{busy === r.id ? "Saving…" : "Mark paid"}</button>
                      </div>
                    )}
                    {r.status === "paid" && <span className="text-xs text-slate-400">{r.payment_reference || ""} · {fmtDate(r.paid_at)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={panel}>
        <div className="font-display text-lg font-bold text-ink mb-3">Billing settings</div>
        <label className="block mb-3">
          <FieldLabel>How doctors pay 4MED (shown on invoices and in the app)</FieldLabel>
          <textarea className={inputSm + " mt-1.5 min-h-24 resize-y"} value={howToPay} onChange={(e) => setHowToPay(e.target.value)} placeholder={"GCash: 4MED — 0917 000 0000\nBPI: 0000-0000-00 (4-Keys)\nReply to the invoice email with your reference number."} />
        </label>
        <label className="block w-48 mb-4">
          <FieldLabel>Days to pay before pausing</FieldLabel>
          <input type="number" min="1" className={inputSm + " mt-1.5 tnum"} value={grace} onChange={(e) => setGrace(e.target.value)} />
        </label>
        <div className="flex items-center gap-3">
          <button onClick={saveSettings} className={btnSm}>Save settings</button>
          {savedSettings && <span className="text-sm text-ink font-body">Saved</span>}
        </div>
      </div>
    </div>
  );
}
