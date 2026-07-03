import React, { useState, useEffect, useMemo } from "react";
import {
  Stethoscope, Mic, MicOff, FileText, Printer, Plus, X, Check, ArrowLeft,
  Clock, Users, ClipboardList, Pill, Scissors, CalendarPlus, AlertCircle, History,
} from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { StaffGate } from "./lib/StaffGate";
import DentalChart from "./DentalChart";

/* ------------------------------------------------------------------ */
/*  Doctor Portal — dashboard + consultation workspace                 */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const areaCls = inputCls + " min-h-24 resize-y";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";
const card = "rounded-3xl border border-slate-800 bg-slate-900 p-5";

const fmtDT = (iso) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtT = (iso) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const todayStr = () => new Date().toISOString().slice(0, 10);
const calcAge = (b) => {
  if (!b) return null; // provisional records may not have one yet
  // Parse the y-m-d string directly rather than via `new Date(str)`,
  // which is interpreted as UTC and can misreport the age by one day
  // in negative-UTC-offset timezones (harmless for PH/+8, but this
  // keeps the calculation correct regardless of the browser's locale).
  const [by, bm, bd] = String(b).split("-").map(Number);
  const n = new Date();
  let a = n.getFullYear() - by;
  if (n.getMonth() + 1 < bm || (n.getMonth() + 1 === bm && n.getDate() < bd)) a--;
  return a;
};

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-4">
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> {msg}
    </div>
  );
}

/* ------------------------- voice dictation ------------------------ */

function DictationButton({ onText }) {
  const [active, setActive] = useState(false);
  const [rec, setRec] = useState(null);
  const supported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggle = () => {
    if (rec) { rec.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-PH";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).slice(e.resultIndex).map((x) => x[0].transcript).join(" ").trim();
      if (text) onText(text);
    };
    r.onend = () => { setActive(false); setRec(null); };
    r.onerror = () => { setActive(false); setRec(null); };
    r.start();
    setRec(r);
    setActive(true);
  };

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      title={active ? "Stop dictation" : "Dictate"}
      className={"p-1.5 rounded-lg border transition-colors " + (active ? "border-rose-500/60 text-rose-300 bg-rose-500/10 animate-pulse" : "border-slate-700 text-slate-400 hover:text-teal-300 hover:border-teal-500/60")}
    >
      {active ? <MicOff size={13} /> : <Mic size={13} />}
    </button>
  );
}

/* ---------------------------- print helper ------------------------ */

function printDocument(title, bodyHtml) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  w.document.write(
    `<html><head><title>${title}</title><style>
      body { font-family: Georgia, serif; color: #111; max-width: 700px; margin: 40px auto; line-height: 1.55; }
      h1 { font-size: 20px; letter-spacing: 1px; margin-bottom: 2px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 24px; }
      .rule { border-top: 2px solid #111; margin: 14px 0 22px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      td { padding: 6px 4px; vertical-align: top; }
      .label { color: #555; width: 160px; }
      .rx-item { margin: 10px 0; padding-left: 14px; border-left: 3px solid #0d9488; }
      .sig { margin-top: 70px; text-align: right; }
      .sig .line { display: inline-block; border-top: 1px solid #111; padding-top: 4px; min-width: 260px; text-align: center; font-size: 13px; }
      .muted { color: #777; font-size: 11px; margin-top: 30px; }
    </style></head><body>${bodyHtml}<scr` + `ipt>window.onload = () => window.print();</scr` + `ipt></body></html>`
  );
  w.document.close();
}

// Escapes user-supplied text before it's interpolated into a raw HTML
// print template (document.write). Without this, a diagnosis, remark,
// drug name, or patient name containing HTML/script would execute in
// the print window. Always wrap interpolated dynamic values with this.
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------------------- dashboard --------------------------- */

function Dashboard({ me, onOpenEncounter }) {
  const [appts, setAppts] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [openEncounters, setOpenEncounters] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [linking, setLinking] = useState(null); // the appointment row needing a patient link

  const load = async () => {
    const from = todayStr() + "T00:00:00";
    const [ap, qt, en] = await Promise.all([
      supabase.from("appointments")
        .select("id, starts_at, status, type, patient_id, patient_record_id, location:location_id(name), patient_rec:patient_record_id(id, first_name, last_name, birthdate, sex), portal:patient_id(full_name)")
        .eq("doctor_id", me).gte("starts_at", from).lt("starts_at", todayStr() + "T23:59:59")
        .order("starts_at"),
      supabase.from("queue_tickets")
        .select("id, number, priority, status, patient:patient_record_id(id, first_name, last_name, birthdate, sex)")
        .gte("created_at", from).in("station", ["Triage", "Consultation"]).in("status", ["waiting", "called"])
        .order("created_at"),
      supabase.from("encounters")
        .select("id, started_at, chief_complaint, patient:patient_record_id(id, first_name, last_name, birthdate, sex)")
        .eq("doctor_id", me).is("ended_at", null),
    ]);
    if (ap.error) { setError(ap.error.message); return; }
    setAppts(ap.data || []);
    setWaiting(qt.data || []);
    setOpenEncounters(en.data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [me]);

  const startConsult = async (patientRecId, appointmentId, ticketId) => {
    if (!patientRecId) {
      // No clinical master record linked yet — if this booking came
      // through the patient portal we can repair it right here instead
      // of just blocking; otherwise (a fully unlinked/anonymous
      // booking) point staff to Records.
      const appt = appts.find((a) => a.id === appointmentId);
      if (appt?.patient_id) { setLinking(appt); return; }
      setError("This booking has no linked patient record — open Records and register/link the patient first.");
      return;
    }
    setBusy(appointmentId || ticketId);
    const { data, error } = await supabase.from("encounters")
      .insert({ patient_record_id: patientRecId, appointment_id: appointmentId || null, doctor_id: me })
      .select("id").single();
    setBusy(null);
    if (error) { setError(error.message); return; }
    if (appointmentId) await supabase.from("appointments").update({ status: "in_progress" }).eq("id", appointmentId);
    if (ticketId) await supabase.from("queue_tickets").update({ status: "serving", served_at: new Date().toISOString() }).eq("id", ticketId);
    onOpenEncounter(data.id);
  };

  const stat = (label, value, Icon) => (
    <div className={card + " flex items-center gap-4"}>
      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center"><Icon size={18} className="text-teal-300" /></div>
      <div>
        <div className="font-display text-2xl font-bold text-slate-50">{value}</div>
        <div className="text-xs text-slate-500 font-body">{label}</div>
      </div>
    </div>
  );

  const done = appts.filter((a) => a.status === "completed").length;

  return (
    <div className="fade-up">
      <ErrorBanner msg={error} />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {stat("Today's appointments", appts.length, Clock)}
        {stat("Waiting in queue", waiting.length, Users)}
        {stat("Completed today", done, Check)}
      </div>

      {openEncounters.length > 0 && (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5 mb-6">
          <div className="font-display font-semibold text-amber-200 mb-2">Open consultations</div>
          {openEncounters.map((e) => (
            <button key={e.id} onClick={() => onOpenEncounter(e.id)} className="w-full flex justify-between items-center py-2 text-sm font-body text-left hover:text-teal-300 transition-colors">
              <span className="text-slate-100">{e.patient?.first_name} {e.patient?.last_name} <span className="text-slate-500">· started {fmtT(e.started_at)}</span></span>
              <span className="text-teal-300 text-xs">Resume →</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className={card}>
          <div className="font-display font-semibold text-slate-100 mb-3">Today's appointments</div>
          {appts.length === 0 && <div className="text-sm text-slate-500 font-body">Nothing booked for today.</div>}
          {appts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-slate-100 font-body truncate">
                  {a.patient_rec ? `${a.patient_rec.first_name} ${a.patient_rec.last_name}` : a.portal?.full_name || "Unknown"}
                  {a.patient_rec && (calcAge(a.patient_rec.birthdate) != null || (a.patient_rec.sex && a.patient_rec.sex !== "unknown")) && (
                    <span className="text-slate-500"> · {calcAge(a.patient_rec.birthdate) != null ? `${calcAge(a.patient_rec.birthdate)}y ` : ""}{a.patient_rec.sex !== "unknown" ? a.patient_rec.sex : ""}</span>
                  )}
                </div>
                <div className="font-mono2 text-xs text-slate-500">{fmtT(a.starts_at)} · {a.type.replace("_", " ")} · {a.status}{a.location ? ` · ${a.location.name}` : ""}</div>
              </div>
              {["booked", "confirmed", "checked_in"].includes(a.status) && (
                <button onClick={() => startConsult(a.patient_record_id, a.id, null)} disabled={busy === a.id} className={btnPrimary + " py-1.5 shrink-0"}>
                  {busy === a.id ? "Opening…" : "Start consult"}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={card}>
          <div className="font-display font-semibold text-slate-100 mb-3">Waiting patients (queue)</div>
          {waiting.length === 0 && <div className="text-sm text-slate-500 font-body">Queue is clear.</div>}
          {waiting.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
              <div className="text-sm font-body">
                <span className="font-mono2 text-teal-300">{t.number}</span>
                <span className="text-slate-100 ml-2">{t.patient ? `${t.patient.first_name} ${t.patient.last_name}` : "Unregistered"}</span>
                {t.priority !== "regular" && <span className="ml-2 text-xs text-amber-300">{t.priority.replace("_", "/")}</span>}
              </div>
              {t.patient && (
                <button onClick={() => startConsult(t.patient.id, null, t.id)} disabled={busy === t.id} className={btnGhost + " py-1.5 shrink-0"}>
                  {busy === t.id ? "Opening…" : "Take in"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {linking && (
        <LinkPatientModal
          appt={linking}
          me={me}
          onClose={() => setLinking(null)}
          onLinked={() => { setLinking(null); setError(null); load(); }}
        />
      )}
    </div>
  );
}

/* -------------------- link portal booking to record ---------------- */

function LinkPatientModal({ appt, me, onClose, onLinked }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const portalName = appt.portal?.full_name || "this patient";

  const link = async () => {
    setBusy(true); setError(null);
    const { data: recordId, error: e1 } = await supabase.rpc("get_or_create_patient_record", {
      p_profile_id: appt.patient_id, p_full_name: appt.portal?.full_name || "Patient",
    });
    if (e1) { setError(e1.message); setBusy(false); return; }
    const { error: e2 } = await supabase.from("appointments").update({ patient_record_id: recordId }).eq("id", appt.id);
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    onLinked();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-slate-50 mb-1">Create patient record for {portalName}</h3>
        <p className="text-xs text-slate-500 font-body mb-4">
          This booking came from the online portal before a medical record existed.
          We'll create a record from their name now — birthdate, sex, and the rest
          get filled in at the front desk when they check in, same as any walk-in.
        </p>
        {error && (
          <div className="mb-3 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className={btnGhost + " flex-1"}>Cancel</button>
          <button onClick={link} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Linking…" : "Create & link record"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------ consultation workspace ------------------ */

function Consult({ encounterId, me, myName, onExit }) {
  const [enc, setEnc] = useState(null);
  const [patient, setPatient] = useState(null);
  const [allergies, setAllergies] = useState([]);
  const [note, setNote] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [noteId, setNoteId] = useState(null);
  const [signed, setSigned] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState([]);
  const [rxItems, setRxItems] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [dentalProcs, setDentalProcs] = useState([]);
  const [certs, setCerts] = useState([]);
  const [chief, setChief] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("soap");
  const [consultFee, setConsultFee] = useState(0);
  const [specialty, setSpecialty] = useState(null);
  const [isDentist, setIsDentist] = useState(false);
  const [showBilling, setShowBilling] = useState(false);

  const load = async () => {
    const { data: e, error: err } = await supabase.from("encounters")
      .select("*, patient:patient_record_id(*)").eq("id", encounterId).single();
    if (err) { setError(err.message); return; }
    setEnc(e); setPatient(e.patient); setChief(e.chief_complaint || ""); setFollowUp(e.follow_up_note || "");
    const [al, tpl, hx, nt, rx, pr, mc] = await Promise.all([
      supabase.from("allergies").select("substance, severity").eq("patient_id", e.patient_record_id),
      supabase.from("note_templates").select("*"),
      supabase.from("encounters")
        .select("id, started_at, chief_complaint, doctor:doctor_id(profiles(full_name)), notes:clinical_notes(type, assessment, signed_at)")
        .eq("patient_record_id", e.patient_record_id).neq("id", encounterId)
        .order("started_at", { ascending: false }).limit(10),
      supabase.from("clinical_notes").select("*").eq("encounter_id", encounterId).eq("type", "soap").maybeSingle(),
      supabase.from("prescriptions").select("id, status, items:prescription_items(*)").eq("encounter_id", encounterId),
      supabase.from("procedures").select("*").eq("encounter_id", encounterId).order("performed_at"),
      supabase.from("med_certificates").select("*").eq("encounter_id", encounterId),
    ]);
    setAllergies(al.data || []);
    setTemplates(tpl.data || []);
    setHistory(hx.data || []);
    if (nt.data) {
      setNoteId(nt.data.id);
      setSigned(!!nt.data.signed_at);
      setNote({ subjective: nt.data.subjective || "", objective: nt.data.objective || "", assessment: nt.data.assessment || "", plan: nt.data.plan || "" });
    }
    setRxItems((rx.data || []).flatMap((r) => r.items.map((i) => ({ ...i, rx_id: r.id }))));
    setProcedures(pr.data || []);
    setCerts(mc.data || []);
    const { data: doc } = await supabase.from("doctors").select("consult_fee, specialty, specialties, profession_type").eq("id", e.doctor_id).maybeSingle();
    setConsultFee(Number(doc?.consult_fee || 0));
    setSpecialty(doc?.specialties?.length ? doc.specialties.join(" / ") : doc?.specialty || null);
    const dentist = doc?.profession_type === "dentist";
    setIsDentist(dentist);
    if (dentist) {
      const { data: dp } = await supabase.from("dental_procedures").select("*").eq("encounter_id", encounterId).order("performed_at");
      setDentalProcs(dp || []);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [encounterId]);

  const applyTemplate = (id) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setNote((n) => ({
      subjective: n.subjective || t.subjective || "",
      objective: n.objective || t.objective || "",
      assessment: n.assessment || t.assessment || "",
      plan: n.plan || t.plan || "",
    }));
  };

  const saveDraft = async (silent = false) => {
    if (signed) return;
    setBusy(true); setError(null);
    await supabase.from("encounters").update({ chief_complaint: chief || null, follow_up_note: followUp || null }).eq("id", encounterId);
    let err;
    if (noteId) {
      ({ error: err } = await supabase.from("clinical_notes").update({ ...note, updated_at: new Date().toISOString() }).eq("id", noteId));
    } else {
      const { data, error: e2 } = await supabase.from("clinical_notes")
        .insert({ encounter_id: encounterId, author_id: me, type: "soap", ...note }).select("id").single();
      err = e2;
      if (data) setNoteId(data.id);
    }
    setBusy(false);
    if (err) setError(err.message);
    else if (!silent) setError(null);
    return !err;
  };

  const signAndComplete = async () => {
    setBusy(true); setError(null);
    const ok = await saveDraft(true);
    if (!ok) { setBusy(false); return; }
    const { data: freshId } = noteId
      ? { data: noteId }
      : await supabase.from("clinical_notes").select("id").eq("encounter_id", encounterId).eq("type", "soap").single().then((r) => ({ data: r.data?.id }));
    const { error: e1 } = await supabase.from("clinical_notes").update({ signed_at: new Date().toISOString() }).eq("id", freshId);
    if (e1) { setError(e1.message); setBusy(false); return; }
    await supabase.from("encounters").update({ ended_at: new Date().toISOString() }).eq("id", encounterId);
    if (enc.appointment_id) await supabase.from("appointments").update({ status: "completed" }).eq("id", enc.appointment_id);
    setBusy(false);
    setSigned(true);
    setShowBilling(true);
  };

  const printRx = () => {
    if (rxItems.length === 0) return;
    const items = rxItems.map((i) =>
      `<div class="rx-item"><strong>${esc(i.drug_name)}</strong> ${esc(i.dose || "")}<br/>
       ${esc([i.route, i.frequency, i.duration].filter(Boolean).join(" · "))}${i.quantity ? ` · #${esc(i.quantity)}` : ""}
       ${i.instructions ? `<br/><em>${esc(i.instructions)}</em>` : ""}</div>`).join("");
    printDocument("e-Prescription", `
      <h1>MEDIPULSE CLINIC</h1><div class="sub">Electronic Prescription</div><div class="rule"></div>
      <table><tr><td class="label">Patient</td><td>${esc(patient.first_name)} ${esc(patient.last_name)}${(calcAge(patient.birthdate) != null || patient.sex !== "unknown") ? ` (${calcAge(patient.birthdate) != null ? calcAge(patient.birthdate) + "y" : ""}${calcAge(patient.birthdate) != null && patient.sex !== "unknown" ? ", " : ""}${patient.sex !== "unknown" ? esc(patient.sex) : ""})` : ""}</td></tr>
      <tr><td class="label">MRN</td><td>${esc(patient.mrn)}</td></tr>
      <tr><td class="label">Date</td><td>${esc(new Date().toLocaleDateString("en-PH", { dateStyle: "long" }))}</td></tr></table>
      <div class="rule"></div><div style="font-size:30px">℞</div>${items}
      <div class="sig"><div class="line">${esc(myName)}<br/>Lic. No. _______________</div></div>
      <div class="muted">Electronically generated via MediPulse. Valid with prescriber's signature.</div>`);
  };

  const printCert = (c) => {
    printDocument("Medical Certificate", `
      <h1>MEDIPULSE CLINIC</h1><div class="sub">Medical Certificate</div><div class="rule"></div>
      <p>This is to certify that <strong>${esc(patient.first_name)} ${esc(patient.last_name)}</strong>${calcAge(patient.birthdate) != null ? `, ${calcAge(patient.birthdate)} years old,` : ","} was seen and examined on
      ${esc(new Date(c.issued_at).toLocaleDateString("en-PH", { dateStyle: "long" }))} with the following findings:</p>
      <p><strong>Diagnosis:</strong> ${esc(c.diagnosis)}</p>
      ${c.remarks ? `<p><strong>Remarks:</strong> ${esc(c.remarks)}</p>` : ""}
      ${c.rest_days > 0 ? `<p>The patient is advised to rest for <strong>${esc(c.rest_days)} day(s)</strong>.</p>` : ""}
      <p>This certificate is issued upon the patient's request for whatever legal purpose it may serve.</p>
      <div class="sig"><div class="line">${esc(myName)}<br/>Lic. No. _______________</div></div>
      <div class="muted">Electronically generated via MediPulse.</div>`);
  };

  if (!enc || !patient) return <div className="py-20 text-center text-slate-500 font-body">{error || "Loading consultation…"}</div>;

  const dictate = (field) => (text) => setNote((n) => ({ ...n, [field]: (n[field] ? n[field] + " " : "") + text }));

  const soapFields = [
    ["subjective", "Subjective", "Patient's complaints, history in their words…"],
    ["objective", "Objective", "Vitals, physical exam findings…"],
    ["assessment", "Assessment", "Diagnosis / impressions…"],
    ["plan", "Plan", "Treatment, meds, diagnostics, advice…"],
  ];

  return (
    <div className="fade-up">
      <button onClick={onExit} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 font-body mb-4">
        <ArrowLeft size={15} /> Back to dashboard
      </button>

      {/* patient context banner */}
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5 mb-5 flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center font-display font-bold text-slate-950">
          {patient.first_name[0]}{patient.last_name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold text-slate-50">{patient.first_name} {patient.last_name}</div>
          <div className="font-mono2 text-xs text-teal-300">{patient.mrn}{calcAge(patient.birthdate) != null ? ` · ${calcAge(patient.birthdate)}y` : ""}{patient.sex !== "unknown" ? ` ${patient.sex}` : ""} · started {fmtT(enc.started_at)}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {allergies.map((a, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/40 text-xs font-body">⚠ {a.substance}</span>
            ))}
            {allergies.length === 0 && <span className="text-xs text-slate-600 font-body">No known allergies</span>}
          </div>
        </div>
        {signed ? (
          <span className="px-3 py-1.5 rounded-xl bg-teal-400/10 border border-teal-400/40 text-teal-300 text-sm font-body flex items-center gap-1.5"><Check size={14} /> Signed</span>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => saveDraft()} disabled={busy} className={btnGhost}>Save draft</button>
            <button onClick={signAndComplete} disabled={busy} className={btnPrimary}>{busy ? "Working…" : "Sign & complete"}</button>
          </div>
        )}
      </div>

      <ErrorBanner msg={error} />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* main workspace */}
        <div className="lg:col-span-2 space-y-5">
          <input className={inputCls} placeholder="Chief complaint" value={chief} onChange={(e) => setChief(e.target.value)} disabled={signed} />

          <div className="flex gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1 text-sm w-fit">
            {[
              ["soap", "SOAP note"],
              ...(isDentist ? [["dental", "Dental Chart"]] : []),
              ["rx", "e-Prescription"], ["proc", "Procedures"], ["cert", "Med certificate"], ["fu", "Follow-up"],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={"px-3 py-1.5 rounded-xl font-body transition-colors " + (tab === id ? "bg-teal-400 text-slate-950 font-medium" : "text-slate-400 hover:text-slate-100")}>
                {label}
              </button>
            ))}
          </div>

          {tab === "soap" && (
            <div className={card + " space-y-4"}>
              <div className="flex items-center justify-between">
                <div className="font-display font-semibold text-slate-100 flex items-center gap-2"><FileText size={15} className="text-teal-300" /> SOAP note</div>
                {!signed && (
                  <select className={inputCls + " w-64"} defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.target.value = ""; }}>
                    <option value="" disabled>Apply a template…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.specialty ? ` (${t.specialty})` : ""}</option>)}
                  </select>
                )}
              </div>
              {soapFields.map(([key, label, ph]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-mono2 text-slate-500">{label.toUpperCase()}</label>
                    {!signed && <DictationButton onText={dictate(key)} />}
                  </div>
                  <textarea className={areaCls} placeholder={ph} value={note[key]} onChange={(e) => setNote((n) => ({ ...n, [key]: e.target.value }))} disabled={signed} />
                </div>
              ))}
              {!signed && <p className="text-xs text-slate-500 font-body">Tip: the mic buttons use your browser's speech recognition — dictate straight into any field. Signing locks this note permanently (amendments become new notes).</p>}
            </div>
          )}

          {tab === "dental" && (
            <DentalChart patient={patient} encounterId={encounterId} me={me} signed={signed} />
          )}

          {tab === "rx" && (
            <div className={card}>
              <div className="flex items-center justify-between mb-4">
                <div className="font-display font-semibold text-slate-100 flex items-center gap-2"><Pill size={15} className="text-teal-300" /> Electronic prescription</div>
                {rxItems.length > 0 && <button onClick={printRx} className={btnGhost + " flex items-center gap-1.5"}><Printer size={14} /> Print</button>}
              </div>
              {rxItems.map((i) => (
                <div key={i.id} className="py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
                  <span className="text-slate-100 font-semibold">{i.drug_name}</span> <span className="text-slate-300">{i.dose}</span>
                  <div className="text-xs text-slate-500">{[i.route, i.frequency, i.duration, i.quantity ? `#${i.quantity}` : null].filter(Boolean).join(" · ")}</div>
                  {i.instructions && <div className="text-xs text-slate-400 italic">{i.instructions}</div>}
                </div>
              ))}
              {!signed && <RxForm encounterId={encounterId} me={me} allergies={allergies} onSaved={load} />}
            </div>
          )}

          {tab === "proc" && (
            <div className={card}>
              <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-4"><Scissors size={15} className="text-teal-300" /> Procedures performed</div>
              {isDentist ? (
                <>
                  {dentalProcs.map((p) => (
                    <div key={p.id} className="py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
                      <span className="text-slate-100">{p.procedure_name}</span>
                      {p.tooth_number && <span className="ml-2 font-mono2 text-xs text-teal-300">tooth {p.tooth_number}</span>}
                      <span className="font-mono2 text-xs text-slate-500"> · {fmtDT(p.performed_at)}</span>
                      {p.notes && <div className="text-xs text-slate-400">{p.notes}</div>}
                    </div>
                  ))}
                  {dentalProcs.length === 0 && <div className="text-sm text-slate-500 font-body mb-2">No dental procedures recorded this visit.</div>}
                  {!signed && <DentalProcForm encounterId={encounterId} me={me} onSaved={load} />}
                </>
              ) : (
                <>
                  {procedures.map((p) => (
                    <div key={p.id} className="py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
                      <span className="text-slate-100">{p.name}</span> <span className="font-mono2 text-xs text-slate-500">· {fmtDT(p.performed_at)}</span>
                      {p.notes && <div className="text-xs text-slate-400">{p.notes}</div>}
                    </div>
                  ))}
                  {procedures.length === 0 && <div className="text-sm text-slate-500 font-body mb-2">No procedures recorded this visit.</div>}
                  {!signed && <ProcForm encounterId={encounterId} me={me} onSaved={load} />}
                </>
              )}
            </div>
          )}

          {tab === "cert" && (
            <div className={card}>
              <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-4"><ClipboardList size={15} className="text-teal-300" /> Medical certificates</div>
              {certs.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
                  <div>
                    <span className="text-slate-100">{c.diagnosis}</span>
                    <div className="text-xs text-slate-500">{c.rest_days > 0 ? `${c.rest_days} rest day(s) · ` : ""}{fmtDT(c.issued_at)}</div>
                  </div>
                  <button onClick={() => printCert(c)} className={btnGhost + " py-1.5 flex items-center gap-1.5"}><Printer size={13} /> Print</button>
                </div>
              ))}
              {!signed && <CertForm encounterId={encounterId} me={me} onSaved={load} />}
            </div>
          )}

          {tab === "fu" && (
            <div className={card}>
              <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-3"><CalendarPlus size={15} className="text-teal-300" /> Follow-up recommendations</div>
              <textarea className={areaCls} placeholder="e.g. Return in 2 weeks for BP re-check; repeat CBC before next visit; sooner if symptoms worsen." value={followUp} onChange={(e) => setFollowUp(e.target.value)} disabled={signed} />
              <p className="text-xs text-slate-500 font-body mt-2">Saved with the encounter. To actually book the follow-up slot, use the +1w/+2w/+4w buttons on this appointment in the Appointments calendar — it sends the patient a confirmation automatically.</p>
            </div>
          )}
        </div>

        {/* history sidebar */}
        <div className={card + " h-fit"}>
          <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-3"><History size={15} className="text-teal-300" /> Patient history</div>
          {history.length === 0 && <div className="text-sm text-slate-500 font-body">First recorded visit for this patient.</div>}
          {history.map((h) => (
            <div key={h.id} className="py-3 border-b border-slate-800/60 last:border-0">
              <div className="font-mono2 text-xs text-slate-500">{fmtDT(h.started_at)} · {h.doctor?.profiles?.full_name || "—"}</div>
              <div className="text-sm text-slate-200 font-body">{h.chief_complaint || "No chief complaint recorded"}</div>
              {h.notes?.filter((n) => n.signed_at && n.assessment).map((n, i) => (
                <div key={i} className="text-xs text-slate-400 font-body mt-1">Dx: {n.assessment.slice(0, 120)}{n.assessment.length > 120 ? "…" : ""}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {showBilling && (
        <PostSignBilling
          patient={patient}
          me={me}
          encounterId={encounterId}
          consultFee={consultFee}
          procedures={procedures}
          dentalProcedures={dentalProcs}
          onDone={onExit}
        />
      )}
    </div>
  );
}

/* ----------------------- post-sign billing ------------------------- */

const psPeso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const psR2 = (n) => Math.round(n * 100) / 100;

function psTotals(subtotal, isSeniorPwd, vatRegistered) {
  if (!isSeniorPwd) return { vatExempt: 0, discount: 0, total: psR2(subtotal) };
  const vatExempt = vatRegistered ? psR2((subtotal * 12) / 112) : 0;
  const base = subtotal - vatExempt;
  const discount = psR2(base * 0.2);
  return { vatExempt, discount, total: psR2(subtotal - vatExempt - discount) };
}

function PostSignBilling({ patient, me, encounterId, consultFee, procedures, dentalProcedures = [], onDone }) {
  const { session } = useAuth();
  const [items, setItems] = useState(() => [
    { description: "Consultation", source: "consultation", quantity: 1, unit_price: consultFee || 0 },
    ...procedures.map((p) => ({ description: p.name, source: "procedure", quantity: 1, unit_price: 0 })),
    ...dentalProcedures.map((p) => ({
      description: p.tooth_number ? `${p.procedure_name} (tooth ${p.tooth_number})` : p.procedure_name,
      source: "procedure", quantity: 1, unit_price: 0,
    })),
  ]);
  const [vatRegistered, setVatRegistered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isSeniorPwd = !!(patient.senior_citizen_id || patient.pwd_id || calcAge(patient.birthdate) >= 60);
  const subtotal = psR2(items.reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 1), 0));
  const { vatExempt, discount, total } = psTotals(subtotal, isSeniorPwd, vatRegistered);

  const setItem = (idx, key, val) =>
    setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, [key]: val } : it)));

  const createInvoice = async () => {
    const clean = items
      .filter((i) => i.description.trim() && Number(i.unit_price) > 0)
      .map((i) => ({
        description: i.description.trim(), source: i.source,
        quantity: Number(i.quantity) || 1,
        unit_price: psR2(Number(i.unit_price)),
        amount: psR2((Number(i.quantity) || 1) * Number(i.unit_price)),
      }));
    if (clean.length === 0) { setError("Enter an amount for at least one charge, or skip billing."); return; }
    const sub = psR2(clean.reduce((s, i) => s + i.amount, 0));
    const t = psTotals(sub, isSeniorPwd, vatRegistered);
    setBusy(true); setError(null);
    const { data: inv, error: e1 } = await supabase.from("invoices").insert({
      doctor_id: me, patient_record_id: patient.id, encounter_id: encounterId,
      status: "final", finalized_at: new Date().toISOString(),
      is_senior_pwd: isSeniorPwd, vat_registered: vatRegistered,
      subtotal: sub, vat_exempt: t.vatExempt, senior_pwd_discount: t.discount, total_due: t.total,
      created_by: session?.user?.id || null,
    }).select("id").single();
    if (e1) { setError(e1.message); setBusy(false); return; }
    const { error: e2 } = await supabase.from("invoice_items").insert(clean.map((i) => ({ ...i, invoice_id: inv.id })));
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up max-h-[90vh] overflow-y-auto">
        <h3 className="font-display text-lg font-bold text-slate-50 mb-1">Consultation signed — bill the visit</h3>
        <p className="text-xs text-slate-500 font-body mb-4">
          Set the amounts below. The invoice goes to Billing, where you or your secretary can receive the payment and print the official receipt.
          {isSeniorPwd && <span className="text-amber-300"> Senior/PWD benefits will be applied automatically.</span>}
        </p>

        {items.map((i, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
            <input
              className="col-span-7 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-body focus:outline-none focus:border-teal-400"
              value={i.description}
              onChange={(e) => setItem(idx, "description", e.target.value)}
            />
            <input
              className="col-span-5 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-mono2 focus:outline-none focus:border-teal-400"
              type="number" min="0" placeholder="Amount (₱)"
              value={i.unit_price || ""}
              onChange={(e) => setItem(idx, "unit_price", e.target.value)}
            />
          </div>
        ))}
        <button
          onClick={() => setItems((prev) => [...prev, { description: "", source: "other", quantity: 1, unit_price: 0 }])}
          className="text-xs text-teal-300 font-body hover:underline mb-4"
        >
          + Add another charge
        </button>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-1.5 text-sm font-body mb-4">
          <div className="flex justify-between text-slate-400"><span>Subtotal</span><span className="font-mono2">{psPeso(subtotal)}</span></div>
          {isSeniorPwd && vatRegistered && <div className="flex justify-between text-slate-400"><span>VAT exemption</span><span className="font-mono2">−{psPeso(vatExempt)}</span></div>}
          {isSeniorPwd && <div className="flex justify-between text-slate-400"><span>Senior/PWD 20%</span><span className="font-mono2">−{psPeso(discount)}</span></div>}
          <div className="flex justify-between text-slate-50 font-semibold pt-1.5 border-t border-slate-800"><span>Total due</span><span className="font-mono2 text-teal-300">{psPeso(total)}</span></div>
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer pt-1">
            <input type="checkbox" checked={vatRegistered} onChange={(e) => setVatRegistered(e.target.checked)} className="accent-teal-400" />
            Clinic is VAT-registered
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onDone} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors">
            Skip billing
          </button>
          <button onClick={createInvoice} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60">
            {busy ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- sub-forms ----------------------------- */

function RxForm({ encounterId, me, allergies, onSaved }) {
  const [f, setF] = useState({ drug_name: "", dose: "", route: "oral", frequency: "", duration: "", quantity: "", instructions: "" });
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(null);
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((p) => ({ ...p, [k]: v }));
    if (k === "drug_name") {
      const hit = allergies.find((a) => v.toLowerCase().includes(a.substance.toLowerCase()) || a.substance.toLowerCase().includes(v.toLowerCase()));
      setWarn(v.length > 2 && hit ? `Patient has a recorded allergy to ${hit.substance}${hit.severity ? ` (${hit.severity})` : ""}.` : null);
    }
  };
  const add = async () => {
    if (!f.drug_name.trim()) return;
    setBusy(true);
    let { data: rx } = await supabase.from("prescriptions").select("id").eq("encounter_id", encounterId).eq("status", "active").maybeSingle();
    if (!rx) {
      ({ data: rx } = await supabase.from("prescriptions").insert({ encounter_id: encounterId, prescriber_id: me }).select("id").single());
    }
    await supabase.from("prescription_items").insert({
      prescription_id: rx.id, drug_name: f.drug_name.trim(), dose: f.dose || null, route: f.route,
      frequency: f.frequency || null, duration: f.duration || null,
      quantity: f.quantity ? Number(f.quantity) : null, instructions: f.instructions || null,
    });
    setBusy(false);
    setF({ drug_name: "", dose: "", route: "oral", frequency: "", duration: "", quantity: "", instructions: "" });
    setWarn(null);
    onSaved();
  };
  return (
    <div className="mt-4 rounded-2xl border border-slate-700 p-3 space-y-2">
      {warn && (
        <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-xl px-3 py-2 font-body">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {warn}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Drug (generic name)" value={f.drug_name} onChange={set("drug_name")} />
        <input className={inputCls} placeholder="Dose (e.g. 500 mg)" value={f.dose} onChange={set("dose")} />
        <select className={inputCls} value={f.route} onChange={set("route")}>
          {["oral", "sublingual", "topical", "inhaled", "IM", "IV", "other"].map((r) => <option key={r}>{r}</option>)}
        </select>
        <input className={inputCls} placeholder="Frequency (e.g. every 8 hours)" value={f.frequency} onChange={set("frequency")} />
        <input className={inputCls} placeholder="Duration (e.g. 7 days)" value={f.duration} onChange={set("duration")} />
        <input className={inputCls} placeholder="Quantity" type="number" value={f.quantity} onChange={set("quantity")} />
      </div>
      <input className={inputCls} placeholder="Instructions (e.g. take after meals)" value={f.instructions} onChange={set("instructions")} />
      <button onClick={add} disabled={busy} className={btnPrimary + " flex items-center gap-1.5"}><Plus size={14} /> Add to prescription</button>
    </div>
  );
}

const FDI_TEETH = [
  18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28,
  48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38,
];
const COMMON_DENTAL_PROCEDURES = [
  "Oral prophylaxis (cleaning)", "Composite filling", "Temporary filling",
  "Tooth extraction", "Surgical extraction (impacted)", "Root canal therapy",
  "Dental crown", "Fluoride treatment", "Dental sealant",
  "Orthodontic adjustment", "Denture fitting", "Teeth whitening",
];

function DentalProcForm({ encounterId, me, onSaved }) {
  const [name, setName] = useState("");
  const [tooth, setTooth] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await supabase.from("dental_procedures").insert({
      encounter_id: encounterId,
      procedure_name: name.trim(),
      tooth_number: tooth ? Number(tooth) : null,
      notes: notes || null,
      performed_by: me,
    });
    setBusy(false); setName(""); setTooth(""); setNotes(""); onSaved();
  };
  return (
    <div className="mt-3 rounded-2xl border border-slate-700 p-3 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <input
            className={inputCls} list="dental-procedures"
            placeholder="Procedure (pick or type your own)"
            value={name} onChange={(e) => setName(e.target.value)}
          />
          <datalist id="dental-procedures">
            {COMMON_DENTAL_PROCEDURES.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
        <select className={inputCls} value={tooth} onChange={(e) => setTooth(e.target.value)}>
          <option value="">Tooth (optional / whole mouth)</option>
          {FDI_TEETH.map((n) => <option key={n} value={n}>Tooth {n}</option>)}
        </select>
      </div>
      <input className={inputCls} placeholder="Notes (anesthesia, materials, outcome)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button onClick={add} disabled={busy} className={btnPrimary + " flex items-center gap-1.5"}><Plus size={14} /> Record dental procedure</button>
    </div>
  );
}

function ProcForm({ encounterId, me, onSaved }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await supabase.from("procedures").insert({ encounter_id: encounterId, name: name.trim(), notes: notes || null, performed_by: me });
    setBusy(false); setName(""); setNotes(""); onSaved();
  };
  return (
    <div className="mt-3 rounded-2xl border border-slate-700 p-3 space-y-2">
      <input className={inputCls} placeholder="Procedure (e.g. Wound suturing, 3 stitches)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputCls} placeholder="Notes (technique, anesthesia, outcome)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button onClick={add} disabled={busy} className={btnPrimary + " flex items-center gap-1.5"}><Plus size={14} /> Record procedure</button>
    </div>
  );
}

function CertForm({ encounterId, me, onSaved }) {
  const [f, setF] = useState({ diagnosis: "", remarks: "", rest_days: "0" });
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!f.diagnosis.trim()) return;
    setBusy(true);
    await supabase.from("med_certificates").insert({
      encounter_id: encounterId, issued_by: me, diagnosis: f.diagnosis.trim(),
      remarks: f.remarks || null, rest_days: Number(f.rest_days) || 0,
    });
    setBusy(false); setF({ diagnosis: "", remarks: "", rest_days: "0" }); onSaved();
  };
  return (
    <div className="mt-3 rounded-2xl border border-slate-700 p-3 space-y-2">
      <input className={inputCls} placeholder="Diagnosis (as it should appear on the certificate)" value={f.diagnosis} onChange={(e) => setF((p) => ({ ...p, diagnosis: e.target.value }))} />
      <input className={inputCls} placeholder="Remarks (optional)" value={f.remarks} onChange={(e) => setF((p) => ({ ...p, remarks: e.target.value }))} />
      <div className="flex items-center gap-2">
        <label className="text-xs font-mono2 text-slate-500">REST DAYS</label>
        <input className={inputCls + " w-24"} type="number" min="0" value={f.rest_days} onChange={(e) => setF((p) => ({ ...p, rest_days: e.target.value }))} />
      </div>
      <button onClick={add} disabled={busy} className={btnPrimary + " flex items-center gap-1.5"}><Plus size={14} /> Issue certificate</button>
    </div>
  );
}

/* ----------------------------- module root ------------------------ */

function DoctorPortalInner() {
  const { profile } = useAuth();
  const [encounterId, setEncounterId] = useState(null);
  const me = profile.id;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-6">
        <div className="font-mono2 text-xs text-teal-300 mb-1">DOCTOR PORTAL · {profile.full_name?.toUpperCase()}</div>
        <h2 className="font-display text-3xl font-bold text-slate-50 flex items-center gap-3">
          <Stethoscope size={26} className="text-teal-300" /> {encounterId ? "Consultation" : "Today"}
        </h2>
      </div>
      {encounterId
        ? <Consult encounterId={encounterId} me={me} myName={profile.full_name} onExit={() => setEncounterId(null)} />
        : <Dashboard me={me} onOpenEncounter={setEncounterId} />}
    </div>
  );
}

export default function DoctorPortal() {
  return (
    <StaffGate>
      <DoctorPortalInner />
    </StaffGate>
  );
}
