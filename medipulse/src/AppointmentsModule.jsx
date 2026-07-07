import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Calendar, Clock, Plus, X, Check, ChevronLeft, ChevronRight, Search,
  Bell, Send, UserPlus, RotateCcw, CalendarPlus, Trash2, AlertCircle, Megaphone, MapPin, QrCode,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { StaffGate } from "./lib/StaffGate";

/* ------------------------------------------------------------------ */
/*  Appointment Management — staff module                              */
/*  Calendar (day/week) · Schedules · Queue & walk-ins · Outbox        */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";
const card = "rounded-3xl border border-slate-800 bg-slate-900 p-5";

const STATIONS = [
  { name: "Triage", prefix: "T" },
  { name: "Consultation", prefix: "C" },
  { name: "Laboratory", prefix: "L" },
  { name: "Imaging", prefix: "I" },
  { name: "Pharmacy", prefix: "P" },
  { name: "Cashier", prefix: "X" },
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const APPT_TYPES = ["consultation", "follow_up", "procedure", "teleconsult"];

const STATUS_STYLE = {
  booked: "bg-teal-400/15 border-teal-400/40 text-teal-200",
  confirmed: "bg-teal-400/15 border-teal-400/40 text-teal-200",
  checked_in: "bg-violet-500/20 border-violet-500/40 text-violet-200",
  in_progress: "bg-amber-500/15 border-amber-500/40 text-amber-200",
  completed: "bg-slate-700/40 border-slate-600 text-slate-400",
  canceled: "bg-rose-500/10 border-rose-500/30 text-rose-300 line-through",
  no_show: "bg-rose-500/10 border-rose-500/30 text-rose-300",
};

/* ------------------------------ helpers --------------------------- */

const todayStr = () => {
  // Use local date parts, not toISOString() (which is always UTC) —
  // otherwise "today" silently rolls back to the wrong calendar day
  // during Philippine early-morning hours (UTC+8 means local
  // midnight-7:59am is still "yesterday" in UTC).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const weekdayOf = (dateStr) => new Date(dateStr + "T12:00:00").getDay();
const toISO = (dateStr, time) => new Date(`${dateStr}T${time}:00`).toISOString();
const localTime = (iso) => {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
const localDate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDay = (dateStr) => new Date(dateStr + "T12:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
const fmt12h = (time) => {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
};
const patientName = (a) =>
  a.patient_rec ? `${a.patient_rec.first_name} ${a.patient_rec.last_name}` : a.portal?.full_name || "Unknown patient";

function slotsFor(doctorId, dateStr, schedules, locationId) {
  const all = schedules.filter((s) => s.resource_type === "doctor" && s.resource_id === doctorId);
  const scoped = locationId ? all.filter((s) => s.location_id === locationId) : [];
  const pool = scoped.length > 0 ? scoped : all.filter((s) => !s.location_id);
  const searchPool = pool.length > 0 ? pool : all;
  const rule = searchPool.find((s) => s.weekday === weekdayOf(dateStr));
  const start = rule?.start_time?.slice(0, 5) || "08:00";
  const end = rule?.end_time?.slice(0, 5) || "17:00";
  const step = rule?.slot_minutes || 30;
  const out = [];
  let [h, m] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  while (h < eh || (h === eh && m < em)) {
    out.push(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
    m += step;
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
  }
  return out;
}

async function queueNotifications(patient, appt, kind) {
  if (!patient) return;
  const when = `${fmtDay(localDate(appt.starts_at))} at ${fmt12h(localTime(appt.starts_at))}`;
  const messages = {
    confirmed: `MediPulse: your ${appt.type.replace("_", " ")} is confirmed for ${when}. Reply CANCEL to cancel.`,
    rescheduled: `MediPulse: your appointment has been moved to ${when}.`,
    canceled: `MediPulse: your appointment on ${when} has been cancelled. Contact the clinic to rebook.`,
  };
  const rows = [];
  if (patient.phone) rows.push({ channel: "sms", recipient: patient.phone, body: messages[kind], related_appointment: appt.id });
  if (patient.email) rows.push({ channel: "email", recipient: patient.email, body: messages[kind], related_appointment: appt.id });
  if (kind === "confirmed" || kind === "rescheduled") {
    const remindAt = new Date(new Date(appt.starts_at).getTime() - 24 * 3600 * 1000).toISOString();
    const reminderBody = `MediPulse reminder: you have a ${appt.type.replace("_", " ")} tomorrow, ${when}.`;
    if (patient.phone) rows.push({ channel: "sms", recipient: patient.phone, body: reminderBody, related_appointment: appt.id, scheduled_at: remindAt });
    else if (patient.email) rows.push({ channel: "email", recipient: patient.email, body: reminderBody, related_appointment: appt.id, scheduled_at: remindAt });
  }
  if (rows.length) await supabase.from("notifications").insert(rows);
}

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-4">
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> {msg}
    </div>
  );
}

/* -------------------------- patient picker ------------------------ */

function PatientPicker({ onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const search = async () => {
    const term = q.trim().replace(/[%,()]/g, "");
    if (!term) return;
    const { data } = await supabase
      .from("patients")
      .select("id, mrn, first_name, last_name, birthdate, phone, email, senior_citizen_id, pwd_id")
      .is("deleted_at", null)
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,mrn.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(6);
    setResults(data || []);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Search patient (name / MRN / phone)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} />
        <button type="button" onClick={search} className={btnGhost}><Search size={15} /></button>
      </div>
      {results.map((r) => (
        <button key={r.id} type="button" onClick={() => onPick(r)} className="w-full text-left text-sm font-body text-slate-200 rounded-xl border border-slate-700 px-3 py-2 hover:border-teal-400 transition-colors">
          {r.first_name} {r.last_name} · <span className="font-mono2 text-xs text-teal-300">{r.mrn}</span>
          {(r.senior_citizen_id || r.pwd_id) && <span className="ml-2 text-xs text-amber-300">priority</span>}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- book modal --------------------------- */

function BookModal({ slot, doctors, schedules, locations = [], onClose, onBooked, presetPatient }) {
  const [patient, setPatient] = useState(presetPatient || null);
  const [doctorId, setDoctorId] = useState(slot?.doctorId || doctors[0]?.id || "");
  const [dateStr, setDateStr] = useState(slot?.dateStr || todayStr());
  const [time, setTime] = useState(slot?.time || "09:00");
  const [type, setType] = useState("consultation");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const slots = slotsFor(doctorId, dateStr, schedules, locationId);
  const doctorLocations = locations.filter((l) => l.doctor_id === doctorId);
  useEffect(() => { setTime((t) => (slotsFor(doctorId, dateStr, schedules, locationId).includes(t) ? t : slotsFor(doctorId, dateStr, schedules, locationId)[0] || t)); }, [locationId]); // eslint-disable-line

  const save = async () => {
    if (!patient) { setError("Pick a patient first."); return; }
    setBusy(true); setError(null);
    const starts_at = toISO(dateStr, time);
    const ends_at = new Date(new Date(starts_at).getTime() + 30 * 60000).toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .insert({ doctor_id: doctorId, patient_record_id: patient.id, starts_at, ends_at, type, source: "staff", mode: type === "teleconsult" ? "video" : "clinic", location_id: locationId || null })
      .select("id, starts_at, type")
      .single();
    setBusy(false);
    if (error) { setError(error.message); return; }
    await queueNotifications(patient, data, "confirmed");
    onBooked();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-slate-50">New appointment</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        {!patient ? (
          <PatientPicker onPick={setPatient} />
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-teal-400/40 bg-teal-400/10 px-4 py-2.5 text-sm font-body text-slate-100 flex justify-between items-center">
              <span>{patient.first_name} {patient.last_name} <span className="font-mono2 text-xs text-teal-300">{patient.mrn}</span></span>
              <button onClick={() => setPatient(null)} className="text-xs text-slate-400 hover:text-slate-200">change</button>
            </div>
            <select className={inputCls} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
              <select className={inputCls} value={time} onChange={(e) => setTime(e.target.value)}>
                {slots.map((s) => <option key={s} value={s}>{fmt12h(s)}</option>)}
              </select>
            </div>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {APPT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            {doctorLocations.length > 0 && (
              <select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Location: unspecified</option>
                {doctorLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <ErrorBanner msg={error} />
            <button onClick={save} disabled={busy} className={btnPrimary + " w-full py-3"}>
              {busy ? "Booking…" : "Book & send confirmation"}
            </button>
            <p className="text-xs text-slate-500 font-body">SMS/email confirmation and a 24-hour reminder are queued automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------- detail modal -------------------------- */

function DetailModal({ appt, doctors, schedules, onClose, onChanged }) {
  const [mode, setMode] = useState("view");   // view | reschedule
  const [dateStr, setDateStr] = useState(localDate(appt.starts_at));
  const [time, setTime] = useState(localTime(appt.starts_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const slots = slotsFor(appt.doctor_id, dateStr, schedules);
  const patient = appt.patient_rec;

  const act = async (fn) => { setBusy(true); setError(null); const err = await fn(); setBusy(false); if (err) setError(err); else { onChanged(); onClose(); } };

  const reschedule = () => act(async () => {
    const starts_at = toISO(dateStr, time);
    const ends_at = new Date(new Date(starts_at).getTime() + 30 * 60000).toISOString();
    const { error } = await supabase.from("appointments").update({ starts_at, ends_at, status: "booked" }).eq("id", appt.id);
    if (error) return error.message;
    await queueNotifications(patient, { ...appt, starts_at }, "rescheduled");
  });

  const cancel = () => act(async () => {
    const { error } = await supabase.from("appointments").update({ status: "canceled" }).eq("id", appt.id);
    if (error) return error.message;
    await queueNotifications(patient, appt, "canceled");
  });

  const checkIn = () => act(async () => {
    const { data: number, error: numErr } = await supabase.rpc("issue_queue_number", { p_station: "Triage", p_prefix: "T" });
    if (numErr) return numErr.message;
    const priority = patient?.senior_citizen_id || patient?.pwd_id ? "senior_pwd" : "regular";
    const { error } = await supabase.from("queue_tickets").insert({
      appointment_id: appt.id, patient_record_id: patient?.id || null, station: "Triage", number, priority,
    });
    if (error) return error.message;
    await supabase.from("appointments").update({ status: "checked_in" }).eq("id", appt.id);
  });

  const followUp = (weeks) => act(async () => {
    const starts = new Date(appt.starts_at); starts.setDate(starts.getDate() + weeks * 7);
    const ends = new Date(starts.getTime() + 30 * 60000);
    const { data, error } = await supabase.from("appointments")
      .insert({ doctor_id: appt.doctor_id, patient_record_id: patient?.id, patient_id: appt.patient_id, starts_at: starts.toISOString(), ends_at: ends.toISOString(), type: "follow_up", source: "staff", mode: "clinic" })
      .select("id, starts_at, type").single();
    if (error) return error.message;
    await queueNotifications(patient, data, "confirmed");
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-bold text-slate-50">{patientName(appt)}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <div className="font-mono2 text-xs text-teal-300 mb-1">
          {fmtDay(localDate(appt.starts_at))} · {fmt12h(localTime(appt.starts_at))} · {appt.type.replace("_", " ")} · {appt.status}
        </div>
        {appt.location && (
          <div className="text-xs text-slate-400 font-body mb-4 flex items-center gap-1.5">
            <MapPin size={12} className="text-teal-300 shrink-0" /> {appt.location.name}{appt.location.address ? ` — ${appt.location.address}` : ""}
          </div>
        )}
        {!appt.location && <div className="mb-4" />}
        <ErrorBanner msg={error} />
        {mode === "view" ? (
          <div className="space-y-2">
            {["booked", "confirmed"].includes(appt.status) && (
              <button onClick={checkIn} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>
                <Check size={15} /> Check in → issue queue number
              </button>
            )}
            <button onClick={() => setMode("reschedule")} disabled={busy} className={btnGhost + " w-full flex items-center justify-center gap-2"}>
              <RotateCcw size={15} /> Reschedule
            </button>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 4].map((w) => (
                <button key={w} onClick={() => followUp(w)} disabled={busy} className={btnGhost + " flex items-center justify-center gap-1.5"}>
                  <CalendarPlus size={14} /> +{w}w
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-slate-500 font-body">Schedule a follow-up 1, 2, or 4 weeks out at the same time</p>
            {appt.status !== "canceled" && (
              <button onClick={cancel} disabled={busy} className="w-full py-2 rounded-xl border border-rose-500/40 text-rose-300 text-sm font-body hover:bg-rose-500/10 transition-colors">
                Cancel appointment
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
              <select className={inputCls} value={time} onChange={(e) => setTime(e.target.value)}>
                {slots.map((s) => <option key={s} value={s}>{fmt12h(s)}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMode("view")} className={btnGhost + " flex-1"}>Back</button>
              <button onClick={reschedule} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Moving…" : "Confirm new time"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- calendar ---------------------------- */

function CalendarTab({ doctors, schedules, locations }) {
  const [view, setView] = useState("day");             // day | week
  const [dateStr, setDateStr] = useState(todayStr());
  const [weekDoctor, setWeekDoctor] = useState("");
  const [appts, setAppts] = useState([]);
  const [booking, setBooking] = useState(null);        // {doctorId, dateStr, time} | {}
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!weekDoctor && doctors.length) setWeekDoctor(doctors[0].id); }, [doctors, weekDoctor]);

  const rangeStart = view === "day" ? dateStr : addDays(dateStr, -weekdayOf(dateStr));
  const rangeDays = view === "day" ? 1 : 7;

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(rangeStart + "T00:00:00").toISOString();
    const to = new Date(addDays(rangeStart, rangeDays) + "T00:00:00").toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .select("id, doctor_id, starts_at, status, type, patient_id, location_id, location:location_id(name, address), patient_rec:patient_record_id(id, first_name, last_name, phone, email, senior_citizen_id, pwd_id), portal:patient_id(full_name)")
      .gte("starts_at", from).lt("starts_at", to);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setAppts(data || []);
  }, [rangeStart, rangeDays]);

  useEffect(() => { load(); }, [load]);

  const dayColumns = view === "day"
    ? doctors.map((d) => ({ key: d.id, label: d.name, sub: d.specialty, dateStr, doctorId: d.id }))
    : Array.from({ length: 7 }, (_, i) => {
        const ds = addDays(rangeStart, i);
        return { key: ds, label: fmtDay(ds), sub: ds === todayStr() ? "today" : "", dateStr: ds, doctorId: weekDoctor };
      });

  const allSlots = useMemo(() => {
    const set = new Set();
    dayColumns.forEach((c) => slotsFor(c.doctorId, c.dateStr, schedules).forEach((s) => set.add(s)));
    return [...set].sort();
  }, [dayColumns, schedules]);

  const apptAt = (col, time) =>
    appts.find((a) => a.doctor_id === col.doctorId && localDate(a.starts_at) === col.dateStr && localTime(a.starts_at) === time);

  const available = (col, time) => slotsFor(col.doctorId, col.dateStr, schedules).includes(time);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1 text-sm">
          {["day", "week"].map((v) => (
            <button key={v} onClick={() => setView(v)} className={"px-3.5 py-1.5 rounded-xl font-body capitalize transition-colors " + (view === v ? "bg-teal-400 text-slate-950 font-medium" : "text-slate-400 hover:text-slate-100")}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setDateStr(addDays(dateStr, view === "day" ? -1 : -7))} className={btnGhost + " px-2.5"}><ChevronLeft size={15} /></button>
          <input className={inputCls + " w-40"} type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          <button onClick={() => setDateStr(addDays(dateStr, view === "day" ? 1 : 7))} className={btnGhost + " px-2.5"}><ChevronRight size={15} /></button>
          <button onClick={() => setDateStr(todayStr())} className={btnGhost}>Today</button>
        </div>
        {view === "week" && (
          <select className={inputCls + " w-56"} value={weekDoctor} onChange={(e) => setWeekDoctor(e.target.value)}>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <button onClick={() => setBooking({})} className={btnPrimary + " flex items-center gap-1.5"}><Plus size={15} /> New appointment</button>
      </div>

      <ErrorBanner msg={error} />

      {doctors.length === 0 ? (
        <div className={card + " text-center py-14 text-slate-500 font-body text-sm"}>No doctors registered yet — doctors appear here once they sign up.</div>
      ) : loading ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 space-y-3 animate-pulse">
          <div className="h-6 bg-slate-800 rounded-lg w-1/3" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 bg-slate-800/60 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
        <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-x-auto">
          <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${dayColumns.length}, minmax(140px, 1fr))`, minWidth: dayColumns.length * 150 + 72 }}>
            <div className="border-b border-slate-800 px-3 py-3" />
            {dayColumns.map((c) => (
              <div key={c.key} className="border-b border-l border-slate-800 px-3 py-3">
                <div className="font-body text-sm text-slate-100 truncate">{c.label}</div>
                <div className="font-mono2 text-xs text-slate-500 truncate">{c.sub}</div>
              </div>
            ))}
            {allSlots.map((time) => (
              <React.Fragment key={time}>
                <div className="border-b border-slate-800/60 px-3 py-2 font-mono2 text-xs text-slate-500">{fmt12h(time)}</div>
                {dayColumns.map((c) => {
                  const a = apptAt(c, time);
                  const open = available(c, time);
                  return (
                    <div key={c.key + time} className="border-b border-l border-slate-800/60 p-1 min-h-11">
                      {a ? (
                        <button onClick={() => setDetail(a)} className={"w-full text-left rounded-lg border px-2 py-1 text-xs font-body truncate " + (STATUS_STYLE[a.status] || STATUS_STYLE.booked)}>
                          {patientName(a)}
                          <span className="block opacity-70 truncate">{a.type.replace("_", " ")}{a.location ? ` · ${a.location.name}` : ""}</span>
                        </button>
                      ) : open ? (
                        <button onClick={() => setBooking({ doctorId: c.doctorId, dateStr: c.dateStr, time })} className="w-full h-full min-h-9 rounded-lg text-slate-700 hover:bg-slate-800/60 hover:text-teal-300 text-xs transition-colors">
                          +
                        </button>
                      ) : (
                        <div className="w-full h-full min-h-9 rounded-lg bg-slate-950/40" />
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="sm:hidden text-center text-xs text-slate-600 font-body mt-2">← scroll to see all doctors →</div>
        </>
      )}

      {booking && <BookModal slot={booking} doctors={doctors} schedules={schedules} locations={locations} onClose={() => setBooking(null)} onBooked={() => { setBooking(null); load(); }} />}
      {detail && <DetailModal appt={detail} doctors={doctors} schedules={schedules} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  );
}

/* --------------------------- schedules tab ------------------------ */

function SchedulesTab({ doctors, schedules, locations = [], reload }) {
  const [doctorId, setDoctorId] = useState("");
  const [f, setF] = useState({ weekday: "1", start_time: "08:00", end_time: "17:00", slot_minutes: "30", location_id: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!doctorId && doctors.length) setDoctorId(doctors[0].id); }, [doctors, doctorId]);

  const rules = schedules.filter((s) => s.resource_type === "doctor" && s.resource_id === doctorId).sort((a, b) => a.weekday - b.weekday);

  const add = async () => {
    setBusy(true);
    await supabase.from("schedules").insert({
      resource_type: "doctor", resource_id: doctorId,
      weekday: Number(f.weekday), start_time: f.start_time, end_time: f.end_time, slot_minutes: Number(f.slot_minutes),
      location_id: f.location_id || null,
    });
    setBusy(false);
    reload();
  };
  const remove = async (id) => { await supabase.from("schedules").delete().eq("id", id); reload(); };

  return (
    <div className="max-w-2xl">
      <div className={card}>
        <div className="font-display font-semibold text-slate-100 mb-1">Doctor schedule management</div>
        <p className="text-xs text-slate-500 font-body mb-4">Weekly availability rules control which slots are bookable in the calendar and the patient portal. Days with no rule fall back to 8:00 AM – 5:00 PM, 30-minute slots.</p>
        <select className={inputCls + " mb-4"} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}
        </select>
        {rules.length === 0 && <div className="text-sm text-slate-500 font-body mb-3">No custom rules — using the default schedule every day.</div>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
            <span className="text-slate-200">
              {WEEKDAYS[r.weekday]} · {fmt12h(r.start_time.slice(0, 5))} – {fmt12h(r.end_time.slice(0, 5))} · {r.slot_minutes} min slots
              {r.location_id && <span className="text-teal-300 text-xs"> · {locations.find((l) => l.id === r.location_id)?.name || "location"}</span>}
            </span>
            <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-300"><Trash2 size={15} /></button>
          </div>
        ))}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <select className={inputCls} value={f.weekday} onChange={(e) => setF((p) => ({ ...p, weekday: e.target.value }))}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
          </select>
          <input className={inputCls} type="time" value={f.start_time} onChange={(e) => setF((p) => ({ ...p, start_time: e.target.value }))} />
          <input className={inputCls} type="time" value={f.end_time} onChange={(e) => setF((p) => ({ ...p, end_time: e.target.value }))} />
          <select className={inputCls} value={f.slot_minutes} onChange={(e) => setF((p) => ({ ...p, slot_minutes: e.target.value }))}>
            {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
        {locations.filter((l) => l.doctor_id === doctorId).length > 0 && (
          <select className={inputCls + " mt-2"} value={f.location_id} onChange={(e) => setF((p) => ({ ...p, location_id: e.target.value }))}>
            <option value="">Location: any / unspecified</option>
            {locations.filter((l) => l.doctor_id === doctorId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <button onClick={add} disabled={busy || !doctorId} className={btnPrimary + " mt-3 flex items-center gap-1.5"}><Plus size={15} /> Add rule</button>
      </div>
    </div>
  );
}

/* ----------------------------- queue tab -------------------------- */

function QueueTab() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [walkIn, setWalkIn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [myDoctorIds, setMyDoctorIds] = useState([]);
  const [station, setStation] = useState("Triage");
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("queue_tickets")
      .select("id, number, station, priority, status, created_at, patient:patient_record_id(first_name, last_name)")
      .gte("created_at", todayStr() + "T00:00:00")
      .order("created_at");
    if (error) { setError(error.message); return; }
    setTickets(data || []);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      if (profile?.role === "doctor") { setMyDoctorIds([profile.id]); return; }
      if (profile?.role === "secretary") {
        const { data } = await supabase.from("staff_assignments").select("doctor_id").eq("secretary_id", profile.id);
        setMyDoctorIds((data || []).map((d) => d.doctor_id));
      }
    })();
  }, [profile]);

  const advance = async (t, status) => {
    const patch = { status };
    if (status === "called") patch.called_at = new Date().toISOString();
    if (status === "serving") patch.served_at = new Date().toISOString();
    await supabase.from("queue_tickets").update(patch).eq("id", t.id);
    load();
  };

  const createWalkIn = async (patient) => {
    const st = STATIONS.find((s) => s.name === station);
    const { data: number, error: numErr } = await supabase.rpc("issue_queue_number", { p_station: station, p_prefix: st.prefix });
    if (numErr) { setError(numErr.message); return; }
    const priority = patient.senior_citizen_id || patient.pwd_id ? "senior_pwd" : "regular";
    const { error } = await supabase.from("queue_tickets").insert({
      patient_record_id: patient.id, station, number, priority,
    });
    if (error) { setError(error.message); return; }
    setWalkIn(false);
    load();
  };

  const prColor = { emergency: "text-rose-300", senior_pwd: "text-amber-300", regular: "text-slate-400" };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="font-mono2 text-xs text-slate-500 flex items-center gap-2"><Megaphone size={13} className="text-teal-400" /> Today's queue · sorted by priority then arrival</div>
        <div className="flex-1" />
        <button onClick={() => setScanning(true)} className={btnGhost + " flex items-center gap-1.5"}><QrCode size={15} /> Scan ID card</button>
        <button onClick={() => setWalkIn(true)} className={btnPrimary + " flex items-center gap-1.5"}><UserPlus size={15} /> Walk-in registration</button>
      </div>
      <ErrorBanner msg={error} />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {STATIONS.map((st) => {
          const list = tickets
            .filter((t) => t.station === st.name && !["done", "skipped"].includes(t.status))
            .sort((a, b) => (a.priority === "emergency" ? -1 : b.priority === "emergency" ? 1 : a.priority === "senior_pwd" && b.priority === "regular" ? -1 : b.priority === "senior_pwd" && a.priority === "regular" ? 1 : 0));
          const nowServing = list.find((t) => ["called", "serving"].includes(t.status));
          return (
            <div key={st.name} className={card}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-display font-semibold text-slate-100">{st.name}</div>
                <div className="font-mono2 text-xs text-slate-500">{list.length} waiting</div>
              </div>
              {nowServing && (
                <div className="rounded-2xl bg-teal-400/10 border border-teal-400/40 px-4 py-3 mb-3">
                  <div className="font-mono2 text-2xl font-bold text-teal-300">{nowServing.number}</div>
                  <div className="text-xs font-body text-slate-300">{nowServing.patient ? `${nowServing.patient.first_name} ${nowServing.patient.last_name}` : ""} · {nowServing.status}</div>
                  <div className="flex gap-2 mt-2">
                    {nowServing.status === "called" && <button onClick={() => advance(nowServing, "serving")} className={btnGhost + " py-1 px-3 text-xs"}>Serving</button>}
                    <button onClick={() => advance(nowServing, "done")} className={btnPrimary + " py-1 px-3 text-xs"}>Done</button>
                    <button onClick={() => advance(nowServing, "skipped")} className={btnGhost + " py-1 px-3 text-xs"}>Skip</button>
                  </div>
                </div>
              )}
              {list.filter((t) => t.status === "waiting").slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
                  <span className="font-mono2 text-slate-200">{t.number}</span>
                  <span className={"text-xs " + prColor[t.priority]}>{t.priority.replace("_", "/")}</span>
                  {!nowServing && <button onClick={() => advance(t, "called")} className="text-xs text-teal-300 hover:underline">Call</button>}
                </div>
              ))}
              {list.length === 0 && <div className="text-sm text-slate-600 font-body">Queue clear.</div>}
            </div>
          );
        })}
      </div>

      {walkIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={() => setWalkIn(false)}>
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-slate-50">Walk-in registration</h3>
              <button onClick={() => setWalkIn(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <select className={inputCls + " mb-3"} value={station} onChange={(e) => setStation(e.target.value)}>
              {STATIONS.map((s) => <option key={s.name}>{s.name}</option>)}
            </select>
            <PatientPicker onPick={createWalkIn} />
            <p className="text-xs text-slate-500 font-body mt-3">Picking a patient issues the next queue number instantly. Seniors and PWDs are auto-prioritized. New patient? Register them in Records first.</p>
          </div>
        </div>
      )}

      {scanning && (
        <QRCheckinModal
          station={station}
          myDoctorIds={myDoctorIds}
          onClose={() => setScanning(false)}
          onDone={() => { setScanning(false); load(); }}
        />
      )}
    </div>
  );
}

/* --------------------------- QR check-in scanner --------------------- */

function QRCheckinModal({ station: initialStation, myDoctorIds, onClose, onDone }) {
  const [station, setStation] = useState(initialStation);
  const [doctorId, setDoctorId] = useState(myDoctorIds[0] || "");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const scannerRef = useRef(null);
  const elId = "qr-checkin-reader";

  useEffect(() => {
    const scanner = new Html5Qrcode(elId);
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 220 },
      (decodedText) => handleScan(decodedText),
      () => {} // ignore per-frame "no QR found" noise
    ).catch((e) => setError("Couldn't access the camera: " + e.message + " — check browser camera permissions."));

    return () => {
      scanner.stop().catch(() => {}).finally(() => scanner.clear());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async (decodedText) => {
    if (busy || result) return; // ignore repeat frames while processing / after success
    let payload;
    try { payload = JSON.parse(decodedText); } catch { setError("That QR code isn't a MediPulse patient ID card."); return; }
    if (!payload?.mrn || !payload?.t) { setError("That QR code isn't a MediPulse patient ID card."); return; }
    if (!doctorId) { setError("No doctor selected to check this patient in under — pick one below."); return; }

    setBusy(true); setError(null);
    const st = STATIONS.find((s) => s.name === station);
    const { data, error: rpcErr } = await supabase.rpc("checkin_patient_by_qr", {
      p_mrn: payload.mrn, p_qr_token: payload.t, p_doctor_id: doctorId,
      p_station: station, p_prefix: st.prefix,
    });
    setBusy(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setResult(row);
    await scannerRef.current?.stop().catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-slate-50 flex items-center gap-2"><QrCode size={18} className="text-teal-300" /> Scan patient ID card</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>

        {result ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-400/15 border border-teal-400/40 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-teal-300" />
            </div>
            <div className="font-display text-lg font-bold text-slate-50">{result.first_name} {result.last_name}</div>
            <div className="font-mono2 text-2xl font-bold text-teal-300 mt-2">{result.ticket_number}</div>
            <div className="text-xs text-slate-500 font-body mt-1">Checked in at {station}</div>
            <button onClick={onDone} className={btnPrimary + " mt-5"}>Done</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <select className={inputCls} value={station} onChange={(e) => setStation(e.target.value)}>
                {STATIONS.map((s) => <option key={s.name}>{s.name}</option>)}
              </select>
              {myDoctorIds.length > 1 ? (
                <select className={inputCls} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  {myDoctorIds.map((id) => <option key={id} value={id}>{id.slice(0, 8)}…</option>)}
                </select>
              ) : (
                <div className="flex items-center text-xs text-slate-500 font-body">Doctor: (your assigned doctor)</div>
              )}
            </div>
            <div id={elId} className="rounded-2xl overflow-hidden border border-slate-700" />
            <p className="text-xs text-slate-500 font-body mt-3">Point the camera at the QR code on the patient's ID card. Checking in issues a queue number automatically.</p>
            {error && (
              <div className="mt-3 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}
            {busy && <div className="text-xs text-slate-500 font-body mt-2">Checking in…</div>}
          </>
        )}
      </div>
    </div>
  );
}

function OutboxTab() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const load = async () => {
    const { data } = await supabase.from("notifications")
      .select("id, channel, recipient, body, status, scheduled_at, sent_at, error")
      .order("created_at", { ascending: false }).limit(50);
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const processDue = async () => {
    setBusy(true);
    setSendError(null);
    const { data, error } = await supabase.functions.invoke("send-notifications", { body: {} });
    setBusy(false);
    if (error) {
      setSendError("Couldn't reach the notification worker — has send-notifications been deployed? (" + error.message + ")");
      return;
    }
    setLastResult(data);
    load();
  };

  const stStyle = { pending: "text-amber-300 border-amber-500/40 bg-amber-500/10", sent: "text-teal-300 border-teal-400/40 bg-teal-400/10", failed: "text-rose-300 border-rose-500/40 bg-rose-500/10" };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500 font-body max-w-lg">
          Confirmations and reminders queue here, then deliver via a scheduled worker (Supabase Edge Function on pg_cron) using Semaphore for SMS and Resend for email — runs automatically every 2 minutes once deployed. This button triggers it manually, useful for testing.
        </p>
        <button onClick={processDue} disabled={busy} className={btnPrimary + " flex items-center gap-1.5 shrink-0"}><Send size={14} /> {busy ? "Sending…" : "Send due now"}</button>
      </div>
      {sendError && (
        <div className="mb-4 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {sendError}
        </div>
      )}
      {lastResult && (
        <div className="mb-4 text-xs font-mono2 text-slate-500">
          Last run: {lastResult.processed} processed · {lastResult.sent} sent · {lastResult.failed} failed
        </div>
      )}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
        {rows.length === 0 && <div className="px-5 py-10 text-center text-slate-500 font-body text-sm">No notifications yet — book an appointment to see confirmations queue here.</div>}
        {rows.map((n) => (
          <div key={n.id} className="px-5 py-3.5 border-b border-slate-800/60 last:border-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-mono2 text-xs text-slate-400">{n.channel.toUpperCase()} → {n.recipient}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono2 text-xs text-slate-600">{new Date(n.scheduled_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className={"px-2 py-0.5 rounded-full border text-xs " + stStyle[n.status]}>{n.status}</span>
              </div>
            </div>
            <div className="text-sm text-slate-300 font-body">{n.body}</div>
            {n.status === "failed" && n.error && <div className="text-xs text-rose-300 font-mono2 mt-1">{n.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- module root ------------------------ */

export default function AppointmentsModule() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("calendar");
  const [doctors, setDoctors] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [locations, setLocations] = useState([]);

  const loadBase = async () => {
    // The calendar's doctor columns must respect the same multi-tenant
    // boundary as the appointment data itself — a doctor should only
    // ever see their own column, a secretary only their assigned
    // doctor(s), and admin sees everyone (platform oversight).
    let doctorsQuery;
    if (profile.role === "doctor") {
      doctorsQuery = supabase.from("doctors").select("id, specialty, profiles(full_name)").eq("id", profile.id);
    } else if (profile.role === "secretary") {
      doctorsQuery = supabase.from("staff_assignments")
        .select("doctor:doctor_id(id, specialty, profiles(full_name))")
        .eq("secretary_id", profile.id);
    } else {
      doctorsQuery = supabase.from("doctors").select("id, specialty, profiles(full_name)"); // admin: all
    }

    const [dr, sc, lc] = await Promise.all([
      doctorsQuery,
      supabase.from("schedules").select("*"),
      supabase.from("clinic_locations").select("id, doctor_id, name"),
    ]);
    const rawDoctors = profile.role === "secretary" ? (dr.data || []).map((r) => r.doctor).filter(Boolean) : (dr.data || []);
    setDoctors(rawDoctors.map((d) => ({ id: d.id, specialty: d.specialty, name: d.profiles?.full_name || "Unnamed doctor" })));
    setSchedules(sc.data || []);
    setLocations(lc.data || []);
  };
  useEffect(() => { if (profile) loadBase(); /* eslint-disable-next-line */ }, [profile]);

  return (
    <StaffGate>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-6">
          <div className="font-mono2 text-xs text-teal-300 mb-1">STAFF · APPOINTMENT MANAGEMENT</div>
          <h2 className="font-display text-3xl font-bold text-slate-50">Appointments</h2>
        </div>
        <div className="flex gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1 text-sm w-fit mb-6">
          {[["calendar", "Calendar"], ["schedules", "Schedules"], ["queue", "Queue"], ["outbox", "Outbox"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={"px-3.5 py-1.5 rounded-xl font-body transition-colors " + (tab === id ? "bg-teal-400 text-slate-950 font-medium" : "text-slate-400 hover:text-slate-100")}>
              {label}
            </button>
          ))}
        </div>
        {tab === "calendar" && <CalendarTab doctors={doctors} schedules={schedules} locations={locations} />}
        {tab === "schedules" && <SchedulesTab doctors={doctors} schedules={schedules} locations={locations} reload={loadBase} />}
        {tab === "queue" && <QueueTab />}
        {tab === "outbox" && <OutboxTab />}
      </div>
    </StaffGate>
  );
}
