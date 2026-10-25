import React, { useState, useEffect } from "react";
import { Stethoscope, Receipt, Printer, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { friendlyError } from "./lib/errors";
import { printDocument, letterhead, esc } from "./lib/print";
import { FieldLabel, Notice, Stamp, btnSm, btnGhostSm, btnQuiet, inputSm, selectSm } from "./ui";

/* ------------------------------------------------------------------ */
/*  The patient's side of their own record: what happened at each      */
/*  visit, what they paid, and the details the clinic keeps on file.   */
/*  Reads go through narrow database functions                         */
/*  (medipulse-patient-profile.sql) that cover the patient and the     */
/*  dependents they look after.                                        */
/* ------------------------------------------------------------------ */

const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const has = (s) => !!(s && String(s).trim());

// Dev-only: the ?demo= preview has no database, so show sample rows.
const isDemo = () => import.meta.env.DEV && !!new URLSearchParams(window.location.search).get("demo");
const DEMO = {
  visits: [
    { encounter_id: "v1", appointment_id: null, visit_at: "2026-10-12T02:00:00Z", doctor_name: "Dr. Maria Santos", doctor_slug: "demo", chief_complaint: "Cough and fever for 3 days",
      diagnosis: "Acute upper respiratory infection", plan: "Paracetamol 500 mg every 6 hours as needed for fever.\nDrink plenty of water and rest.", follow_up_note: "Come back in 1 week if the cough continues." },
    { encounter_id: "v2", appointment_id: null, visit_at: "2026-08-20T02:00:00Z", doctor_name: "Dr. Maria Santos", doctor_slug: "demo", chief_complaint: "Annual check-up", diagnosis: "", plan: "", follow_up_note: "" },
  ],
  receipts: [
    { invoice_id: "r1", invoice_no: "INV-2026-000005", issued_at: "2026-10-12T03:00:00Z", status: "paid", doctor_name: "Dr. Maria Santos", doctor_prc: "0098765", clinic_name: "Santos Family Clinic", clinic_address: "12 Rizal St, Pasig",
      subtotal: 1500, senior_pwd_discount: 0, vat_exempt: 0, total_due: 1500, items: [{ description: "Consultation", quantity: 1, amount: 1500 }], payments: [{ method: "gcash", amount: 1500, or_number: "OR-0000009", paid_at: "2026-10-12T03:05:00Z" }] },
    { invoice_id: "r2", invoice_no: "INV-2026-000007", issued_at: "2026-10-20T03:00:00Z", status: "final", doctor_name: "Dr. Maria Santos", subtotal: 500, total_due: 500, items: [{ description: "Medical certificate", quantity: 1, amount: 500 }], payments: [] },
  ],
  record: { id: "demo-self", first_name: "Ana", last_name: "Reyes", phone: "0917 123 4567", birthdate: "1990-04-02", sex: "female", blood_type: "O+", address: { city: "Pasig", province: "Metro Manila" } },
  allergies: [{ id: "a1", substance: "Penicillin", reaction: "Hives", severity: "moderate" }],
};

/* -------------------------- visit summaries ------------------------ */

// Signed visit summaries for one person, or (no recordId) everyone this
// account looks after.
export function useVisitSummaries(recordId, refreshKey) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("my_visit_summaries", recordId ? { p_record_id: recordId } : {})
      .then(({ data, error }) => { if (!cancelled) setRows(error ? (isDemo() ? DEMO.visits : []) : data || []); });
    return () => { cancelled = true; };
  }, [recordId, refreshKey]);
  return rows;
}

// The doctor's signed summary of one visit, in plain sections.
export function VisitSummary({ s, t }) {
  const parts = [
    [t("Reason for the visit"), s.chief_complaint],
    [t("Diagnosis"), s.diagnosis],
    [t("What to do"), s.plan],
    [t("Follow-up"), s.follow_up_note],
  ].filter(([, v]) => has(v));
  if (parts.length === 0) return <p className="text-sm text-slate-400 font-body">{t("The doctor didn't add notes for this visit.")}</p>;
  return (
    <dl className="space-y-2.5 font-body">
      {parts.map(([label, v]) => (
        <div key={label}>
          <dt className="field-label">{label}</dt>
          <dd className="text-ink whitespace-pre-wrap mt-0.5">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// Records → Visits: every signed visit for this person, newest first,
// including walk-ins that were never booked online.
export function VisitsSection({ recordId, t }) {
  const rows = useVisitSummaries(recordId);
  const [open, setOpen] = useState(null);
  if (!recordId) return null;
  return (
    <section className="rounded-xl border border-slate-700 bg-white">
      <h3 className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 font-display text-lg font-bold text-ink"><Stethoscope size={18} /> {t("Visits")}</h3>
      {rows === null ? (
        <p className="px-5 py-4 text-sm text-slate-400 font-body">{t("Loading records…")}</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400 font-body">{t("No visit summaries yet. They appear here once the doctor signs off a visit.")}</p>
      ) : (
        <ul>
          {rows.map((s) => {
            const isOpen = open === s.encounter_id;
            return (
              <li key={s.encounter_id} className="border-b border-slate-800 last:border-0">
                <button onClick={() => setOpen(isOpen ? null : s.encounter_id)} aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left font-body hover:bg-ground/60">
                  <span className="min-w-0">
                    <span className="block text-ink font-semibold truncate">{has(s.diagnosis) ? s.diagnosis.split("\n")[0] : has(s.chief_complaint) ? s.chief_complaint : t("Visit")}</span>
                    <span className="block text-sm text-slate-400">{fmtDate(s.visit_at)} · {s.doctor_name || t("Doctor")}</span>
                  </span>
                  {isOpen ? <ChevronUp size={18} className="shrink-0 text-slate-300" /> : <ChevronDown size={18} className="shrink-0 text-slate-300" />}
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 space-y-3">
                    <VisitSummary s={s} t={t} />
                    {s.doctor_slug && <BookAgain slug={s.doctor_slug} t={t} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Back to the doctor's page, where the patient picks a new time.
export function BookAgain({ slug, t }) {
  return <a href={`/dr/${slug}`} className={btnQuiet + " inline-flex items-center gap-1.5"}><RotateCcw size={14} /> {t("Book again")}</a>;
}

/* ------------------------------ receipts --------------------------- */

const METHOD = { cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", bank: "Bank transfer", hmo: "HMO", philhealth: "PhilHealth" };

function printReceipt(r, personName) {
  const paid = (r.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balance = Math.max(0, Number(r.total_due || 0) - paid);
  printDocument("Receipt " + (r.invoice_no || ""), `
    ${letterhead("RECEIPT")}
    <table>
      ${r.clinic_name ? `<tr><td class="label">Clinic</td><td>${esc(r.clinic_name)}${r.clinic_address ? `<br/>${esc(r.clinic_address)}` : ""}${r.clinic_phone ? `<br/>${esc(r.clinic_phone)}` : ""}</td></tr>` : ""}
      <tr><td class="label">Doctor</td><td>${esc(r.doctor_name || "")}${r.doctor_prc ? ` · PRC ${esc(r.doctor_prc)}` : ""}</td></tr>
      <tr><td class="label">Patient</td><td>${esc(personName)}</td></tr>
      <tr><td class="label">Bill no.</td><td>${esc(r.invoice_no || "")}</td></tr>
      <tr><td class="label">Date</td><td>${esc(fmtDate(r.issued_at))}</td></tr>
    </table>
    <div class="rule"></div>
    <table>
      <tr><th>Description</th><th class="r">Qty</th><th class="r">Amount</th></tr>
      ${(r.items || []).map((i) => `<tr><td>${esc(i.description)}</td><td class="r">${esc(i.quantity ?? 1)}</td><td class="r">${esc(peso(i.amount))}</td></tr>`).join("")}
    </table>
    <table class="totals" style="margin-top:10px">
      <tr><td></td><td class="r">Subtotal</td><td class="r">${esc(peso(r.subtotal))}</td></tr>
      ${Number(r.senior_pwd_discount) > 0 ? `<tr><td></td><td class="r">Senior / PWD discount</td><td class="r">−${esc(peso(r.senior_pwd_discount))}</td></tr>` : ""}
      ${Number(r.vat_exempt) > 0 ? `<tr><td></td><td class="r">VAT exempt</td><td class="r">${esc(peso(r.vat_exempt))}</td></tr>` : ""}
      <tr class="grand"><td></td><td class="r">Total</td><td class="r">${esc(peso(r.total_due))}</td></tr>
    </table>
    ${(r.payments || []).length ? `
      <h3 style="margin-top:26px">Payments</h3>
      <table>
        <tr><th>Date</th><th>Method</th><th>OR no.</th><th class="r">Amount</th></tr>
        ${r.payments.map((p) => `<tr><td>${esc(p.paid_at ? fmtDate(p.paid_at) : "")}</td><td>${esc(METHOD[p.method] || p.method || "")}${p.reference_no ? ` · ${esc(p.reference_no)}` : ""}</td><td>${esc(p.or_number || "—")}</td><td class="r">${esc(peso(p.amount))}</td></tr>`).join("")}
      </table>` : ""}
    ${balance > 0 ? `<p style="margin-top:14px"><b>Balance: ${esc(peso(balance))}</b></p>` : `<div class="stamp">Paid</div>`}
    <div class="muted">Copy from the 4MED patient portal. For BIR, HMO or reimbursement claims, use the clinic's official receipt${(r.payments || []).some((p) => p.or_number) ? " (OR no. above)" : ""}.</div>`);
}

export function ReceiptsSection({ recordId, personName, t }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!recordId) return;
    supabase.rpc("my_receipts", { p_record_id: recordId }).then(({ data, error }) => setRows(error ? (isDemo() ? DEMO.receipts : []) : data || []));
  }, [recordId]);
  if (!recordId) return null;
  return (
    <section className="rounded-xl border border-slate-700 bg-white">
      <h3 className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 font-display text-lg font-bold text-ink"><Receipt size={18} /> {t("Receipts")}</h3>
      {rows === null ? (
        <p className="px-5 py-4 text-sm text-slate-400 font-body">{t("Loading records…")}</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400 font-body">{t("No bills yet. Your clinic's bills and payments appear here.")}</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const paid = (r.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
            return (
              <li key={r.invoice_id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 last:border-0 font-body">
                <div className="min-w-0">
                  <div className="text-ink"><b className="tnum">{peso(r.total_due)}</b> <span className="text-slate-400">· {r.doctor_name || t("Doctor")}</span></div>
                  <div className="text-sm text-slate-400 tnum">{fmtDate(r.issued_at)} · {r.invoice_no}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.status === "paid" ? <Stamp>{t("Paid")}</Stamp> : <span className="pending-mark">{t("Balance {amount}", { amount: peso(Math.max(0, Number(r.total_due) - paid)) })}</span>}
                  <button onClick={() => printReceipt(r, personName)} className={btnGhostSm}><Printer size={15} /> {t("Print")}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------- my details -------------------------- */

const SEXES = [["female", "Female"], ["male", "Male"], ["intersex", "Intersex"], ["unknown", "Prefer not to say"]];
const CIVIL = [["single", "Single"], ["married", "Married"], ["widowed", "Widowed"], ["separated", "Separated"]];
const SEVERITY = { mild: "Mild", moderate: "Moderate", severe: "Severe", life_threatening: "Life-threatening" };

export function MyDetailsPanel({ recordId, personName, isSelf, t, onSaved, onCreate }) {
  const [rec, setRec] = useState(null);
  const [allergies, setAllergies] = useState([]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!recordId) return;
    setRec(null); setF(null); setError(null);
    (async () => {
      const [p, a] = await Promise.all([
        supabase.from("patients").select("*").eq("id", recordId).maybeSingle(),
        supabase.from("allergies").select("id, substance, reaction, severity").eq("patient_id", recordId).order("created_at"),
      ]);
      const demo = p.error && isDemo();
      if (!demo && (p.error || !p.data)) { setError(friendlyError(p.error || { message: "Record not found" })); return; }
      const r = demo ? DEMO.record : p.data;
      setRec(r);
      setAllergies(demo ? DEMO.allergies : a.data || []);
      setF({
        phone: r.phone || "", email: r.email || "", birthdate: r.birthdate || "", sex: r.sex && r.sex !== "unknown" ? r.sex : "",
        civil_status: r.civil_status || "", line1: r.address?.line1 || "", barangay: r.address?.barangay || "",
        city: r.address?.city || "", province: r.address?.province || "", zip: r.address?.zip || "",
        philhealth_no: r.philhealth_no || "", senior_citizen_id: r.senior_citizen_id || "", pwd_id: r.pwd_id || "",
      });
    })();
  }, [recordId]);

  if (!recordId) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center font-body">
        <p className="text-slate-300">{t("Add your details once and every clinic you book has them.")}</p>
        {onCreate && (
          <button onClick={async () => { setBusy(true); try { await onCreate(); } catch (e) { setError(friendlyError(e)); } setBusy(false); }}
            disabled={busy} className={btnSm + " mt-4"}>{busy ? t("Saving…") : t("Add my details")}</button>
        )}
        {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      </div>
    );
  }
  if (error && !rec) return <Notice tone="error">{error}</Notice>;
  if (!rec || !f) return <p className="font-body text-slate-400">{t("Loading records…")}</p>;

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setSaved(false); };
  const save = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("update_my_details", {
      p_record_id: recordId, p_phone: f.phone, p_email: f.email,
      p_address: { line1: f.line1, barangay: f.barangay, city: f.city, province: f.province, zip: f.zip },
      p_birthdate: f.birthdate || null, p_sex: f.sex || null, p_civil_status: f.civil_status,
      p_philhealth_no: f.philhealth_no, p_senior_citizen_id: f.senior_citizen_id, p_pwd_id: f.pwd_id,
    });
    setBusy(false);
    if (error) { setError(friendlyError(error)); return; }
    setSaved(true);
    onSaved?.();
  };

  const Field = ({ label, k, type = "text", placeholder, className = "" }) => (
    <label className={"block " + className}>
      <FieldLabel>{label}</FieldLabel>
      <input type={type} className={inputSm + " mt-1.5" + (type === "tel" || k.endsWith("_no") || k.endsWith("_id") ? " tnum" : "")} value={f[k]} onChange={set(k)} placeholder={placeholder} />
    </label>
  );
  const fullName = [rec.first_name, rec.middle_name, rec.last_name, rec.suffix].filter(Boolean).join(" ");

  return (
    <div className="space-y-5 font-body">
      <section className="rounded-xl border border-slate-700 bg-white p-5">
        <FieldLabel>{t("Name")}</FieldLabel>
        <div className="font-display text-2xl font-bold text-ink mt-1">{fullName || personName}</div>
        <p className="text-sm text-slate-400 mt-1">{t("To correct a name, ask your clinic. It has to match your ID.")}</p>
      </section>

      <section className="rounded-xl border border-slate-700 bg-white p-5 space-y-4">
        <h3 className="font-display text-lg font-bold text-ink">{t("Contact and personal details")}</h3>
        {!isSelf && <p className="text-sm text-slate-300">{t("Leave phone and email blank to have the clinic contact you instead.")}</p>}
        <div className="grid sm:grid-cols-2 gap-4">
          {Field({ label: t("Mobile number"), k: "phone", type: "tel", placeholder: "0917 123 4567" })}
          {Field({ label: t("Email"), k: "email", type: "email" })}
          {Field({ label: t("Birthdate"), k: "birthdate", type: "date" })}
          <label className="block">
            <FieldLabel>{t("Sex")}</FieldLabel>
            <select className={selectSm + " mt-1.5"} value={f.sex} onChange={set("sex")}>
              <option value="">—</option>
              {SEXES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </label>
          <label className="block">
            <FieldLabel>{t("Civil status")}</FieldLabel>
            <select className={selectSm + " mt-1.5"} value={f.civil_status} onChange={set("civil_status")}>
              <option value="">—</option>
              {CIVIL.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 pt-1">
          {Field({ label: t("House no., street"), k: "line1", className: "sm:col-span-2" })}
          {Field({ label: t("Barangay"), k: "barangay" })}
          {Field({ label: t("City or municipality"), k: "city" })}
          {Field({ label: t("Province"), k: "province" })}
          {Field({ label: t("ZIP code"), k: "zip" })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-white p-5 space-y-4">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">{t("IDs and discounts")}</h3>
          <p className="text-sm text-slate-300 mt-0.5">{t("With a Senior Citizen or PWD ID on file, the clinic can apply your 20% discount. Bring the ID to your visit.")}</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {Field({ label: t("PhilHealth number"), k: "philhealth_no", placeholder: "12-345678901-2" })}
          {Field({ label: t("Senior Citizen ID"), k: "senior_citizen_id" })}
          {Field({ label: t("PWD ID"), k: "pwd_id" })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy} className={btnSm}>{busy ? t("Saving…") : t("Save details")}</button>
        {saved && <span className="text-sm text-ink">{t("Saved")}</span>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <section className="rounded-xl border border-slate-700 bg-white p-5">
        <h3 className="font-display text-lg font-bold text-ink">{t("Medical information from your clinic")}</h3>
        <p className="text-sm text-slate-400 mt-0.5 mb-4">{t("Only your clinic can change these. Tell them if something is wrong or missing.")}</p>
        <div className="grid sm:grid-cols-[160px_1fr] gap-4">
          <div>
            <FieldLabel>{t("Blood type")}</FieldLabel>
            <div className="write-in text-ink mt-1 tnum">{rec.blood_type || t("Not recorded")}</div>
          </div>
          <div>
            <FieldLabel>{t("Allergies")}</FieldLabel>
            {allergies.length === 0 ? (
              <div className="write-in text-ink mt-1">{t("None recorded")}</div>
            ) : (
              <ul className="mt-1 space-y-1">
                {allergies.map((a) => (
                  <li key={a.id} className="text-ink">
                    <b>{a.substance}</b>{has(a.reaction) ? ` — ${a.reaction}` : ""}
                    {has(a.severity) && <span className="text-sm text-slate-400"> · {t(SEVERITY[a.severity] || a.severity)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
