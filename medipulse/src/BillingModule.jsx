import React, { useState, useEffect } from "react";
import {
  Receipt, Plus, X, Check, ArrowLeft, Printer, Search, AlertCircle, Wallet, Trash2,
} from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/*  Billing & Cashier — invoices, PH discounts, payments, ORs          */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";
const card = "rounded-3xl border border-slate-800 bg-slate-900 p-5";
const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const fmtDT = (iso) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const calcAge = (b) => {
  const d = new Date(b), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
};

// PH senior/PWD computation (RA 9994 / RA 10754):
// VAT-registered: remove 12% VAT (subtotal × 12/112), then 20% discount on the VAT-exempt base.
// Non-VAT clinic: 20% discount on subtotal only.
function computeTotals(subtotal, isSeniorPwd, vatRegistered) {
  if (!isSeniorPwd) return { vatExempt: 0, discount: 0, total: r2(subtotal) };
  const vatExempt = vatRegistered ? r2((subtotal * 12) / 112) : 0;
  const base = subtotal - vatExempt;
  const discount = r2(base * 0.2);
  return { vatExempt, discount, total: r2(subtotal - vatExempt - discount) };
}

function printDoc(title, bodyHtml) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  w.document.write(
    `<html><head><title>${title}</title><style>
      body { font-family: Georgia, serif; color: #111; max-width: 640px; margin: 40px auto; line-height: 1.5; font-size: 14px; }
      h1 { font-size: 18px; letter-spacing: 1px; margin-bottom: 2px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 20px; }
      .rule { border-top: 2px solid #111; margin: 12px 0 18px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 11px; color: #555; border-bottom: 1px solid #999; padding: 4px; }
      td { padding: 6px 4px; vertical-align: top; }
      .r { text-align: right; }
      .totals td { padding: 3px 4px; }
      .grand { font-weight: bold; border-top: 1px solid #111; }
      .muted { color: #777; font-size: 11px; margin-top: 26px; }
    </style></head><body>${bodyHtml}<scr` + `ipt>window.onload = () => window.print();</scr` + `ipt></body></html>`
  );
  w.document.close();
}

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-4">
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> {msg}
    </div>
  );
}

const STATUS_STYLE = {
  draft: "text-slate-400 border-slate-600 bg-slate-800/40",
  final: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  partially_paid: "text-violet-300 border-violet-500/40 bg-violet-500/10",
  paid: "text-teal-300 border-teal-400/40 bg-teal-400/10",
  void: "text-rose-300 border-rose-500/30 bg-rose-500/10",
};

/* ------------------------- patient picker ------------------------- */

function PatientPicker({ onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const search = async () => {
    const t = q.trim().replace(/[%,()]/g, "");
    if (!t) return;
    const { data } = await supabase
      .from("patients")
      .select("id, mrn, first_name, last_name, birthdate, senior_citizen_id, pwd_id")
      .is("deleted_at", null)
      .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,mrn.ilike.%${t}%`)
      .limit(6);
    setResults(data || []);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Search patient (name / MRN)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} />
        <button type="button" onClick={search} className={btnGhost}><Search size={15} /></button>
      </div>
      {results.map((r) => (
        <button key={r.id} type="button" onClick={() => onPick(r)} className="w-full text-left text-sm font-body text-slate-200 rounded-xl border border-slate-700 px-3 py-2 hover:border-teal-400 transition-colors">
          {r.first_name} {r.last_name} · <span className="font-mono2 text-xs text-teal-300">{r.mrn}</span>
          {(r.senior_citizen_id || r.pwd_id || calcAge(r.birthdate) >= 60) && <span className="ml-2 text-xs text-amber-300">senior/PWD</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------- invoice editor ------------------------- */

function InvoiceEditor({ myDoctors, onDone, onBack }) {
  const { session } = useAuth();
  const [doctorId, setDoctorId] = useState(myDoctors[0]?.id || "");
  const [patient, setPatient] = useState(null);
  const [items, setItems] = useState([]);
  const [row, setRow] = useState({ description: "", quantity: "1", unit_price: "", source: "other" });
  const [vatRegistered, setVatRegistered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const doctor = myDoctors.find((d) => d.id === doctorId);
  const isSeniorPwd = patient ? !!(patient.senior_citizen_id || patient.pwd_id || calcAge(patient.birthdate) >= 60) : false;
  const subtotal = r2(items.reduce((s, i) => s + i.amount, 0));
  const { vatExempt, discount, total } = computeTotals(subtotal, isSeniorPwd, vatRegistered);

  const addRow = () => {
    if (!row.description.trim() || !row.unit_price) return;
    const q = Math.max(1, Number(row.quantity) || 1);
    const p = Number(row.unit_price) || 0;
    setItems((prev) => [...prev, { description: row.description.trim(), source: row.source, quantity: q, unit_price: p, amount: r2(q * p) }]);
    setRow({ description: "", quantity: "1", unit_price: "", source: "other" });
  };

  const quickConsult = () => {
    if (!doctor?.consult_fee) return;
    setItems((prev) => [...prev, { description: `Consultation — ${doctor.name}`, source: "consultation", quantity: 1, unit_price: Number(doctor.consult_fee), amount: Number(doctor.consult_fee) }]);
  };

  const save = async (finalize) => {
    if (!patient) { setError("Pick a patient first."); return; }
    if (items.length === 0) { setError("Add at least one charge."); return; }
    setBusy(true); setError(null);
    const { data: inv, error: e1 } = await supabase.from("invoices").insert({
      doctor_id: doctorId, patient_record_id: patient.id,
      status: finalize ? "final" : "draft",
      is_senior_pwd: isSeniorPwd, vat_registered: vatRegistered,
      subtotal, vat_exempt: vatExempt, senior_pwd_discount: discount, total_due: total,
      created_by: session?.user?.id || null,
      finalized_at: finalize ? new Date().toISOString() : null,
    }).select("id").single();
    if (e1) { setError(e1.message); setBusy(false); return; }
    const { error: e2 } = await supabase.from("invoice_items").insert(items.map((i) => ({ ...i, invoice_id: inv.id })));
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    onDone(inv.id);
  };

  return (
    <div className="fade-up max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 font-body mb-5">
        <ArrowLeft size={15} /> Back to invoices
      </button>
      <h2 className="font-display text-2xl font-bold text-slate-50 mb-5">New invoice</h2>

      <div className="space-y-5">
        {myDoctors.length > 1 && (
          <select className={inputCls} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {myDoctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}

        <div className={card}>
          <div className="font-display font-semibold text-slate-100 mb-3">Patient</div>
          {!patient ? (
            <PatientPicker onPick={setPatient} />
          ) : (
            <div className="rounded-2xl border border-teal-400/40 bg-teal-400/10 px-4 py-2.5 text-sm font-body text-slate-100 flex justify-between items-center">
              <span>
                {patient.first_name} {patient.last_name} <span className="font-mono2 text-xs text-teal-300">{patient.mrn}</span>
                {isSeniorPwd && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs">Senior/PWD — 20% + VAT exempt</span>}
              </span>
              <button onClick={() => setPatient(null)} className="text-xs text-slate-400 hover:text-slate-200">change</button>
            </div>
          )}
        </div>

        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-semibold text-slate-100">Charges</div>
            {doctor?.consult_fee > 0 && (
              <button onClick={quickConsult} className={btnGhost + " py-1.5 text-xs"}>+ Consultation fee ({peso(doctor.consult_fee)})</button>
            )}
          </div>
          {items.map((i, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-800/60 text-sm font-body">
              <span className="text-slate-200">{i.description} <span className="text-slate-500 text-xs">× {i.quantity}</span></span>
              <span className="flex items-center gap-3">
                <span className="font-mono2 text-slate-300">{peso(i.amount)}</span>
                <button onClick={() => setItems((prev) => prev.filter((_, j) => j !== idx))} className="text-slate-500 hover:text-rose-300"><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
          <div className="grid grid-cols-12 gap-2 mt-3">
            <input className={inputCls + " col-span-5"} placeholder="Description (e.g. Wound dressing)" value={row.description} onChange={(e) => setRow((p) => ({ ...p, description: e.target.value }))} />
            <select className={inputCls + " col-span-3"} value={row.source} onChange={(e) => setRow((p) => ({ ...p, source: e.target.value }))}>
              <option value="consultation">consultation</option><option value="procedure">procedure</option><option value="other">other</option>
            </select>
            <input className={inputCls + " col-span-1"} type="number" min="1" value={row.quantity} onChange={(e) => setRow((p) => ({ ...p, quantity: e.target.value }))} />
            <input className={inputCls + " col-span-2"} type="number" placeholder="Price" value={row.unit_price} onChange={(e) => setRow((p) => ({ ...p, unit_price: e.target.value }))} />
            <button onClick={addRow} className={btnPrimary + " col-span-1 flex items-center justify-center"}><Plus size={15} /></button>
          </div>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-semibold text-slate-100">Totals</div>
            <label className="flex items-center gap-2 text-xs font-body text-slate-400 cursor-pointer">
              <input type="checkbox" checked={vatRegistered} onChange={(e) => setVatRegistered(e.target.checked)} className="accent-teal-400" />
              Clinic is VAT-registered
            </label>
          </div>
          <div className="space-y-1.5 text-sm font-body">
            <div className="flex justify-between text-slate-300"><span>Subtotal</span><span className="font-mono2">{peso(subtotal)}</span></div>
            {isSeniorPwd && vatRegistered && <div className="flex justify-between text-slate-400"><span>Less: VAT exemption (12/112)</span><span className="font-mono2">−{peso(vatExempt)}</span></div>}
            {isSeniorPwd && <div className="flex justify-between text-slate-400"><span>Less: Senior/PWD discount (20%)</span><span className="font-mono2">−{peso(discount)}</span></div>}
            <div className="flex justify-between text-slate-50 font-semibold pt-2 border-t border-slate-800"><span>Total due</span><span className="font-mono2 text-teal-300">{peso(total)}</span></div>
          </div>
        </div>

        <ErrorBanner msg={error} />
        <div className="flex justify-end gap-3">
          <button onClick={() => save(false)} disabled={busy} className={btnGhost}>Save as draft</button>
          <button onClick={() => save(true)} disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Finalize invoice"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- invoice detail ------------------------- */

function InvoiceDetail({ invoiceId, onBack, reloadList }) {
  const { session, profile } = useAuth();
  const [inv, setInv] = useState(null);
  const [items, setItems] = useState([]);
  const [pays, setPays] = useState([]);
  const [pf, setPf] = useState({ method: "cash", amount: "", reference_no: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const [i, it, p] = await Promise.all([
      supabase.from("invoices").select("*, patient:patient_record_id(first_name, last_name, mrn, birthdate), doctor:doctor_id(profiles(full_name))").eq("id", invoiceId).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId),
      supabase.from("payments").select("*").eq("invoice_id", invoiceId).order("paid_at"),
    ]);
    if (i.error) { setError(i.error.message); return; }
    setInv(i.data); setItems(it.data || []); setPays(p.data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [invoiceId]);

  if (!inv) return <div className="py-16 text-center text-slate-500 font-body">{error || "Loading invoice…"}</div>;

  const paid = r2(pays.reduce((s, p) => s + Number(p.amount), 0));
  const balance = r2(Number(inv.total_due) - paid);
  const doctorName = inv.doctor?.profiles?.full_name || "";

  const finalize = async () => {
    setBusy(true);
    const { error } = await supabase.from("invoices").update({ status: "final", finalized_at: new Date().toISOString() }).eq("id", inv.id);
    setBusy(false);
    if (error) setError(error.message); else { load(); reloadList(); }
  };

  const voidInvoice = async () => {
    setBusy(true);
    const { error } = await supabase.from("invoices").update({ status: "void" }).eq("id", inv.id);
    setBusy(false);
    if (error) setError(error.message); else { load(); reloadList(); }
  };

  const addPayment = async () => {
    const amt = Number(pf.amount);
    if (!amt || amt <= 0) return;
    if (amt > balance) { setError(`Amount exceeds the remaining balance of ${peso(balance)}.`); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from("payments").insert({
      invoice_id: inv.id, method: pf.method, amount: amt,
      reference_no: pf.reference_no || null, received_by: session?.user?.id || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setPf({ method: "cash", amount: "", reference_no: "" });
    load(); reloadList();
  };

  const printSOA = () => {
    const rows = items.map((i) => `<tr><td>${i.description}</td><td class="r">${i.quantity}</td><td class="r">${peso(i.unit_price)}</td><td class="r">${peso(i.amount)}</td></tr>`).join("");
    printDoc("Statement of Account", `
      <h1>MEDIPULSE CLINIC</h1><div class="sub">Statement of Account · ${inv.invoice_no}</div><div class="rule"></div>
      <table><tr><td style="color:#555;width:120px">Patient</td><td>${inv.patient.first_name} ${inv.patient.last_name} (${inv.patient.mrn})</td></tr>
      <tr><td style="color:#555">Doctor</td><td>${doctorName}</td></tr>
      <tr><td style="color:#555">Date</td><td>${new Date(inv.created_at).toLocaleDateString("en-PH", { dateStyle: "long" })}</td></tr></table>
      <div class="rule"></div>
      <table><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>${rows}</table>
      <table class="totals" style="margin-top:14px">
        <tr><td class="r" style="color:#555">Subtotal</td><td class="r" style="width:110px">${peso(inv.subtotal)}</td></tr>
        ${Number(inv.vat_exempt) > 0 ? `<tr><td class="r" style="color:#555">Less: VAT exemption</td><td class="r">−${peso(inv.vat_exempt)}</td></tr>` : ""}
        ${Number(inv.senior_pwd_discount) > 0 ? `<tr><td class="r" style="color:#555">Less: Senior/PWD 20%</td><td class="r">−${peso(inv.senior_pwd_discount)}</td></tr>` : ""}
        <tr class="grand"><td class="r">TOTAL DUE</td><td class="r">${peso(inv.total_due)}</td></tr>
        <tr><td class="r" style="color:#555">Paid</td><td class="r">${peso(paid)}</td></tr>
        <tr><td class="r" style="color:#555">Balance</td><td class="r">${peso(balance)}</td></tr>
      </table>
      <div class="muted">Generated via MediPulse. ${inv.is_senior_pwd ? "Senior Citizen/PWD benefits applied per RA 9994 / RA 10754." : ""}</div>`);
  };

  const printOR = (p) => {
    printDoc("Official Receipt", `
      <h1>MEDIPULSE CLINIC</h1><div class="sub">OFFICIAL RECEIPT · ${p.or_number}</div><div class="rule"></div>
      <table>
        <tr><td style="color:#555;width:140px">Received from</td><td>${inv.patient.first_name} ${inv.patient.last_name}</td></tr>
        <tr><td style="color:#555">Date</td><td>${new Date(p.paid_at).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}</td></tr>
        <tr><td style="color:#555">For invoice</td><td>${inv.invoice_no}</td></tr>
        <tr><td style="color:#555">Payment method</td><td style="text-transform:uppercase">${p.method}${p.reference_no ? ` (ref: ${p.reference_no})` : ""}</td></tr>
        <tr><td style="color:#555">Amount</td><td style="font-size:20px;font-weight:bold">${peso(p.amount)}</td></tr>
      </table>
      <div class="muted">This serves as your official receipt. Generated via MediPulse.</div>`);
  };

  return (
    <div className="fade-up max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 font-body mb-5">
        <ArrowLeft size={15} /> Back to invoices
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-50">{inv.invoice_no}</h2>
          <div className="font-mono2 text-xs text-slate-500 mt-1">
            {inv.patient.first_name} {inv.patient.last_name} · {inv.patient.mrn} · {doctorName} · {fmtDT(inv.created_at)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={"px-3 py-1 rounded-full border text-sm font-body " + STATUS_STYLE[inv.status]}>{inv.status.replace("_", " ")}</span>
          <button onClick={printSOA} className={btnGhost + " flex items-center gap-1.5"}><Printer size={14} /> SOA</button>
        </div>
      </div>

      <ErrorBanner msg={error} />

      <div className={card + " mb-5"}>
        {items.map((i) => (
          <div key={i.id} className="flex justify-between py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
            <span className="text-slate-200">{i.description} <span className="text-slate-500 text-xs">× {i.quantity}</span></span>
            <span className="font-mono2 text-slate-300">{peso(i.amount)}</span>
          </div>
        ))}
        <div className="space-y-1.5 text-sm font-body mt-3 pt-3 border-t border-slate-800">
          <div className="flex justify-between text-slate-400"><span>Subtotal</span><span className="font-mono2">{peso(inv.subtotal)}</span></div>
          {Number(inv.vat_exempt) > 0 && <div className="flex justify-between text-slate-400"><span>VAT exemption</span><span className="font-mono2">−{peso(inv.vat_exempt)}</span></div>}
          {Number(inv.senior_pwd_discount) > 0 && <div className="flex justify-between text-slate-400"><span>Senior/PWD 20%</span><span className="font-mono2">−{peso(inv.senior_pwd_discount)}</span></div>}
          <div className="flex justify-between text-slate-50 font-semibold"><span>Total due</span><span className="font-mono2">{peso(inv.total_due)}</span></div>
          <div className="flex justify-between text-teal-300"><span>Paid</span><span className="font-mono2">{peso(paid)}</span></div>
          <div className="flex justify-between text-amber-300"><span>Balance</span><span className="font-mono2">{peso(balance)}</span></div>
        </div>
      </div>

      {inv.status === "draft" && (
        <div className="flex gap-3 mb-5">
          <button onClick={finalize} disabled={busy} className={btnPrimary}>Finalize invoice</button>
          <button onClick={voidInvoice} disabled={busy} className="px-4 py-2 rounded-xl border border-rose-500/40 text-rose-300 text-sm font-body hover:bg-rose-500/10">Void</button>
        </div>
      )}

      {["final", "partially_paid", "paid"].includes(inv.status) && (
        <div className={card}>
          <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-3">
            <Wallet size={15} className="text-teal-300" /> Payments
          </div>
          {pays.map((p) => (
            <div key={p.id} className="flex justify-between items-center py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
              <span className="text-slate-200 uppercase text-xs font-mono2">{p.method}{p.reference_no ? ` · ${p.reference_no}` : ""} <span className="text-slate-500 normal-case">· {fmtDT(p.paid_at)}</span></span>
              <span className="flex items-center gap-3">
                <span className="font-mono2 text-slate-300">{peso(p.amount)}</span>
                <button onClick={() => printOR(p)} className={btnGhost + " py-1 px-2.5 text-xs flex items-center gap-1"}><Printer size={12} /> {p.or_number}</button>
              </span>
            </div>
          ))}
          {balance > 0 ? (
            <div className="grid grid-cols-12 gap-2 mt-4">
              <select className={inputCls + " col-span-3"} value={pf.method} onChange={(e) => setPf((p) => ({ ...p, method: e.target.value }))}>
                {["cash", "gcash", "maya", "card", "bank"].map((m) => <option key={m}>{m}</option>)}
              </select>
              <input className={inputCls + " col-span-3"} type="number" placeholder={`Amount (bal ${peso(balance)})`} value={pf.amount} onChange={(e) => setPf((p) => ({ ...p, amount: e.target.value }))} />
              <input className={inputCls + " col-span-4"} placeholder="Reference no. (for GCash/Maya/card)" value={pf.reference_no} onChange={(e) => setPf((p) => ({ ...p, reference_no: e.target.value }))} />
              <button onClick={addPayment} disabled={busy} className={btnPrimary + " col-span-2"}>{busy ? "…" : "Receive"}</button>
            </div>
          ) : (
            <div className="mt-3 text-sm font-body text-teal-300 flex items-center gap-1.5"><Check size={15} /> Fully paid.</div>
          )}
          <p className="text-xs text-slate-500 font-body mt-3">Split payments are supported — e.g. part GCash, part cash. Each payment gets its own official receipt number.</p>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- module root ------------------------ */

export default function BillingModule() {
  const { profile } = useAuth();
  const [view, setView] = useState({ name: "list" });
  const [invoices, setInvoices] = useState([]);
  const [myDoctors, setMyDoctors] = useState([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState(null);

  const loadDoctors = async () => {
    if (profile.role === "doctor") {
      const { data } = await supabase.from("doctors").select("id, consult_fee, profiles(full_name)").eq("id", profile.id).single();
      setMyDoctors(data ? [{ id: data.id, consult_fee: data.consult_fee, name: data.profiles?.full_name || "Me" }] : []);
    } else {
      // secretary: their assigned doctors; admin: all doctors
      const q = profile.role === "secretary"
        ? supabase.from("staff_assignments").select("doctor:doctor_id(id, consult_fee, profiles(full_name))").eq("secretary_id", profile.id)
        : supabase.from("doctors").select("id, consult_fee, profiles(full_name)");
      const { data } = await q;
      const rows = profile.role === "secretary" ? (data || []).map((r) => r.doctor) : (data || []);
      setMyDoctors(rows.filter(Boolean).map((d) => ({ id: d.id, consult_fee: d.consult_fee, name: d.profiles?.full_name || "Doctor" })));
    }
  };

  const loadInvoices = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_no, status, total_due, created_at, patient:patient_record_id(first_name, last_name)")
      .order("created_at", { ascending: false }).limit(100);
    if (error) { setError(error.message); return; }
    setInvoices(data || []);
  };

  useEffect(() => { loadDoctors(); loadInvoices(); /* eslint-disable-next-line */ }, []);

  const shown = invoices.filter((i) => filter === "all" || i.status === filter);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-6">
        <div className="font-mono2 text-xs text-teal-300 mb-1">STAFF · BILLING & CASHIER</div>
        <h2 className="font-display text-3xl font-bold text-slate-50 flex items-center gap-3"><Receipt size={26} className="text-teal-300" /> Billing</h2>
      </div>

      {view.name === "list" && (
        <div className="fade-up">
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1 text-sm">
              {["all", "draft", "final", "partially_paid", "paid"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={"px-3 py-1.5 rounded-xl font-body capitalize transition-colors " + (filter === f ? "bg-teal-400 text-slate-950 font-medium" : "text-slate-400 hover:text-slate-100")}>
                  {f.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button onClick={() => setView({ name: "new" })} className={btnPrimary + " flex items-center gap-1.5"}><Plus size={15} /> New invoice</button>
          </div>
          <ErrorBanner msg={error} />
          <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
            {shown.length === 0 && <div className="px-5 py-12 text-center text-slate-500 font-body text-sm">No invoices yet — create the first one.</div>}
            {shown.map((i) => (
              <button key={i.id} onClick={() => setView({ name: "detail", id: i.id })} className="w-full grid grid-cols-12 gap-2 items-center px-5 py-3.5 border-b border-slate-800/60 last:border-0 text-left hover:bg-slate-800/40 transition-colors">
                <span className="col-span-3 font-mono2 text-sm text-teal-300">{i.invoice_no}</span>
                <span className="col-span-4 text-sm text-slate-100 font-body truncate">{i.patient?.first_name} {i.patient?.last_name}</span>
                <span className="col-span-2 font-mono2 text-sm text-slate-300 text-right">{peso(i.total_due)}</span>
                <span className="col-span-3 flex justify-end">
                  <span className={"px-2.5 py-0.5 rounded-full border text-xs " + STATUS_STYLE[i.status]}>{i.status.replace("_", " ")}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view.name === "new" && <InvoiceEditor myDoctors={myDoctors} onBack={() => setView({ name: "list" })} onDone={(id) => { loadInvoices(); setView({ name: "detail", id }); }} />}
      {view.name === "detail" && <InvoiceDetail invoiceId={view.id} onBack={() => setView({ name: "list" })} reloadList={loadInvoices} />}
    </div>
  );
}
