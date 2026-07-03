import React, { useState, useMemo, useEffect } from "react";
import {
  Stethoscope, Calendar, Search, Star, Check, ChevronRight, ChevronLeft,
  Shield, Activity, Users, Video, Bell, X, Clock, Zap, Building2, Lock, LogOut, AlertCircle,
} from "lucide-react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import PatientRecords from "./PatientRecords";
import AppointmentsModule from "./AppointmentsModule";
import DoctorPortal from "./DoctorPortal";

/* ------------------------------------------------------------------ */
/*  MediPulse — Patient Management SaaS prototype                      */
/*  Views: Landing → Doctor onboarding (with plan setup) → Patient     */
/* ------------------------------------------------------------------ */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
.font-display { font-family: 'Space Grotesk', sans-serif; }
.font-body { font-family: 'IBM Plex Sans', sans-serif; }
.font-mono2 { font-family: 'IBM Plex Mono', monospace; }
@keyframes pulseDash { to { stroke-dashoffset: -560; } }
.ecg-line { stroke-dasharray: 280 280; animation: pulseDash 3.2s linear infinite; }
@media (prefers-reduced-motion: reduce) { .ecg-line { animation: none; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.fade-up { animation: fadeUp .45s ease both; }
`;

/* ---------------------------- data ------------------------------- */

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    icon: Stethoscope,
    monthly: 1499,
    tagline: "Solo practice essentials",
    features: ["1 doctor seat", "Up to 200 active patients", "Smart scheduling & queue", "Patient records (EMR-lite)", "Email reminders"],
  },
  {
    id: "pro",
    name: "Pro",
    icon: Zap,
    monthly: 3499,
    tagline: "Grow with telehealth",
    popular: true,
    features: ["Everything in Starter", "Unlimited patients", "Telehealth video visits", "SMS reminders (PH networks)", "e-Prescriptions", "No-show analytics"],
  },
  {
    id: "clinic",
    name: "Clinic",
    icon: Building2,
    monthly: 7999,
    tagline: "Multi-doctor clinics",
    features: ["Up to 10 doctor seats", "Staff & front-desk accounts", "Clinic-wide analytics", "Custom branding", "API access", "Priority support"],
  },
];

const SPECIALTIES = ["All", "Cardiology", "Pediatrics", "Dermatology", "Internal Medicine", "OB-GYN", "Neurology"];

const DOCTORS = [
  { id: 1, name: "Dr. Maria Santos", specialty: "Cardiology", rating: 4.9, reviews: 212, fee: 900, online: true, telehealth: true, nextSlot: "Today, 3:30 PM", hospital: "St. Luke's Medical Center", exp: 14 },
  { id: 2, name: "Dr. Jose Ramirez", specialty: "Pediatrics", rating: 4.8, reviews: 187, fee: 700, online: true, telehealth: true, nextSlot: "Today, 4:00 PM", hospital: "Makati Medical Center", exp: 9 },
  { id: 3, name: "Dr. Amara Villanueva", specialty: "Dermatology", rating: 4.9, reviews: 305, fee: 1200, online: false, telehealth: true, nextSlot: "Tomorrow, 10:00 AM", hospital: "The Medical City", exp: 11 },
  { id: 4, name: "Dr. Kenji Tan", specialty: "Internal Medicine", rating: 4.7, reviews: 143, fee: 650, online: true, telehealth: false, nextSlot: "Today, 5:15 PM", hospital: "Cardinal Santos", exp: 7 },
  { id: 5, name: "Dr. Lea Bautista", specialty: "OB-GYN", rating: 4.9, reviews: 268, fee: 1000, online: true, telehealth: true, nextSlot: "Tomorrow, 9:00 AM", hospital: "Asian Hospital", exp: 16 },
  { id: 6, name: "Dr. Rafael Cruz", specialty: "Neurology", rating: 4.8, reviews: 99, fee: 1500, online: false, telehealth: true, nextSlot: "Fri, 1:00 PM", hospital: "St. Luke's Medical Center", exp: 12 },
];

const SLOTS = ["9:00 AM", "9:30 AM", "10:30 AM", "1:00 PM", "3:30 PM", "4:15 PM"];

const peso = (n) => "₱" + n.toLocaleString();

/* ------------------------- shared bits ---------------------------- */

function EcgPulse({ className = "" }) {
  return (
    <svg viewBox="0 0 280 40" className={className} fill="none" aria-hidden="true">
      <path
        className="ecg-line"
        d="M0 20 H70 L82 20 L90 6 L100 34 L108 20 H150 L162 20 L170 10 L178 30 L186 20 H280"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function Avatar({ name, online }) {
  const initials = name.replace("Dr. ", "").split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <div className="relative">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center font-display font-semibold text-slate-950">
        {initials}
      </div>
      <span
        className={"absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 " + (online ? "bg-teal-400" : "bg-slate-500")}
        title={online ? "Available now" : "Offline"}
      />
    </div>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3.5 py-1.5 rounded-full text-sm font-body transition-colors border " +
        (active
          ? "bg-teal-400 text-slate-950 border-teal-400 font-medium"
          : "bg-slate-900 text-slate-300 border-slate-700 hover:border-teal-500/60")
      }
    >
      {children}
    </button>
  );
}

/* --------------------------- pricing ------------------------------ */

function PricingCards({ annual, selected, onSelect, compact }) {
  return (
    <div className="grid md:grid-cols-3 gap-5">
      {PLANS.map((p) => {
        const Icon = p.icon;
        const price = annual ? Math.round(p.monthly * 0.8) : p.monthly;
        const isSel = selected === p.id;
        return (
          <button
            key={p.id}
            onClick={onSelect ? () => onSelect(p.id) : undefined}
            className={
              "relative text-left rounded-3xl p-6 border transition-all " +
              (isSel
                ? "border-teal-400 bg-teal-400/10 shadow-lg shadow-teal-500/10"
                : p.popular
                ? "border-violet-500/50 bg-slate-900"
                : "border-slate-800 bg-slate-900 hover:border-slate-600") +
              (onSelect ? " cursor-pointer" : " cursor-default")
            }
          >
            {p.popular && (
              <span className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-violet-500 text-xs font-body font-medium text-white">
                Most popular
              </span>
            )}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                <Icon size={18} className={isSel ? "text-teal-300" : "text-slate-300"} />
              </div>
              <div>
                <div className="font-display font-semibold text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-400 font-body">{p.tagline}</div>
              </div>
            </div>
            <div className="mb-4">
              <span className="font-display text-3xl font-bold text-slate-50">{peso(price)}</span>
              <span className="text-slate-400 text-sm font-body"> /mo</span>
              {annual && <span className="ml-2 text-xs text-teal-300 font-mono2">billed yearly</span>}
            </div>
            <ul className="space-y-2">
              {(compact ? p.features.slice(0, 4) : p.features).map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-300 font-body">
                  <Check size={15} className="text-teal-400 mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {isSel && (
              <div className="mt-4 text-sm font-medium text-teal-300 font-body flex items-center gap-1.5">
                <Check size={16} /> Selected
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------- landing ------------------------------ */

function Landing({ go }) {
  const [annual, setAnnual] = useState(true);
  return (
    <div className="fade-up">
      {/* hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-700 bg-slate-900 text-xs font-mono2 text-teal-300 mb-8">
          <Shield size={13} /> DPA 2012 &amp; HIPAA-ready · Encrypted end to end
        </div>
        <h1 className="font-display text-4xl md:text-6xl font-bold text-slate-50 leading-tight tracking-tight">
          Your practice,
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-cyan-400"> on autopilot.</span>
        </h1>
        <p className="font-body text-slate-400 max-w-2xl mx-auto mt-5 text-lg">
          MediPulse connects doctors and patients on one secure platform — smart scheduling,
          digital records, telehealth, and automated reminders.
        </p>
        <EcgPulse className="w-64 mx-auto mt-8 text-teal-400" />
        <div className="flex flex-wrap justify-center gap-4 mt-8">
          <button
            onClick={() => go("doctor")}
            className="px-6 py-3 rounded-2xl bg-teal-400 text-slate-950 font-body font-semibold hover:bg-teal-300 transition-colors flex items-center gap-2"
          >
            <Stethoscope size={18} /> Register as a doctor
          </button>
          <button
            onClick={() => go("patient")}
            className="px-6 py-3 rounded-2xl border border-slate-600 text-slate-200 font-body font-semibold hover:border-teal-400 hover:text-teal-300 transition-colors flex items-center gap-2"
          >
            <Users size={18} /> Enter patient portal
          </button>
        </div>
      </section>

      {/* feature strip */}
      <section className="max-w-6xl mx-auto px-6 py-10 grid md:grid-cols-4 gap-4">
        {[
          { icon: Calendar, t: "Smart scheduling", d: "Real-time slots synced to each doctor's calendar rules." },
          { icon: Video, t: "Telehealth built-in", d: "Secure video visits with e-prescriptions." },
          { icon: Bell, t: "Auto reminders", d: "SMS + email nudges that cut no-shows by up to 40%." },
          { icon: Lock, t: "Bank-grade security", d: "AES-256 at rest, full audit trail on every record." },
        ].map(({ icon: I, t, d }) => (
          <div key={t} className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <I size={20} className="text-teal-300 mb-3" />
            <div className="font-display font-semibold text-slate-100">{t}</div>
            <p className="text-sm text-slate-400 font-body mt-1">{d}</p>
          </div>
        ))}
      </section>

      {/* pricing */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="font-display text-3xl font-bold text-slate-50">Plans that scale with your practice</h2>
          <p className="text-slate-400 font-body mt-2">14-day free trial on every plan. Cancel anytime.</p>
          <div className="inline-flex items-center gap-3 mt-5 font-body text-sm">
            <span className={annual ? "text-slate-400" : "text-slate-100"}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={"w-12 h-6 rounded-full relative transition-colors " + (annual ? "bg-teal-400" : "bg-slate-700")}
              aria-label="Toggle annual billing"
            >
              <span className={"absolute top-0.5 w-5 h-5 rounded-full bg-slate-950 transition-all " + (annual ? "left-6" : "left-0.5")} />
            </button>
            <span className={annual ? "text-slate-100" : "text-slate-400"}>
              Annual <span className="text-teal-300">−20%</span>
            </span>
          </div>
        </div>
        <PricingCards annual={annual} compact />
      </section>
    </div>
  );
}

/* ---------------------- doctor onboarding ------------------------- */

function DoctorSignup({ go }) {
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", password: "", specialty: "Cardiology", license: "", plan: "pro", annual: true });
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const steps = ["Profile", "Credentials", "Choose plan", "Review"];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const plan = PLANS.find((p) => p.id === form.plan);
  const price = form.annual ? Math.round(plan.monthly * 0.8) : plan.monthly;

  const input = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-3 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400";

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error } = await signUp({
      email: form.email,
      password: form.password,
      fullName: form.name,
      role: "doctor",
      doctorDetails: {
        specialty: form.specialty,
        license: form.license,
        fee: 0,
        telehealth: true,
        planId: form.plan,
        billingCycle: form.annual ? "annual" : "monthly",
      },
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  };

  if (done)
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center fade-up">
        <div className="w-16 h-16 rounded-3xl bg-teal-400/15 border border-teal-400/40 flex items-center justify-center mx-auto mb-6">
          <Check size={28} className="text-teal-300" />
        </div>
        <h2 className="font-display text-3xl font-bold text-slate-50">Welcome aboard, {form.name || "Doctor"}.</h2>
        <p className="text-slate-400 font-body mt-3">
          Your <span className="text-teal-300">{plan.name}</span> trial is active for 14 days.
          We'll verify your PRC license within 24 hours — meanwhile, your dashboard is ready.
        </p>
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 font-mono2 text-sm text-slate-300">
          {plan.name} · {peso(price)}/mo · {form.annual ? "annual" : "monthly"} billing · first charge after trial
        </div>
        <button onClick={() => go("patient")} className="mt-8 px-6 py-3 rounded-2xl bg-teal-400 text-slate-950 font-body font-semibold hover:bg-teal-300 transition-colors">
          See the patient side →
        </button>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 fade-up">
      {/* stepper */}
      <div className="flex items-center gap-2 mb-10">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <div
                className={
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono2 border " +
                  (i < step ? "bg-teal-400 border-teal-400 text-slate-950" : i === step ? "border-teal-400 text-teal-300" : "border-slate-700 text-slate-500")
                }
              >
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className={"text-sm font-body hidden sm:block " + (i === step ? "text-slate-100" : "text-slate-500")}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className={"flex-1 h-px " + (i < step ? "bg-teal-400" : "bg-slate-800")} />}
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-slate-50 mb-2">Tell us about yourself</h2>
          <input className={input} placeholder="Full name (e.g. Dr. Ana Reyes)" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <input className={input} placeholder="Work email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <input className={input} placeholder="Password (min. 6 characters)" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
          <p className="text-xs text-slate-500 font-body flex items-center gap-1.5"><Lock size={12} /> Multi-factor authentication is required for all doctor accounts.</p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-slate-50 mb-2">Credentials</h2>
          <select className={input} value={form.specialty} onChange={(e) => set("specialty", e.target.value)}>
            {SPECIALTIES.filter((s) => s !== "All").map((s) => <option key={s}>{s}</option>)}
          </select>
          <input className={input} placeholder="PRC license number" value={form.license} onChange={(e) => set("license", e.target.value)} />
          <p className="text-xs text-slate-500 font-body">Licenses are verified against the PRC registry before your profile goes live to patients.</p>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h2 className="font-display text-2xl font-bold text-slate-50">Set up your subscription</h2>
            <label className="flex items-center gap-2 text-sm font-body text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.annual} onChange={(e) => set("annual", e.target.checked)} className="accent-teal-400" />
              Annual billing <span className="text-teal-300">(−20%)</span>
            </label>
          </div>
          <PricingCards annual={form.annual} selected={form.plan} onSelect={(id) => set("plan", id)} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-slate-50 mb-2">Review &amp; start trial</h2>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
            {[
              ["Name", form.name || "—"],
              ["Email", form.email || "—"],
              ["Specialty", form.specialty],
              ["PRC license", form.license || "—"],
              ["Plan", `${plan.name} · ${peso(price)}/mo (${form.annual ? "annual" : "monthly"})`],
              ["Trial", "14 days free · no charge until trial ends"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-5 py-3.5 text-sm font-body">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-200 text-right">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 font-body">By continuing you agree to the Terms of Service and the processing of health data under the Data Privacy Act of 2012.</p>
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-10">
        <button
          onClick={() => (step === 0 ? go("landing") : setStep(step - 1))}
          className="px-5 py-2.5 rounded-2xl border border-slate-700 text-slate-300 font-body hover:border-slate-500 transition-colors flex items-center gap-1.5"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <button
          disabled={submitting}
          onClick={() => (step === 3 ? submit() : setStep(step + 1))}
          className="px-6 py-2.5 rounded-2xl bg-teal-400 text-slate-950 font-body font-semibold hover:bg-teal-300 transition-colors flex items-center gap-1.5 disabled:opacity-60"
        >
          {step === 3 ? (submitting ? "Creating account…" : "Start free trial") : "Continue"} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------- patient portal ------------------------- */

function BookingModal({ doctor, onClose }) {
  const { session } = useAuth();
  const [slot, setSlot] = useState(null);
  const [mode, setMode] = useState("clinic");
  const [booked, setBooked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const isRealDoctor = typeof doctor.id === "string" && doctor.id.includes("-");

  const confirmBooking = async () => {
    if (!isRealDoctor || !session?.user?.id) {
      // Demo doctor (no live Supabase row) — just show the confirmation.
      setBooked(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const starts_at = tomorrow.toISOString(); // simplified: real app should parse `slot` into an exact time
    const { error } = await supabase.from("appointments").insert({
      doctor_id: doctor.id,
      patient_id: session.user.id,
      starts_at,
      ends_at: starts_at,
      mode,
      fee_charged: doctor.fee,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setBooked(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        {booked ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-2xl bg-teal-400/15 border border-teal-400/40 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-teal-300" />
            </div>
            <h3 className="font-display text-xl font-bold text-slate-50">Appointment confirmed</h3>
            <p className="font-body text-slate-400 text-sm mt-2">
              {doctor.name} · tomorrow at {slot} · {mode === "video" ? "video visit" : "in clinic"}.
              You'll get an SMS reminder 24h and 1h before.
            </p>
            <button onClick={onClose} className="mt-6 px-5 py-2.5 rounded-2xl bg-teal-400 text-slate-950 font-body font-semibold">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <Avatar name={doctor.name} online={doctor.online} />
                <div>
                  <div className="font-display font-semibold text-slate-100">{doctor.name}</div>
                  <div className="text-xs text-slate-400 font-body">{doctor.specialty} · {peso(doctor.fee)} consult</div>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-300" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <Pill active={mode === "clinic"} onClick={() => setMode("clinic")}>In clinic</Pill>
              {doctor.telehealth && <Pill active={mode === "video"} onClick={() => setMode("video")}>Video visit</Pill>}
            </div>
            <div className="text-xs font-mono2 text-slate-500 mb-2">TOMORROW · AVAILABLE SLOTS</div>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  className={
                    "py-2 rounded-xl text-sm font-body border transition-colors " +
                    (slot === s ? "bg-teal-400 text-slate-950 border-teal-400 font-medium" : "border-slate-700 text-slate-300 hover:border-teal-500/60")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            {saveError && (
              <div className="mb-3 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /> {saveError}
              </div>
            )}
            <button
              disabled={!slot || saving}
              onClick={confirmBooking}
              className={
                "w-full py-3 rounded-2xl font-body font-semibold transition-colors " +
                (slot && !saving ? "bg-teal-400 text-slate-950 hover:bg-teal-300" : "bg-slate-800 text-slate-500 cursor-not-allowed")
              }
            >
              {saving ? "Booking…" : slot ? `Confirm ${slot}` : "Pick a time slot"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PatientAuthGate({ children }) {
  const { session, profile, loading, signUp, signIn } = useAuth();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-3 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400";

  if (loading) {
    return <div className="max-w-md mx-auto px-6 py-24 text-center text-slate-500 font-body">Loading…</div>;
  }

  if (session && profile) return children;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result =
      mode === "signup"
        ? await signUp({ email: form.email, password: form.password, fullName: form.name, role: "patient" })
        : await signIn({ email: form.email, password: form.password });
    setBusy(false);
    if (result.error) setError(result.error.message);
  };

  return (
    <div className="max-w-md mx-auto px-6 py-20 fade-up">
      <h2 className="font-display text-2xl font-bold text-slate-50 mb-1">
        {mode === "signup" ? "Create your patient account" : "Welcome back"}
      </h2>
      <p className="text-slate-400 font-body text-sm mb-6">
        {mode === "signup" ? "Sign up to browse doctors and book visits." : "Log in to see available doctors."}
      </p>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <input className={input} placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        )}
        <input className={input} placeholder="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        <input className={input} placeholder="Password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={6} />
        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <button disabled={busy} className="w-full py-3 rounded-2xl bg-teal-400 text-slate-950 font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60">
          {busy ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        className="mt-4 text-sm text-teal-300 font-body hover:underline"
      >
        {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
      </button>
    </div>
  );
}

function PatientPortal() {
  return (
    <PatientAuthGate>
      <PatientDirectory />
    </PatientAuthGate>
  );
}

function PatientDirectory() {
  const { profile, signOut } = useAuth();
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("All");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [booking, setBooking] = useState(null);
  const [doctors, setDoctors] = useState(DOCTORS);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, specialty, consult_fee, telehealth_enabled, is_online, hospital, years_experience, profiles(full_name)");
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setLoadError(error?.message || null);
        return; // keep demo DOCTORS as fallback
      }
      setDoctors(
        data.map((d) => ({
          id: d.id,
          name: d.profiles?.full_name || "Unnamed doctor",
          specialty: d.specialty,
          rating: 4.8,
          reviews: 0,
          fee: d.consult_fee,
          online: d.is_online,
          telehealth: d.telehealth_enabled,
          nextSlot: "Check availability",
          hospital: d.hospital || "—",
          exp: d.years_experience || 0,
        }))
      );
    })();
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(
    () =>
      doctors.filter(
        (d) =>
          (spec === "All" || d.specialty === spec) &&
          (!onlineOnly || d.online) &&
          (d.name + d.specialty + d.hospital).toLowerCase().includes(q.toLowerCase())
      ),
    [doctors, q, spec, onlineOnly]
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="font-mono2 text-xs text-teal-300 mb-1">PATIENT PORTAL · WELCOME BACK, {(profile?.full_name || "").split(" ")[0]?.toUpperCase() || "PATIENT"}</div>
          <h2 className="font-display text-3xl font-bold text-slate-50">Find your doctor</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="font-mono2 text-xs text-slate-500 flex items-center gap-2">
            <Activity size={13} className="text-teal-400" /> {doctors.filter((d) => d.online).length} doctors available now
          </div>
          <button onClick={signOut} className="text-xs font-body text-slate-400 hover:text-slate-100 flex items-center gap-1.5">
            <LogOut size={13} /> Log out
          </button>
        </div>
      </div>
      {loadError && (
        <div className="mb-6 text-xs font-mono2 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
          Couldn't load live doctors from Supabase ({loadError}) — showing demo data instead.
        </div>
      )}

      {/* search + filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-56">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, specialty, or hospital"
            className="w-full rounded-2xl bg-slate-900 border border-slate-700 pl-11 pr-4 py-3 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400"
          />
        </div>
        <Pill active={onlineOnly} onClick={() => setOnlineOnly(!onlineOnly)}>Available now</Pill>
      </div>
      <div className="flex flex-wrap gap-2 mb-8">
        {SPECIALTIES.map((s) => (
          <Pill key={s} active={spec === s} onClick={() => setSpec(s)}>{s}</Pill>
        ))}
      </div>

      {/* doctor grid */}
      {list.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center font-body text-slate-400">
          No doctors match those filters. Try clearing the search or picking another specialty.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((d) => (
            <div key={d.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-5 hover:border-teal-500/50 transition-colors flex flex-col">
              <div className="flex items-start gap-3 mb-4">
                <Avatar name={d.name} online={d.online} />
                <div className="min-w-0">
                  <div className="font-display font-semibold text-slate-100 truncate">{d.name}</div>
                  <div className="text-sm text-teal-300 font-body">{d.specialty}</div>
                  <div className="text-xs text-slate-500 font-body truncate">{d.hospital}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm font-body text-slate-300 mb-4">
                <span className="flex items-center gap-1"><Star size={14} className="text-amber-300" /> {d.rating} <span className="text-slate-500">({d.reviews})</span></span>
                <span className="text-slate-500">{d.exp} yrs exp</span>
                {d.telehealth && <span className="flex items-center gap-1 text-violet-300"><Video size={13} /> Video</span>}
              </div>
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800">
                <div>
                  <div className="font-mono2 text-xs text-slate-500 flex items-center gap-1"><Clock size={11} /> {d.nextSlot}</div>
                  <div className="font-display font-semibold text-slate-100 mt-0.5">{peso(d.fee)}</div>
                </div>
                <button
                  onClick={() => setBooking(d)}
                  className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors"
                >
                  Book
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {booking && <BookingModal doctor={booking} onClose={() => setBooking(null)} />}
    </div>
  );
}

/* ------------------------- admin portal --------------------------- */

function AdminPortal() {
  const { session, profile, loading, signIn, signOut } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-3 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400";

  if (loading) return <div className="max-w-md mx-auto px-6 py-24 text-center text-slate-500 font-body">Loading…</div>;

  if (!session || !profile) {
    const submit = async (e) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      const { error } = await signIn({ email: form.email, password: form.password });
      setBusy(false);
      if (error) setError(error.message);
    };
    return (
      <div className="max-w-md mx-auto px-6 py-20 fade-up">
        <h2 className="font-display text-2xl font-bold text-slate-50 mb-1">Admin login</h2>
        <p className="text-slate-400 font-body text-sm mb-6">Restricted area — platform administrators only.</p>
        <form onSubmit={submit} className="space-y-4">
          <input className={input} placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          <input className={input} placeholder="Password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          <button disabled={busy} className="w-full py-3 rounded-2xl bg-teal-400 text-slate-950 font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60">
            {busy ? "Please wait…" : "Log in"}
          </button>
        </form>
      </div>
    );
  }

  if (profile.role !== "admin") {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center fade-up">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
          <Lock size={22} className="text-rose-300" />
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-50">Not authorized</h2>
        <p className="text-slate-400 font-body text-sm mt-2">
          This account ({profile.full_name}) has the role "{profile.role}". Only admin accounts can view this dashboard.
          To promote an account, run the promote statement in medipulse-admin-patch.sql.
        </p>
        <button onClick={signOut} className="mt-6 text-sm text-teal-300 font-body hover:underline">Log out and switch accounts</button>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { signOut } = useAuth();
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [verifying, setVerifying] = useState(null);

  const load = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, status, billing_cycle, trial_ends_at, created_at, plan_id, plans(name, monthly_price), doctors(id, specialty, prc_license, license_verified, profiles(full_name))")
      .order("created_at", { ascending: false });
    setLoadingData(false);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setRows(data || []);
  };

  useEffect(() => { load(); }, []);

  const monthlyValue = (r) => {
    const base = Number(r.plans?.monthly_price || 0);
    return r.billing_cycle === "annual" ? Math.round(base * 0.8) : base;
  };

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    const trialing = rows.filter((r) => r.status === "trialing");
    return {
      total: rows.length,
      active: active.length,
      trialing: trialing.length,
      mrr: active.reduce((sum, r) => sum + monthlyValue(r), 0),
      trialMrr: trialing.reduce((sum, r) => sum + monthlyValue(r), 0),
      pendingLicenses: rows.filter((r) => r.doctors && !r.doctors.license_verified).length,
    };
  }, [rows]);

  const verify = async (doctorId) => {
    setVerifying(doctorId);
    const { error } = await supabase.from("doctors").update({ license_verified: true }).eq("id", doctorId);
    setVerifying(null);
    if (error) {
      setLoadError("Verify failed: " + error.message + " — did you run medipulse-admin-patch.sql?");
      return;
    }
    load();
  };

  const statusStyle = {
    trialing: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    active: "bg-teal-400/15 text-teal-300 border-teal-400/30",
    past_due: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    canceled: "bg-slate-700/40 text-slate-400 border-slate-600",
  };

  const daysLeft = (d) => {
    if (!d) return null;
    const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
    return diff;
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="font-mono2 text-xs text-teal-300 mb-1">ADMIN · PLATFORM OVERVIEW</div>
          <h2 className="font-display text-3xl font-bold text-slate-50">Subscriptions</h2>
        </div>
        <button onClick={signOut} className="text-xs font-body text-slate-400 hover:text-slate-100 flex items-center gap-1.5">
          <LogOut size={13} /> Log out
        </button>
      </div>

      {loadError && (
        <div className="mb-6 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {loadError}
        </div>
      )}

      {/* stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Monthly recurring revenue", value: peso(stats.mrr), sub: `+ ${peso(stats.trialMrr)} in trials` },
          { label: "Active subscriptions", value: stats.active, sub: `${stats.total} total signups` },
          { label: "Trialing doctors", value: stats.trialing, sub: "14-day free trials" },
          { label: "Licenses to verify", value: stats.pendingLicenses, sub: "pending PRC review" },
        ].map((s) => (
          <div key={s.label} className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs text-slate-500 font-body">{s.label}</div>
            <div className="font-display text-2xl font-bold text-slate-50 mt-1">{s.value}</div>
            <div className="font-mono2 text-xs text-slate-500 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* subscriptions table */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-800 text-xs font-mono2 text-slate-500">
          <div className="col-span-3">DOCTOR</div>
          <div className="col-span-2">SPECIALTY</div>
          <div className="col-span-2">PLAN</div>
          <div className="col-span-2">STATUS</div>
          <div className="col-span-3 text-right">LICENSE</div>
        </div>
        {loadingData ? (
          <div className="px-5 py-10 text-center text-slate-500 font-body text-sm">Loading subscriptions…</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 font-body text-sm">
            No subscriptions yet. Doctor signups will appear here.
          </div>
        ) : (
          rows.map((r) => {
            const left = r.status === "trialing" ? daysLeft(r.trial_ends_at) : null;
            return (
              <div key={r.id} className="grid grid-cols-12 gap-2 items-center px-5 py-4 border-b border-slate-800/60 last:border-0 text-sm font-body">
                <div className="col-span-3 min-w-0">
                  <div className="text-slate-100 truncate">{r.doctors?.profiles?.full_name || "—"}</div>
                  <div className="font-mono2 text-xs text-slate-500">{peso(monthlyValue(r))}/mo · {r.billing_cycle}</div>
                </div>
                <div className="col-span-2 text-slate-300 truncate">{r.doctors?.specialty || "—"}</div>
                <div className="col-span-2 text-slate-300">{r.plans?.name || r.plan_id}</div>
                <div className="col-span-2">
                  <span className={"inline-block px-2.5 py-1 rounded-full border text-xs " + (statusStyle[r.status] || statusStyle.canceled)}>
                    {r.status}{left != null ? ` · ${left}d left` : ""}
                  </span>
                </div>
                <div className="col-span-3 flex justify-end">
                  {r.doctors?.license_verified ? (
                    <span className="flex items-center gap-1.5 text-teal-300 text-xs"><Check size={14} /> Verified · {r.doctors.prc_license}</span>
                  ) : (
                    <button
                      onClick={() => verify(r.doctors?.id)}
                      disabled={verifying === r.doctors?.id}
                      className="px-3 py-1.5 rounded-xl border border-amber-500/40 text-amber-300 text-xs font-body hover:bg-amber-500/10 transition-colors disabled:opacity-60"
                    >
                      {verifying === r.doctors?.id ? "Verifying…" : `Verify ${r.doctors?.prc_license || "license"}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="mt-4 text-xs text-slate-500 font-body">
        MRR counts active subscriptions only; trialing value shown separately. Verifying a license makes the doctor visible as trusted in the patient directory.
      </p>
    </div>
  );
}

/* ------------------------------ app ------------------------------- */

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const [view, setView] = useState("landing");
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-body">
      <style>{FONTS}</style>

      {/* nav */}
      <nav className="sticky top-0 z-40 backdrop-blur bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => setView("landing")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-400 flex items-center justify-center">
              <Activity size={17} className="text-slate-950" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">MediPulse</span>
          </button>
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1 text-sm">
            {[
              ["landing", "Home"],
              ["doctor", "Doctor signup"],
              ["patient", "Patient portal"],
              ["records", "Records"],
              ["appointments", "Appointments"],
              ["doctorportal", "Doctor Portal"],
              ["admin", "Admin"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={
                  "px-3.5 py-1.5 rounded-xl font-body transition-colors " +
                  (view === id ? "bg-teal-400 text-slate-950 font-medium" : "text-slate-400 hover:text-slate-100")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {view === "landing" && <Landing go={setView} />}
      {view === "doctor" && <DoctorSignup go={setView} />}
      {view === "patient" && <PatientPortal />}
      {view === "records" && <PatientRecords />}
      {view === "appointments" && <AppointmentsModule />}
      {view === "doctorportal" && <DoctorPortal />}
      {view === "admin" && <AdminPortal />}

      <footer className="border-t border-slate-800 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs font-mono2 text-slate-600">
          <span>MediPulse · interactive prototype</span>
          <span className="flex items-center gap-1.5"><Shield size={12} /> AES-256 · TLS 1.3 · audit-logged</span>
        </div>
      </footer>
    </div>
  );
}
