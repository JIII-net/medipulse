import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, Shield, Search, LogOut, Settings, Receipt,
  ChevronRight, X, Menu as MenuIcon, UserPlus, QrCode,
} from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { StaffGate } from "./lib/StaffGate";
import PatientRecords from "./PatientRecords";
import AppointmentsModule from "./AppointmentsModule";
import DoctorPortal from "./DoctorPortal";
import PracticeSettings from "./PracticeSettings";
import { PaymentProofReview } from "./PaymentProof";
import { useBillingStatus, BillingBanner, BillingLock } from "./SubscriptionBilling";
import BillingModule from "./BillingModule";
import { LogoMark } from "./Logo";
import { StatusMark, FieldLabel, HoldCountdown, Notice, btnSm, btnGhostSm, btnQuiet, inputSm, tintForProfession } from "./ui";
import { PROFESSIONS, professionById } from "./lib/professions";
import { friendlyError, prcLicenseAvailable } from "./lib/errors";

/* ------------------------------------------------------------------ */
/*  StaffApp — the unified clinic application shell                    */
/*  Sidebar · global patient search (Ctrl/⌘+K) · dashboard home        */
/* ------------------------------------------------------------------ */

const todayStr = () => {
  // Use local date parts, not toISOString() (which is always UTC) —
  // otherwise "today" silently rolls back to the wrong calendar day
  // during Philippine early-morning hours (UTC+8 means local
  // midnight-7:59am is still "yesterday" in UTC).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function GlobalSearch({ onOpenPatient }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const search = useCallback((term) => {
    clearTimeout(timer.current);
    if (!term.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const t = term.trim().replace(/[%,()]/g, "");
      const { data } = await supabase
        .from("patients")
        .select("id, mrn, first_name, last_name, birthdate, phone")
        .is("deleted_at", null)
        .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,mrn.ilike.%${t}%,phone.ilike.%${t}%`)
        .limit(6);
      setResults(data || []);
      setOpen(true);
    }, 250);
  }, []);

  return (
    <div className="relative flex-1 max-w-md">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
        onFocus={() => q && setOpen(true)}
        placeholder="Search patients (Ctrl+K)"
        aria-label="Search patients"
        className="w-full rounded-md bg-white border border-slate-700 pl-10 pr-9 py-2 text-sm text-ink font-body placeholder-slate-500 focus:outline-none focus:border-ink focus:ring-2 focus:ring-sky"
      />
      {q && (
        <button onClick={() => { setQ(""); setResults([]); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
          <X size={14} />
        </button>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full rounded-lg border border-slate-700 bg-white shadow-[0_14px_30px_-12px_rgba(19,48,94,0.35)] overflow-hidden z-50">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { onOpenPatient(p.id); setQ(""); setResults([]); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-800/60 transition-colors border-b border-slate-800/60 last:border-0"
            >
              <span className="text-sm text-slate-100 font-body truncate">{p.first_name} {p.last_name}</span>
              <span className="font-mono2 text-xs text-teal-300 shrink-0 ml-3">{p.mrn}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardHome({ go, clinic }) {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ patients: null, appts: null, waiting: null, open: null });
  const [today, setToday] = useState(null); // null = loading
  const [serving, setServing] = useState(null);
  const [tickets, setTickets] = useState({}); // appointment_id -> queue number
  const [toCheck, setToCheck] = useState([]); // receipts waiting for the front desk
  const [awaiting, setAwaiting] = useState([]); // holds still waiting for the patient to pay
  const [reviewing, setReviewing] = useState(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Release lapsed unpaid holds first so every list below is current.
        await supabase.rpc("expire_unpaid_holds");
        const from = todayStr() + "T00:00:00";
        const to = todayStr() + "T23:59:59";
        const [p, a, w, o, list, now, tk] = await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }).is("deleted_at", null),
          supabase.from("appointments").select("id", { count: "exact", head: true }).gte("starts_at", from).lt("starts_at", to).neq("status", "canceled"),
          supabase.from("queue_tickets").select("id", { count: "exact", head: true }).gte("created_at", from).in("status", ["waiting", "called"]),
          supabase.from("encounters").select("id", { count: "exact", head: true }).is("ended_at", null),
          supabase.from("appointments")
            .select("id, starts_at, status, type, mode, payment_status, patient_rec:patient_record_id(first_name, last_name), portal:patient_id(full_name), doctor:doctor_id(profiles(full_name))")
            .gte("starts_at", from).lt("starts_at", to).order("starts_at"),
          supabase.from("queue_tickets")
            .select("id, number, station, status, patient:patient_record_id(first_name, last_name)")
            .gte("created_at", from).in("status", ["called", "serving"]).order("called_at", { ascending: false }).limit(1),
          supabase.from("queue_tickets").select("appointment_id, number").gte("created_at", from).not("appointment_id", "is", null),
        ]);
        // A count whose query failed shows a dash, never a made-up zero.
        const n = (r) => (r.error ? null : r.count ?? 0);
        setStats({ patients: n(p), appts: n(a), waiting: n(w), open: n(o) });
        if (list.error) setError(true);
        setToday(list.error ? [] : list.data || []);
        setServing(now.data?.[0] || null);
        setTickets(Object.fromEntries((tk.data || []).map((t) => [t.appointment_id, t.number])));
        const pay = await supabase.from("appointments")
          .select("id, starts_at, payment_status, payment_due_at, patient_rec:patient_record_id(first_name, last_name), portal:patient_id(full_name)")
          .in("payment_status", ["proof_submitted", "awaiting_payment"]).neq("status", "canceled")
          .order("starts_at");
        setToCheck((pay.data || []).filter((r) => r.payment_status === "proof_submitted"));
        setAwaiting((pay.data || []).filter((r) => r.payment_status === "awaiting_payment"));
      } catch {
        setError(true);
        setToday([]);
      }
    })();
  }, [reload]);

  const counts = [
    { label: "Booked today", value: stats.appts, mod: "appointments" },
    { label: "Waiting in the queue", value: stats.waiting, mod: "appointments" },
    { label: "Open consultations", value: stats.open, mod: "doctor" },
    { label: "Registered patients", value: stats.patients, mod: "patients" },
  ];

  const shortcuts = [
    { label: "Register a patient", desc: "Search first, so nobody gets two records", mod: "patients", icon: UserPlus },
    { label: "Book an appointment", desc: "Day and week calendar, walk-ins too", mod: "appointments", icon: Calendar },
    { label: "Start a consultation", desc: "SOAP notes, e-Rx, med certificates", mod: "doctor", icon: Stethoscope },
    { label: "Take a payment", desc: "Invoices and official receipts", mod: "billing", icon: Receipt },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = (r) => (r.patient_rec ? `${r.patient_rec.first_name} ${r.patient_rec.last_name}` : r.portal?.full_name || "Unnamed patient");
  const time = (iso) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="fade-up">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 mb-6 border-b border-slate-800">
        <div>
          <p className="font-body text-slate-300">
            {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {clinic?.hours && <> · Clinic hours {clinic.hours}</>}
            {clinic?.name && <> · {clinic.name}</>}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mt-1">{greeting}, {profile?.full_name?.split(" ").slice(0, 2).join(" ")}.</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => go("appointments")} className={btnGhostSm}><QrCode size={15} /> Queue and check-in</button>
          <button onClick={() => go("patients")} className={btnSm}><UserPlus size={15} /> Register patient</button>
        </div>
      </header>

      {/* the day in four counts, one ruled strip */}
      <dl className="flex flex-wrap gap-x-8 gap-y-2 pb-5 mb-6 border-b border-slate-800 font-body">
        {counts.map(({ label, value, mod }) => (
          <button key={label} onClick={() => go(mod)} className="group flex items-baseline gap-2 text-left">
            <dd className="queue-no text-3xl text-ink">{value === null ? "–" : value}</dd>
            <dt className="text-sm text-slate-300 group-hover:text-ink group-hover:underline underline-offset-4">{label}</dt>
          </button>
        ))}
      </dl>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* today's board: ranked by time, states stamped in place */}
        <section className="rounded-xl border border-slate-700 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
            <h2 className="font-display text-lg font-bold text-ink">Today's appointments</h2>
            <button onClick={() => go("appointments")} className={btnQuiet}>Open calendar <ChevronRight size={15} /></button>
          </div>
          {error ? (
            <div className="px-5 py-12 text-center font-body">
              <div className="font-display text-xl font-bold text-ink">Couldn't reach 4MED</div>
              <p className="text-slate-300 mt-1.5">Today's appointments didn't load. Check the internet connection, then reload the page.</p>
            </div>
          ) : today === null ? (
            <div className="px-5 py-12 text-center text-slate-400 font-body">Loading today's list…</div>
          ) : today.length === 0 ? (
            <div className="px-5 py-12 text-center font-body">
              <div className="font-display text-xl font-bold text-ink">No appointments today</div>
              <p className="text-slate-300 mt-1.5">Bookings from the patient portal and the front desk show up here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left font-body">
                <thead>
                  <tr className="border-b border-slate-800">
                    {["No.", "Patient", "Payment", "Status"].map((h, i) => (
                      <th key={h} className={"field-label font-semibold px-5 py-2.5 " + (i > 1 ? "text-right" : "")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {today.map((r) => (
                    <tr key={r.id} className={"border-b border-slate-800 last:border-0 " + (r.status === "in_progress" ? "bg-sky/40" : r.status === "canceled" ? "opacity-60" : "")}>
                      <td className="px-5 py-3 w-20"><span className={"queue-no text-[40px] " + (tickets[r.id] ? "text-ink" : "text-slate-700")}>{tickets[r.id] || "–"}</span></td>
                      <td className="px-5 py-3">
                        <div className="text-ink font-semibold">{name(r)}</div>
                        <div className="text-sm text-slate-400"><span className="tnum">{time(r.starts_at)}</span> · {r.type?.replace("_", " ")}{r.mode === "video" ? " · video" : ""}{r.doctor?.profiles?.full_name ? ` · ${r.doctor.profiles.full_name}` : ""}</div>
                      </td>
                      <td className="px-5 py-3 text-right"><StatusMark status={r.payment_status} /></td>
                      <td className="px-5 py-3 text-right"><StatusMark status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          {/* receipts the patient sent; approving one confirms the slot */}
          {(toCheck.length > 0 || awaiting.length > 0) && (
            <section className="rounded-xl border border-amber-500/50 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800 bg-butter/60 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-bold text-ink">Payments to check</h2>
                <span className="text-sm text-slate-200 font-body tnum">{toCheck.length}</span>
              </div>
              <ul>
                {toCheck.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 last:border-0 font-body">
                    <div className="min-w-0">
                      <div className="text-ink font-semibold truncate">{name(r)}</div>
                      <div className="text-sm text-slate-400 tnum">{new Date(r.starts_at).toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                    <button onClick={() => setReviewing(r.id)} className={btnSm + " shrink-0"}>Check receipt</button>
                  </li>
                ))}
                {toCheck.length === 0 && <li className="px-5 py-3 text-sm text-slate-300 font-body">No receipts waiting.</li>}
              </ul>
              {awaiting.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-800">
                  <div className="field-label mb-1.5">Waiting for the patient to pay</div>
                  <ul className="space-y-1.5">
                    {awaiting.map((r) => (
                      <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm font-body">
                        <span className="text-ink truncate">{name(r)}</span>
                        <HoldCountdown dueAt={r.payment_due_at} className="text-slate-300 shrink-0" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          {reviewing && (
            <PaymentProofReview
              appointmentId={reviewing}
              onClose={() => setReviewing(null)}
              onReviewed={() => { setReviewing(null); setReload((n) => n + 1); }}
            />
          )}

          {/* now serving: the stub torn off the current ticket */}
          <section className="rounded-xl border border-ink/20 bg-mint overflow-hidden">
            <div className="px-5 pt-4 pb-5">
              <div className="flex items-center justify-between">
                <FieldLabel>Now serving</FieldLabel>
                {serving && <span className="text-xs font-body text-slate-200">{serving.station}</span>}
              </div>
              {serving ? (
                <>
                  <div className="queue-no text-[96px] text-ink mt-2">{serving.number}</div>
                  <div className="write-in font-body text-ink mt-2">{serving.patient ? `${serving.patient.first_name} ${serving.patient.last_name}` : "Walk-in"}</div>
                </>
              ) : (
                <p className="font-body text-slate-200 mt-3">Nobody has been called yet. Call the next number from the queue.</p>
              )}
            </div>
            <div className="perf" style={{ borderColor: "rgba(19,48,94,0.3)" }} aria-hidden="true" />
            <button onClick={() => go("appointments")} className="w-full flex items-center justify-between px-5 py-3 font-body text-sm font-semibold text-ink hover:bg-white/50 transition-colors">
              Open the queue <ChevronRight size={16} />
            </button>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink mb-2">Shortcuts</h2>
            <ul className="rounded-xl border border-slate-700 bg-white">
              {shortcuts.map(({ label, desc, mod, icon: Icon }) => (
                <li key={label} className="border-b border-slate-800 last:border-0">
                  <button onClick={() => go(mod)} className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-ground transition-colors">
                    <Icon size={18} className="text-ink shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{label}</span>
                      <span className="block text-xs text-slate-400">{desc}</span>
                    </span>
                    <ChevronRight size={16} className="text-slate-600 group-hover:text-ink transition-colors" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* -------------------- finish a half-done doctor signup ------------------- */

// Signup creates the login first and the practitioner record second. If
// the second step fails (most often a PRC license that's already taken),
// the doctor is left with an account that can't save patients. This card
// lets them finish the missing part instead of starting over.
function FinishPracticeSetup({ onDone }) {
  const { profile } = useAuth();
  const [f, setF] = useState({ professionType: "doctor", specialties: [PROFESSIONS[0].defaultSpecialty], license: "", plan: "" });
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.from("plans").select("id, name, monthly_price").order("monthly_price")
      .then(({ data }) => {
        const list = data && data.length ? data : [{ id: "starter", name: "Starter" }, { id: "pro", name: "Pro" }, { id: "clinic", name: "Clinic" }];
        setPlans(list);
        setF((x) => ({ ...x, plan: x.plan || list[0].id }));
      });
  }, []);

  const save = async () => {
    if (!f.license.trim()) { setError("Enter your PRC license number."); return; }
    if (f.specialties.length === 0) { setError("Pick at least one specialty."); return; }
    setBusy(true); setError(null);
    if (!(await prcLicenseAvailable(supabase, f.license))) {
      setBusy(false);
      setError(friendlyError({ message: "doctors_prc_license_key" }));
      return;
    }
    const { error: dErr } = await supabase.from("doctors").insert({
      id: profile.id,
      specialty: f.specialties[0],
      specialties: f.specialties,
      profession_type: f.professionType,
      prc_license: f.license.trim(),
      consult_fee: 0,
      telehealth_enabled: true,
    });
    if (dErr) { setBusy(false); setError(friendlyError(dErr)); return; }
    const { data: sub } = await supabase.from("subscriptions").select("id").eq("doctor_id", profile.id).maybeSingle();
    if (!sub) {
      const { error: sErr } = await supabase.from("subscriptions").insert({ doctor_id: profile.id, plan_id: f.plan, billing_cycle: "monthly", status: "trialing" });
      if (sErr) { setBusy(false); setError(friendlyError(sErr)); return; }
    }
    setBusy(false);
    onDone();
  };

  const prof = professionById(f.professionType);
  return (
    <div className="rounded-xl border border-ink/20 bg-white overflow-hidden">
      <div className={"px-6 py-5 border-b border-ink/15 " + tintForProfession(f.professionType)}>
        <FieldLabel>Practitioner card</FieldLabel>
        <h1 className="font-display text-3xl font-bold text-ink mt-1">Finish setting up your practice</h1>
        <p className="font-body text-slate-200 mt-1.5">Your account was created, but your practitioner details didn't save. Add them here so you can register patients and take bookings.</p>
      </div>
      <div className="px-6 py-6 space-y-5 font-body">
        <div>
          <span className="field-label block mb-2">I am a</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROFESSIONS.map((p) => (
              <button key={p.id} type="button" aria-pressed={f.professionType === p.id}
                onClick={() => setF((x) => ({ ...x, professionType: p.id, specialties: [p.defaultSpecialty] }))}
                className={"px-3 py-2.5 rounded-md border text-left text-sm text-ink " + tintForProfession(p.id) + " " + (f.professionType === p.id ? "border-ink ring-2 ring-ink font-semibold" : "border-ink/15 hover:border-ink/50")}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label block mb-2">Specialties</span>
          <div className="flex flex-wrap gap-2">
            {prof.specialties.map((sp) => {
              const on = f.specialties.includes(sp);
              return (
                <button key={sp} type="button" aria-pressed={on}
                  onClick={() => setF((x) => ({ ...x, specialties: on ? x.specialties.filter((y) => y !== sp) : [...x.specialties, sp] }))}
                  className={"px-3 py-1.5 rounded-md text-sm border " + (on ? "bg-ink text-white border-ink font-medium" : "bg-white text-slate-300 border-slate-700 hover:border-ink")}>
                  {sp}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="field-label block mb-1.5">PRC license number</span>
            <input className={inputSm + " tnum"} value={f.license} onChange={(e) => setF((x) => ({ ...x, license: e.target.value }))} placeholder="7 digits" />
          </label>
          <label className="block">
            <span className="field-label block mb-1.5">Plan</span>
            <select className={inputSm} value={f.plan} onChange={(e) => setF((x) => ({ ...x, plan: e.target.value }))}>
              {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
          </label>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button onClick={save} disabled={busy} className={btnSm}>{busy ? "Saving…" : "Save and open the Clinic App"}</button>
      </div>
    </div>
  );
}

function StaffAppInner({ AdminPortal, onExitToSite }) {
  const { profile, signOut } = useAuth();
  const [mod, setMod] = useState("home");
  const [openPatientId, setOpenPatientId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [professionType, setProfessionType] = useState(null);
  // For a doctor: undefined while checking, false when the account has no
  // practitioner record (a signup that failed half-way), true otherwise.
  const [hasDoctorRow, setHasDoctorRow] = useState(undefined);
  const [setupDone, setSetupDone] = useState(0);
  const billing = useBillingStatus();

  // The rail is the practitioner's card stock: a dentist's clinic app is
  // mint, an ophthalmologist's butter. Secretaries and admins take the
  // default sky until we know whose practice they're in.
  useEffect(() => {
    if (profile?.role !== "doctor") return;
    supabase.from("doctors").select("profession_type").eq("id", profile.id).maybeSingle()
      .then(({ data, error }) => {
        setProfessionType(data?.profession_type || null);
        if (!error) setHasDoctorRow(!!data);
      });
  }, [profile?.id, profile?.role, setupDone]);
  const railTint = tintForProfession(professionType);

  const [clinic, setClinic] = useState(null); // { name, hours }
  // The clinic this app belongs to: a doctor's own, a secretary's
  // assigned doctor's. Name from the first clinic location, hours from
  // today's schedule rule.
  useEffect(() => {
    (async () => {
      try {
        let doctorId = profile?.role === "doctor" ? profile.id : null;
        if (profile?.role === "secretary") {
          const { data } = await supabase.from("staff_assignments").select("doctor_id").eq("secretary_id", profile.id).limit(1);
          doctorId = data?.[0]?.doctor_id || null;
        }
        if (!doctorId) return;
        const [loc, sch] = await Promise.all([
          supabase.from("clinic_locations").select("name").eq("doctor_id", doctorId).limit(1),
          supabase.from("schedules").select("start_time, end_time").eq("resource_type", "doctor").eq("resource_id", doctorId).eq("weekday", new Date().getDay()).limit(1),
        ]);
        const h12 = (t) => { const [hh, mm] = t.slice(0, 5).split(":").map(Number); return `${((hh + 11) % 12) + 1}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${hh >= 12 ? "PM" : "AM"}`; };
        const rule = sch.data?.[0];
        setClinic({ name: loc.data?.[0]?.name || null, hours: rule ? `${h12(rule.start_time)} – ${h12(rule.end_time)}` : null });
      } catch { /* the header simply leaves the clinic out */ }
    })();
  }, [profile?.id, profile?.role]);


  const openPatient = (id) => {
    setOpenPatientId(id);
    setMod("patients");
    setDrawerOpen(false);
  };

  const items = [
    { id: "home", label: "Today", icon: LayoutDashboard },
    { id: "patients", label: "Patients", icon: Users },
    { id: "appointments", label: "Appointments", icon: Calendar },
    { id: "billing", label: "Billing", icon: Receipt },
    ...(profile?.role !== "secretary" ? [{ id: "doctor", label: "Consultations", icon: Stethoscope }] : []),
    ...(profile?.role === "doctor" ? [{ id: "practice", label: "Practice", icon: Settings }] : []),
    ...(profile?.role === "admin" ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
  ];

  const goMod = (id) => {
    setMod(id);
    if (id !== "patients") setOpenPatientId(null);
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  };

  const SidebarContent = () => (
    <>
      <button onClick={onExitToSite} className="flex items-center gap-2.5 px-5 h-16 shrink-0" aria-label="4MED home">
        <LogoMark size={30} />
        <span className="font-display font-extrabold text-xl text-ink">4MED</span>
      </button>
      {clinic?.name && <div className="px-5 -mt-2 mb-3 field-label truncate" title={clinic.name}>{clinic.name}</div>}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto" aria-label="Clinic App">
        {items.map(({ id, label, icon: Icon }) => {
          const on = mod === id;
          return (
            <button
              key={id}
              onClick={() => goMod(id)}
              aria-current={on ? "page" : undefined}
              className={
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[15px] font-body transition-colors " +
                (on ? "bg-white text-ink font-semibold" : "text-slate-200 hover:bg-white/50 hover:text-ink")
              }
            >
              <Icon size={17} /> {label}
            </button>
          );
        })}
      </nav>
      <div className="mx-3 mb-3 pt-3 border-t border-dashed border-ink/40 shrink-0">
        <div className="px-3 py-2">
          <div className="text-sm text-ink font-semibold truncate">{profile?.full_name}</div>
          <div className="text-xs text-slate-200 capitalize">{profile?.role}</div>
        </div>
        <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-body text-slate-200 hover:bg-white/50 hover:text-ink transition-colors">
          <LogOut size={16} /> Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-ground">
      {/* desktop rail — always visible from md up */}
      <aside className={"hidden md:flex w-60 shrink-0 border-r border-ink/15 flex-col sticky top-0 h-screen " + railTint}>
        <SidebarContent />
      </aside>

      {/* mobile drawer — off-canvas, toggled by header hamburger */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <aside className={"relative w-72 h-full border-r border-ink/15 flex flex-col card-deal " + railTint}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-800 bg-ground/95 sticky top-0 z-40 flex items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden w-11 h-11 -ml-2 shrink-0 rounded-md flex items-center justify-center text-ink"
            aria-label="Open menu"
          >
            <MenuIcon size={22} />
          </button>
          <GlobalSearch onOpenPatient={openPatient} />
        </header>
        {!billing.pastDue && <BillingBanner open={billing.open} />}
        <main className="flex-1">
          {billing.pastDue ? (
            <BillingLock pastDue={billing.pastDue} />
          ) : profile?.role === "doctor" && hasDoctorRow === false ? (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
              <FinishPracticeSetup onDone={() => setSetupDone((n) => n + 1)} />
            </div>
          ) : (<>
          {mod === "home" && <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8"><DashboardHome go={goMod} clinic={clinic} /></div>}
          {mod === "patients" && <PatientRecords openPatientId={openPatientId} />}
          {mod === "appointments" && <AppointmentsModule />}
          {mod === "doctor" && <DoctorPortal />}
          {mod === "practice" && <PracticeSettings />}
          {mod === "billing" && <BillingModule />}
          {mod === "admin" && AdminPortal && <AdminPortal />}
          </>)}
        </main>
      </div>
    </div>
  );
}

export default function StaffApp({ AdminPortal, onExitToSite }) {
  return (
    <StaffGate>
      <StaffAppInner AdminPortal={AdminPortal} onExitToSite={onExitToSite} />
    </StaffGate>
  );
}
