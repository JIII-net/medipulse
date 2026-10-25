import React, { useState, useEffect } from "react";
import { Lock, Receipt, LogOut } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/AuthContext";
import { friendlyError } from "./lib/errors";
import { panel, btnSm, btnGhostSm, inputSm, FieldLabel, Notice, StatusMark, Stamp } from "./ui";

/* ------------------------------------------------------------------ */
/*  4MED subscription billing, paid manually for now.                  */
/*                                                                     */
/*  The database issues an invoice 3 days before a trial or paid       */
/*  period ends and emails the doctor; an admin records the payment.   */
/*  An invoice left unpaid past its due date makes the subscription    */
/*  past_due, which locks the Clinic App until it's settled.           */
/* ------------------------------------------------------------------ */

const peso = (n) => "₱" + Number(n || 0).toLocaleString();
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
      <span className="text-slate-200">Payment details are in Practice → Subscription.</span>
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
          <p className="text-sm text-slate-400">Once 4MED records your payment the app opens again automatically.</p>
        </div>
        <div className="px-6 py-3 border-t border-slate-800">
          <button onClick={signOut} className={btnGhostSm}><LogOut size={14} /> Log out</button>
        </div>
      </div>
    </div>
  );
}

// Practice → Subscription: open and past invoices with how to pay.
export function DoctorInvoices({ doctorId }) {
  const [rows, setRows] = useState([]);
  const [howToPay, setHowToPay] = useState("");
  useEffect(() => {
    if (!doctorId) return;
    supabase.from("subscription_invoices").select("*").eq("doctor_id", doctorId).order("period_start", { ascending: false }).limit(12)
      .then(({ data }) => setRows(data || []));
    paymentInstructions().then(setHowToPay);
  }, [doctorId]);
  if (rows.length === 0) return null;
  const open = rows.filter((r) => r.status === "open");
  return (
    <div className="mt-5 pt-4 border-t border-slate-800">
      <div className="field-label mb-2">Invoices</div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-800 last:border-0 text-sm font-body">
            <span className="text-ink"><b className="tnum">{r.invoice_no}</b> · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}</span>
            <span className="flex items-center gap-3"><span className="tnum">{peso(r.amount)}</span>
              {r.status === "paid" ? <Stamp>Paid</Stamp> : r.status === "void" ? <Stamp tone="void">Void</Stamp> : <span className="pending-mark">Due {fmtDate(r.due_at)}</span>}
            </span>
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

  const load = async () => {
    let q = supabase.from("subscription_invoices")
      .select("*, doctor:doctor_id(profiles(full_name))")
      .order("due_at", { ascending: true });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) { setError(friendlyError(error)); return; }
    setRows(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => {
    supabase.from("platform_settings").select("key, value").in("key", ["billing_payment_instructions", "billing_grace_days"])
      .then(({ data }) => {
        (data || []).forEach((r) => (r.key === "billing_grace_days" ? setGrace(r.value || "7") : setHowToPay(r.value || "")));
      });
  }, []);

  const markPaid = async (inv) => {
    setBusy(inv.id); setError(null);
    const { error } = await supabase.rpc("mark_subscription_invoice_paid", { p_id: inv.id, p_reference: refs[inv.id] || null });
    setBusy(null);
    if (error) { setError(friendlyError(error)); return; }
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
      <div className={panel}>
        <div className="font-display text-lg font-bold text-ink mb-1">Subscription invoices</div>
        <p className="text-sm text-slate-300 font-body mb-4">4MED issues an invoice 3 days before each trial or paid period ends and emails the doctor. Record the payment here once it arrives; an unpaid invoice past its due date pauses that practice's Clinic App.</p>
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
                  <td className="px-3 py-3">{r.status === "paid" ? <Stamp>Paid</Stamp> : r.status === "void" ? <Stamp tone="void">Void</Stamp> : new Date(r.due_at) < now ? <Stamp tone="void">Overdue</Stamp> : <span className="pending-mark">Open</span>}</td>
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
