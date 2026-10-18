import React, { useState, useMemo, useEffect } from "react";
import {
  Stethoscope, Calendar, Search, Star, Check, ChevronRight, ChevronLeft,
  Users, Video, X, Clock, Zap, Building2, Lock, LogOut, AlertCircle, Menu, MapPin, ArrowRight,
} from "lucide-react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import StaffApp from "./StaffApp";
import { PlansTab, InvitesTab, SpecialtiesTab } from "./AdminSetup";
import { PROFESSIONS, ALL_SPECIALTIES, professionById } from "./lib/professions";
import { LogoMark } from "./Logo";
import { PaymentProofModal } from "./PaymentProof";
import { ConsentFormsPanel } from "./ConsentForms";
import {
  Avatar, Stamp, StatusMark, FieldLabel, Notice, Tabs, HoldCountdown,
  btn, btnLg, btnGhost, btnGhostLg, btnQuiet, inputCls,
  tintForProfession, tintForSpecialty, PROFESSION_TINT,
} from "./ui";

/* ------------------------------------------------------------------ */
/*  4MED — Patient Management SaaS prototype                           */
/*  Views: Landing → Doctor onboarding (with plan setup) → Patient     */
/* ------------------------------------------------------------------ */

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

// Normalizes a live `plans` row from the database (managed by admin in
// Admin → Plans) into the shape PricingCards expects. Falls back to the
// hardcoded PLANS above if the fetch fails or returns nothing, so the
// site never shows a blank pricing section.
const PLAN_ICONS = { starter: Stethoscope, pro: Zap, clinic: Building2 };
function normalizePlan(row, index) {
  return {
    id: row.id,
    name: row.name,
    icon: PLAN_ICONS[row.id] || [Stethoscope, Zap, Building2][index % 3],
    monthly: Number(row.monthly_price),
    tagline: row.max_doctor_seats > 1 ? `Up to ${row.max_doctor_seats} doctor seats` : "For a single doctor",
    popular: index === 1,
    features: row.features || [],
  };
}

const SPECIALTIES = ALL_SPECIALTIES;

const DOCTORS = [
  { id: 1, name: "Dr. Maria Santos", specialty: "Cardiology", specialties: ["Cardiology"], rating: 4.9, reviews: 212, fee: 900, online: true, telehealth: true, nextSlot: "Today, 3:30 PM", hospital: "St. Luke's Medical Center", exp: 14 },
  { id: 2, name: "Dr. Jose Ramirez", specialty: "Pediatrics", specialties: ["Pediatrics"], rating: 4.8, reviews: 187, fee: 700, online: true, telehealth: true, nextSlot: "Today, 4:00 PM", hospital: "Makati Medical Center", exp: 9 },
  { id: 3, name: "Dr. Amara Villanueva", specialty: "Dermatology", specialties: ["Dermatology"], rating: 4.9, reviews: 305, fee: 1200, online: false, telehealth: true, nextSlot: "Tomorrow, 10:00 AM", hospital: "The Medical City", exp: 11 },
  { id: 4, name: "Dr. Kenji Tan", specialty: "Internal Medicine", specialties: ["Internal Medicine"], rating: 4.7, reviews: 143, fee: 650, online: true, telehealth: false, nextSlot: "Today, 5:15 PM", hospital: "Cardinal Santos", exp: 7 },
  { id: 5, name: "Dr. Lea Bautista", specialty: "OB-GYN", specialties: ["OB-GYN"], rating: 4.9, reviews: 268, fee: 1000, online: true, telehealth: true, nextSlot: "Tomorrow, 9:00 AM", hospital: "Asian Hospital", exp: 16 },
  { id: 6, name: "Dr. Rafael Cruz", specialty: "Neurology", specialties: ["Neurology"], rating: 4.8, reviews: 99, fee: 1500, online: false, telehealth: true, nextSlot: "Fri, 1:00 PM", hospital: "St. Luke's Medical Center", exp: 12 },
];

const peso = (n) => "₱" + Number(n || 0).toLocaleString();

// "30 minutes", "2 hours", "24 hours" — how long a payment hold lasts.
const holdText = (min) => {
  const m = Number(min) || 0;
  if (m < 60) return `${m} minutes`;
  if (m < 1440) return m === 60 ? "1 hour" : `${Math.round(m / 60)} hours`;
  return m === 1440 ? "24 hours" : `${Math.round(m / 1440)} days`;
};

// What a doctor asks for up front, in the patient's words: a downpayment
// with the balance due at the clinic, or the whole fee.
const prepayTerms = (d) => {
  const now = Number(d.prepayAmount) || 0;
  const fee = Number(d.fee) || 0;
  const isDown = fee > 0 && now > 0 && now < fee;
  return { now, balance: isDown ? fee - now : 0, isDown };
};

/* ------------------------- shared bits ---------------------------- */

function Pill({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={!!active}
      className={
        "px-3 py-1.5 rounded-md text-sm font-body transition-colors border " +
        (active
          ? "bg-ink text-white border-ink font-medium"
          : "bg-white text-slate-300 border-slate-700 hover:border-ink")
      }
    >
      {children}
    </button>
  );
}

/* --------------------------- pricing ------------------------------ */

// Plans are printed like three card stocks laid side by side; the
// popular one carries a stamp instead of a floating badge.
const PLAN_TINTS = ["bg-sky", "bg-butter", "bg-mint"];

function PricingCards({ annual, selected, onSelect, compact, plans }) {
  const list = plans && plans.length > 0 ? plans : PLANS;
  return (
    <div className="grid md:grid-cols-3 gap-5">
      {list.map((p, i) => {
        const price = annual ? Math.round(p.monthly * 0.8) : p.monthly;
        const isSel = selected === p.id;
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={p.id}
            {...(onSelect ? { onClick: () => onSelect(p.id), "aria-pressed": isSel, type: "button" } : {})}
            className={
              "relative text-left rounded-xl bg-white border flex flex-col overflow-hidden transition-[border-color,transform] duration-200 " +
              (isSel ? "border-ink ring-2 ring-ink -translate-y-1" : "border-slate-700") +
              (onSelect ? " cursor-pointer hover:border-ink" : "")
            }
          >
            <div className={"px-6 pt-5 pb-4 border-b border-ink/15 " + PLAN_TINTS[i % 3]}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-2xl font-bold text-ink">{p.name}</div>
                  <div className="text-sm text-slate-300 font-body mt-0.5">{p.tagline}</div>
                </div>
              </div>
            </div>
            <div className="px-6 pt-5">
              <div className="flex items-baseline gap-1.5">
                <span className="queue-no text-5xl text-ink">{peso(price)}</span>
                <span className="text-slate-400 text-sm font-body">/ month</span>
              </div>
              <div className="text-xs text-slate-400 font-body mt-1 h-4">{annual ? `Billed yearly at ${peso(price * 12)}` : "Billed monthly"}</div>
            </div>
            <ul className="px-6 pt-4 pb-6 flex-1">
              {(compact ? p.features.slice(0, 4) : p.features).map((f) => (
                <li key={f} className="flex items-start gap-2.5 py-2 text-sm text-slate-300 font-body border-b border-slate-800 last:border-0">
                  <Check size={15} className="text-ink mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {onSelect && (
              <div className={"px-6 py-3 border-t text-sm font-body font-semibold " + (isSel ? "bg-ink text-white border-ink" : "border-slate-800 text-teal-300")}>
                {isSel ? <span className="flex items-center gap-1.5"><Check size={16} /> Selected</span> : "Choose " + p.name}
              </div>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

/* --------------------------- landing ------------------------------ */

// A visit's life, as the stamps that land on its card. Shared by the
// hero card and the "how a visit moves" strip so they never disagree.
const VISIT_STEPS = [
  { status: "booked", who: "Patient", text: "Picks a slot from the doctor's real clinic hours." },
  { status: "verified", who: "Patient, then clinic", text: "Pays by GCash, Maya or bank and uploads the receipt; the clinic checks it." },
  { status: "signed", who: "Patient", text: "Reads and signs the clinic's consent form on their phone." },
  { status: "checked_in", who: "Front desk", text: "Scans the patient's QR at the counter and hands out a queue number." },
  { status: "in_progress", who: "Doctor", text: "Consults with the chart for their profession: SOAP, Rx, certificates." },
  { status: "completed", who: "Front desk", text: "Bills the visit and books the follow-up." },
];

// The hero's sample card stamps itself, one state at a time, so the
// first thing a visitor sees is the product's mechanism at work.
function SampleClinicCard() {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const STAMPS = ["Paid", "Signed", "Checked in"];
  const [shown, setShown] = useState(reduced ? STAMPS.length : 0);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setShown((n) => (n >= STAMPS.length ? 0 : n + 1)), shown >= STAMPS.length ? 3600 : 1100);
    return () => clearTimeout(t);
  }, [shown, reduced]);

  return (
    <div className="relative card-deal" style={{ animationDelay: "120ms" }}>
      {/* the card behind, slightly turned: the next patient's */}
      <div className="absolute inset-0 translate-x-1.5 translate-y-3 rotate-[2deg] sm:translate-x-4 sm:translate-y-4 sm:rotate-[3deg] rounded-xl bg-mint border border-ink/15" aria-hidden="true" />
      <figure className="relative rounded-xl bg-white border border-ink/20 overflow-hidden" aria-label="Sample clinic card">
        <div className="bg-sky px-6 py-4 flex items-center justify-between border-b border-ink/15">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <div>
              <div className="font-display font-bold text-ink leading-none">Clinic card</div>
              <div className="text-xs text-slate-300 font-body mt-1">Rm 512 · Medical Arts Bldg</div>
            </div>
          </div>
          <span className="text-[11px] font-body font-semibold uppercase tracking-[0.12em] text-slate-300">Sample</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto]">
          <div className="relative px-6 py-5 space-y-4">
            {[
              ["Patient", "Maria Lourdes Santos"],
              ["Doctor", "Dra. Celia Reyes · Cardiology"],
              ["Schedule", "Sat 18 Oct · 2:45 PM"],
            ].map(([k, v]) => (
              <div key={k}>
                <FieldLabel>{k}</FieldLabel>
                <div className="write-in font-body text-lg text-ink mt-1">{v}</div>
              </div>
            ))}
            <div className="h-16 flex items-center">{shown === 0 && <span className="pending-mark">Awaiting payment</span>}</div>
            {/* stamps come down across the written lines, as a secretary would ink them */}
            <div aria-live="polite">
              {STAMPS.slice(0, shown).map((s, i) => (
                <span key={s} className="absolute" style={[{ right: 12, top: 10 }, { right: 14, bottom: 62 }, { left: 22, bottom: 16 }][i]}>
                  <Stamp press={!reduced} tilt={[-8, 6, -3][i]} size="lg">{s}</Stamp>
                </span>
              ))}
            </div>
          </div>
          <div className="perf-v perf" aria-hidden="true" />
          <div className="w-28 sm:w-32 flex flex-col items-center justify-center px-3 py-5 bg-white">
            <FieldLabel>Queue no.</FieldLabel>
            <div className="queue-no text-[84px] text-ink mt-1">08</div>
          </div>
        </div>
      </figure>
    </div>
  );
}

// Five professions, five card stocks. One is open at a time; hovering
// or focusing another opens it and quiets the rest.
const PROFESSION_DETAILS = {
  doctor: { module: "Consultation", lines: ["SOAP notes with templates", "e-Prescriptions with the patient's allergies in view", "Medical certificates printed on your letterhead"] },
  dentist: { module: "Dental chart", lines: ["Odontogram in FDI notation, a condition per tooth", "Chart history across visits", "The same booking, billing and queue as everyone else"] },
  ophthalmologist: { module: "Eye exam", lines: ["Visual acuity, IOP with its trend, refraction", "Findings per eye, with history", "Prescriptions and certificates included"] },
  psychiatrist: { module: "Mental health", lines: ["PHQ-9 and GAD-7, scored, with their trend", "Mental status exam, risk assessment, session notes", "Prescription pad included"] },
  psychologist: { module: "Mental health", lines: ["PHQ-9 and GAD-7, scored, with their trend", "Mental status exam, risk assessment, session notes", "No prescription pad: psychologists don't prescribe"] },
};

function ProfessionRack() {
  const [open, setOpen] = useState("dentist");
  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:h-[380px]">
      {PROFESSIONS.map((p) => {
        const on = open === p.id;
        const d = PROFESSION_DETAILS[p.id];
        return (
          <button
            key={p.id}
            type="button"
            onMouseEnter={() => setOpen(p.id)}
            onFocus={() => setOpen(p.id)}
            onClick={() => setOpen(p.id)}
            aria-expanded={on}
            className={
              "group relative text-left rounded-xl border border-ink/15 overflow-hidden transition-[flex-grow,opacity] duration-500 ease-[cubic-bezier(.16,1,.3,1)] " +
              tintForProfession(p.id) + " " +
              (on ? "lg:flex-[4] opacity-100" : "lg:flex-[1] lg:opacity-80 hover:opacity-100")
            }
          >
            <div className="p-5 h-full flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className={"font-display font-bold text-ink leading-tight " + (on ? "text-3xl" : "text-xl lg:[writing-mode:vertical-rl] lg:rotate-180")}>{p.label}</div>
                {on && <Stamp tone="ink" tilt={4}>{d.module}</Stamp>}
              </div>
              <div className={on ? "pt-5 flex-1 flex flex-col" : "hidden"}>
                <ul className="space-y-2">
                  {d.lines.map((l) => (
                    <li key={l} className="flex items-start gap-2.5 font-body text-ink"><Check size={16} className="mt-1 shrink-0" />{l}</li>
                  ))}
                </ul>
                <div className="mt-auto pt-4 border-t border-ink/20 text-sm font-body text-slate-300">
                  {p.specialties.join(" · ")}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// What the front desk sees: a short sample of the queue board, so the
// clinic side of the card is shown, not described.
const SAMPLE_QUEUE = [
  { no: "07", time: "2:30 PM", name: "Antonio Dela Cruz", visit: "Follow-up", status: "in_progress" },
  { no: "08", time: "2:45 PM", name: "Maria Lourdes Santos", visit: "New patient", status: "checked_in" },
  { no: "09", time: "3:00 PM", name: "Jose Ramon Villanueva", visit: "ECG review", status: "verified" },
  { no: "10", time: "3:15 PM", name: "Kristine Joy Bautista", visit: "Follow-up", status: "booked" },
];

function Landing({ go }) {
  const { session, profile } = useAuth();
  const [annual, setAnnual] = useState(true);
  const [livePlans, setLivePlans] = useState([]);
  useEffect(() => {
    supabase.from("plans").select("*").order("monthly_price")
      .then(({ data }) => { if (data && data.length > 0) setLivePlans(data.map(normalizePlan)); });
  }, []);
  const isSignedIn = !!(session && profile);
  const homeDestination = profile?.role === "patient" ? "patient" : "app";
  const homeLabel = profile?.role === "patient" ? "Go to my appointments" : "Open the Clinic App";
  return (
    <div className="overflow-x-clip">
      {/* hero: the card itself */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-12 sm:pt-16 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
        <div className="fade-up">
          {isSignedIn && (
            <p className="font-body text-sm text-slate-400 mb-5">
              Signed in as <span className="text-ink font-semibold">{profile.full_name}</span> <span className="capitalize">({profile.role})</span>
            </p>
          )}
          <h1 className="font-display text-[44px] leading-[1.02] sm:text-6xl lg:text-[68px] font-extrabold text-ink">
            Every visit on one card, from booking to the stamp.
          </h1>
          <p className="font-body text-lg text-slate-300 mt-6 max-w-[34rem]">
            4MED is the clinic system for Philippine practices. Patients book from your real clinic hours, pay ahead and sign consent on their phone.
            Your front desk runs the queue. You consult with a chart made for your profession.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            {isSignedIn ? (
              <button onClick={() => go(homeDestination)} className={btnLg}>
                {homeLabel} <ArrowRight size={18} />
              </button>
            ) : (
              <button onClick={() => go("doctor")} className={btnLg}>
                Start a 14-day trial <ArrowRight size={18} />
              </button>
            )}
            <button onClick={() => go("patient")} className={btnGhostLg}>
              Book as a patient
            </button>
          </div>
          <p className="font-body text-sm text-slate-400 mt-5">For doctors, dentists, ophthalmologists, psychiatrists and psychologists.</p>
        </div>
        <SampleClinicCard />
      </section>

      {/* how a visit moves */}
      <section className="border-y border-slate-800 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink max-w-2xl">How a visit moves</h2>
          <p className="font-body text-slate-300 mt-3 max-w-2xl">Each step is a stamp on the patient's card. The patient sees it on their phone, the front desk sees it on the queue.</p>
          <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-6 border-t border-ink">
            {VISIT_STEPS.map((s) => (
              <li key={s.status} className="pt-5 pb-6 pr-5 border-b lg:border-b-0 border-slate-800 lg:border-r last:border-r-0 lg:pl-4 first:lg:pl-0">
                <div className="h-11 flex items-center"><StatusMark status={s.status} size="md" /></div>
                <div className="field-label mt-3">{s.who}</div>
                <p className="font-body text-[15px] text-slate-200 mt-1.5">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* professions */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-20">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-6 items-end mb-10">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink">Your profession gets its own card.</h2>
          <p className="font-body text-slate-300 lg:max-w-xl">
            The booking, payment, consent and queue are the same for everyone. The consult is not: each profession opens its own chart, on its own colour of card.
          </p>
        </div>
        <ProfessionRack />
      </section>

      {/* the front desk */}
      <section className="bg-sky border-y border-ink/15">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-20 grid lg:grid-cols-[1fr_1.5fr] gap-12 items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink">The front desk sees the day as a queue.</h2>
            <p className="font-body text-slate-200 mt-4">
              Today's patients in order, with their number, what's paid, and what's signed. Scan a patient's QR at the counter and their card is stamped Checked in.
            </p>
            <ul className="mt-6 space-y-2 font-body text-ink">
              {["Day and week calendar, walk-ins included", "Payment proofs to check, in one list", "Official receipts at checkout, split payments included"].map((t) => (
                <li key={t} className="flex gap-2.5"><Check size={18} className="mt-0.5 shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-white border border-ink/20 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <span className="field-label">Today's queue · sample</span>
              <span className="text-xs font-body text-slate-400">Sat 18 Oct · Clinic hours 1–5 PM</span>
            </div>
            <table className="w-full text-left font-body">
              <tbody>
                {SAMPLE_QUEUE.map((r) => (
                  <tr key={r.no} className={"border-b border-slate-800 last:border-0 " + (r.status === "in_progress" ? "bg-sky/40" : "")}>
                    <td className="pl-5 pr-2 py-3 w-14"><span className="queue-no text-3xl text-ink">{r.no}</span></td>
                    <td className="px-2 py-3 text-sm text-slate-400 tnum hidden sm:table-cell w-20">{r.time}</td>
                    <td className="px-2 py-3"><div className="text-ink font-semibold">{r.name}</div><div className="text-sm text-slate-400">{r.visit}</div></td>
                    <td className="pr-5 pl-2 py-3 text-right"><StatusMark status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink">Plans for a single room or a whole clinic</h2>
            <p className="text-slate-300 font-body mt-3">Every plan starts with a 14-day free trial.</p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-700 bg-white p-1 font-body text-sm" role="group" aria-label="Billing period">
            {[[false, "Monthly"], [true, "Yearly · save 20%"]].map(([val, label]) => (
              <button
                key={label}
                onClick={() => setAnnual(val)}
                aria-pressed={annual === val}
                className={"px-4 py-2 rounded-md transition-colors " + (annual === val ? "bg-ink text-white font-semibold" : "text-slate-300 hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <PricingCards annual={annual} compact plans={livePlans} />
      </section>

      {/* close */}
      {!isSignedIn && (
        <section className="max-w-6xl mx-auto px-5 sm:px-6 pb-8">
          <div className="rounded-xl bg-ink text-white px-6 sm:px-10 py-12 grid md:grid-cols-[1.4fr_1fr] gap-8 items-center">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold">Set up your clinic card this afternoon.</h2>
              <p className="font-body text-sky mt-3">Add your clinic hours, fee and payment details, then share your booking page with patients.</p>
            </div>
            <div className="flex flex-wrap md:justify-end gap-3">
              <button onClick={() => go("doctor")} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-white text-ink font-body font-semibold hover:bg-sky transition-colors">
                Start a 14-day trial <ArrowRight size={18} />
              </button>
              <button onClick={() => go("staffjoin")} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-white/60 text-white font-body font-semibold hover:bg-white hover:text-ink transition-colors">
                I'm clinic staff
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------------- doctor onboarding ------------------------- */

function DoctorSignup({ go }) {
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", password: "", professionType: "doctor", specialties: ["Cardiology"], license: "", plan: "pro", annual: true });
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [livePlans, setLivePlans] = useState([]);
  const [liveSpecialties, setLiveSpecialties] = useState([]);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState(null); // null | "checking" | "valid" | "invalid"
  const [invitePreassignedPlan, setInvitePreassignedPlan] = useState(null);
  const steps = ["Profile", "Credentials", "Choose plan", "Review"];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const planList = livePlans.length > 0 ? livePlans : PLANS;
  const stepValid =
    step === 0 ? (form.name.trim() !== "" && form.email.trim() !== "" && form.password.length >= 6) :
    step === 1 ? (form.specialties.length > 0 && form.license.trim() !== "") :
    true; // steps 2 (plan) and 3 (review) always have a valid default
  const plan = planList.find((p) => p.id === form.plan) || planList[0];
  const price = form.annual ? Math.round(plan.monthly * 0.8) : plan.monthly;

  useEffect(() => {
    supabase.from("plans").select("*").order("monthly_price")
      .then(({ data }) => {
        if (data && data.length > 0) {
          const normalized = data.map(normalizePlan);
          setLivePlans(normalized);
          // If the currently-selected plan id no longer exists (e.g. an
          // admin renamed/removed it), fall back to the first available
          // plan instead of submitting a dead reference at signup.
          setForm((f) => (normalized.some((p) => p.id === f.plan) ? f : { ...f, plan: normalized[0].id }));
        }
      });
    supabase.from("specialties").select("name, profession_type").eq("active", true).order("sort_order")
      .then(({ data }) => setLiveSpecialties(data || []));
  }, []);


  const checkInvite = (code) => {
    setInviteCode(code);
    setInviteStatus(null);
    setInvitePreassignedPlan(null);
    if (!code.trim()) return;
    setInviteStatus("checking");
    supabase.rpc("check_admin_invite", { p_code: code.trim() }).then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.valid) { setInviteStatus("invalid"); return; }
      setInviteStatus("valid");
      if (row.preassigned_plan_id) {
        setInvitePreassignedPlan(row.preassigned_plan_id);
        setForm((f) => ({ ...f, plan: row.preassigned_plan_id }));
      }
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error } = await signUp({
      email: form.email,
      password: form.password,
      fullName: form.name,
      role: "doctor",
      doctorDetails: {
        specialties: form.specialties,
        professionType: form.professionType,
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
    if (inviteStatus === "valid" && inviteCode.trim()) {
      await supabase.rpc("redeem_admin_invite", { p_code: inviteCode.trim() }); // best-effort; account already created either way
    }
    setDone(true);
  };

  if (done)
    return (
      <div className="max-w-xl mx-auto px-5 sm:px-6 py-16 fade-up">
        <div className="rounded-xl border border-ink/20 overflow-hidden bg-white">
          <div className={"px-6 py-5 border-b border-ink/15 flex items-start justify-between gap-4 " + tintForProfession(form.professionType)}>
            <div>
              <FieldLabel>Practitioner card</FieldLabel>
              <h2 className="font-display text-3xl font-bold text-ink mt-1">Welcome, {form.name || "Doctor"}.</h2>
            </div>
            <Stamp press size="lg" tilt={-6}>Trial active</Stamp>
          </div>
          <div className="px-6 py-5 space-y-4 font-body">
            <p className="text-slate-200">
              Your {plan.name} trial runs for 14 days. Your Clinic App is ready now; patients can book you once an administrator has checked your PRC license.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div><FieldLabel>Plan</FieldLabel><div className="write-in text-ink mt-1">{plan.name} · {peso(price)}/mo</div></div>
              <div><FieldLabel>Billing</FieldLabel><div className="write-in text-ink mt-1">{form.annual ? "Yearly" : "Monthly"}, after the trial</div></div>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-800 flex flex-wrap gap-3">
            <button onClick={() => go("app")} className={btn}>Open the Clinic App <ArrowRight size={16} /></button>
            <button onClick={() => go("patient")} className={btnGhost}>See what patients see</button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14 fade-up">
      <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">Register your practice</h1>
      <p className="font-body text-slate-300 mt-2">Four short steps. Nothing is charged during the 14-day trial.</p>

      {/* stepper: the card's numbered sections */}
      <ol className="grid grid-cols-4 mt-8 mb-8 border-t-2 border-slate-800" aria-label="Signup steps">
        {steps.map((s, i) => (
          <li key={s} className={"pt-3 -mt-0.5 border-t-2 " + (i <= step ? "border-ink" : "border-transparent")} aria-current={i === step ? "step" : undefined}>
            <div className={"flex items-center gap-2 text-sm font-body " + (i === step ? "text-ink font-semibold" : i < step ? "text-slate-200" : "text-slate-400")}>
              <span className="tnum font-semibold">{i < step ? <Check size={15} /> : i + 1}</span>
              <span className="hidden sm:inline">{s}</span>
            </div>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-ink">About you</h2>
          <label className="block"><FieldLabel>Full name</FieldLabel><input className={inputCls + " mt-1.5"} placeholder="e.g. Dra. Ana Reyes" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="block"><FieldLabel>Work email</FieldLabel><input className={inputCls + " mt-1.5"} type="email" placeholder="you@clinic.ph" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label className="block"><FieldLabel>Password</FieldLabel><input className={inputCls + " mt-1.5"} type="password" placeholder="At least 6 characters" value={form.password} onChange={(e) => set("password", e.target.value)} /></label>
          <label className="block">
            <FieldLabel>Invite code (optional)</FieldLabel>
            <input className={inputCls + " mt-1.5"} placeholder="If 4MED gave you one" value={inviteCode} onChange={(e) => checkInvite(e.target.value)} />
            {inviteStatus === "checking" && <p className="text-sm text-slate-400 font-body mt-1.5">Checking…</p>}
            {inviteStatus === "valid" && (
              <p className="text-sm text-ink font-body mt-1.5 flex items-center gap-1.5"><Check size={14} /> Invite accepted{invitePreassignedPlan ? ", plan chosen for you" : ""}</p>
            )}
            {inviteStatus === "invalid" && <p className="text-sm text-rose-300 font-body mt-1.5">We couldn't find that code, or it has expired.</p>}
          </label>
          <p className="text-sm text-slate-400 font-body pt-2">Clinic secretary? <button type="button" onClick={() => go("staffjoin")} className={btnQuiet}>Join your doctor's practice with an invite code</button></p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <h2 className="font-display text-2xl font-bold text-ink">Your profession</h2>

          <div>
            <FieldLabel as="span" className="block mb-2">I am a</FieldLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PROFESSIONS.map(({ id, label, defaultSpecialty }) => {
                const on = form.professionType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm((f) => ({ ...f, professionType: id, specialties: [defaultSpecialty] }))}
                    className={
                      "relative px-4 py-4 rounded-lg border text-left font-body transition-[transform,box-shadow] " +
                      tintForProfession(id) + " " +
                      (on ? "border-ink ring-2 ring-ink -translate-y-0.5" : "border-ink/15 hover:border-ink/50")
                    }
                  >
                    <span className="font-semibold text-ink">{label}</span>
                    {on && <Check size={16} className="absolute top-3 right-3 text-ink" />}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-slate-400 font-body mt-2">This sets the colour of your clinic card and the chart you consult with.</p>
          </div>

          <div>
            <FieldLabel as="span" className="block mb-2">Specialties · pick all that apply</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(liveSpecialties.length > 0
                ? liveSpecialties.filter((s) => s.profession_type === form.professionType).map((s) => s.name)
                : professionById(form.professionType).specialties
              ).map((s) => {
                const active = form.specialties.includes(s);
                return (
                  <Pill key={s} active={active} onClick={() => set("specialties", active ? form.specialties.filter((x) => x !== s) : [...form.specialties, s])}>
                    {s}
                  </Pill>
                );
              })}
            </div>
            {form.specialties.length === 0 && <p className="text-sm text-amber-300 font-body mt-2">Pick at least one specialty.</p>}
          </div>

          <label className="block">
            <FieldLabel>PRC license number</FieldLabel>
            <input className={inputCls + " mt-1.5 tnum"} placeholder="7 digits" value={form.license} onChange={(e) => set("license", e.target.value)} />
            <p className="text-sm text-slate-400 font-body mt-1.5">We check it against the PRC registry before patients can book you.</p>
          </label>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h2 className="font-display text-2xl font-bold text-ink">Choose a plan</h2>
            <label className="flex items-center gap-2 text-sm font-body text-slate-200 cursor-pointer">
              <input type="checkbox" checked={form.annual} onChange={(e) => set("annual", e.target.checked)} />
              Pay yearly and save 20%
            </label>
          </div>
          <PricingCards annual={form.annual} selected={form.plan} onSelect={(id) => set("plan", id)} plans={livePlans} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-ink">Check and start your trial</h2>
          <dl className="rounded-xl border border-slate-700 bg-white">
            {[
              ["Name", form.name || "—"],
              ["Email", form.email || "—"],
              ["Profession", professionById(form.professionType).label],
              ["Specialties", form.specialties.join(", ")],
              ["PRC license", form.license || "—"],
              ["Plan", `${plan.name} · ${peso(price)}/mo, billed ${form.annual ? "yearly" : "monthly"}`],
              ["Trial", "14 days free, no charge until it ends"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr] gap-4 px-5 py-3 text-sm font-body border-b border-slate-800 last:border-0">
                <dt className="text-slate-400">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-slate-400 font-body">By starting the trial you agree to the Terms of Service and to 4MED processing health data under the Data Privacy Act of 2012.</p>
          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
        </div>
      )}

      <div className="flex justify-between items-center mt-10 pt-6 border-t border-slate-800">
        <button onClick={() => (step === 0 ? go("landing") : setStep(step - 1))} className={btnGhost}>
          <ChevronLeft size={16} /> Back
        </button>
        <button disabled={submitting || !stepValid} onClick={() => (step === 3 ? submit() : setStep(step + 1))} className={btn}>
          {step === 3 ? (submitting ? "Creating your account…" : "Start free trial") : "Continue"} <ChevronRight size={16} />
        </button>
      </div>
      {!stepValid && step === 0 && <p className="text-right text-sm text-slate-400 font-body mt-2">Fill in your name, email and a password of 6+ characters to continue.</p>}
      {!stepValid && step === 1 && <p className="text-right text-sm text-slate-400 font-body mt-2">Pick a specialty and enter your PRC license number to continue.</p>}
    </div>
  );
}

/* ------------------------- patient portal ------------------------- */

function bmSlots(schedules, doctorId, dateStr, locationId) {
  const wd = new Date(dateStr + "T12:00:00").getDay();
  const allDoctorRules = schedules.filter((s) => s.resource_type === "doctor" && s.resource_id === doctorId);
  // Prefer rules scoped to the chosen location; fall back to the doctor's
  // location-agnostic rules (location_id null) if none exist for it.
  const scoped = locationId ? allDoctorRules.filter((s) => s.location_id === locationId) : [];
  const doctorRules = scoped.length > 0 ? scoped : allDoctorRules.filter((s) => !s.location_id);
  const fallbackRules = doctorRules.length > 0 ? doctorRules : allDoctorRules; // last resort: any rule at all
  const rule = fallbackRules.find((s) => s.weekday === wd);
  if (fallbackRules.length > 0 && !rule) return { slots: [], closed: true };
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
  return { slots: out, closed: false };
}
const bm12h = (t) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const bmLocalHM = (iso) => {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};

function BookingModal({ doctor, onClose }) {
  const { session, profile } = useAuth();
  // Local date parts, not toISOString() (always UTC) — otherwise
  // "today"/"tomorrow" silently roll back a day during PH early
  // mornings (UTC+8 means local midnight-7:59am is still "yesterday"
  // in UTC terms).
  const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayLocal = fmtLocal(new Date());
  const [dateStr, setDateStr] = useState(todayLocal);
  const [schedules, setSchedules] = useState([]);
  const [taken, setTaken] = useState([]);
  const [slot, setSlot] = useState(null);
  const [mode, setMode] = useState("clinic");
  const [locationId, setLocationId] = useState(doctor.locations?.length === 1 ? doctor.locations[0].id : "");
  const [booked, setBooked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [patientRecordId, setPatientRecordId] = useState(null);
  const [newAppt, setNewAppt] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paySent, setPaySent] = useState(false);
  const isRealDoctor = typeof doctor.id === "string" && doctor.id.includes("-");
  const chosenLocation = doctor.locations?.find((l) => l.id === locationId);

  // Every booking must link to the patient's clinical master record
  // (the `patients` table), not just their login account — that's what
  // Doctor Portal, encounters, and billing actually key off. A record
  // is created automatically from their name on first booking (via a
  // security-definer function, so no client-side RLS friction); the
  // front desk fills in birthdate/sex when they actually check in.
  useEffect(() => {
    if (!isRealDoctor || !session?.user?.id) return;
    supabase.from("patients").select("id").eq("profile_id", session.user.id).maybeSingle()
      .then(({ data }) => { if (data) setPatientRecordId(data.id); });
  }, [isRealDoctor, session?.user?.id]);

  useEffect(() => {
    if (!isRealDoctor) return;
    supabase.from("schedules").select("*").eq("resource_type", "doctor").eq("resource_id", doctor.id)
      .then(({ data }) => setSchedules(data || []));
  }, [doctor.id, isRealDoctor]);

  useEffect(() => {
    setSlot(null);
    if (!isRealDoctor) { setTaken([]); return; }
    setLoadingSlots(true);
    // Free up anyone's lapsed unpaid hold first, so a slot that ran out
    // of time shows as open again. Harmless if nothing has lapsed.
    supabase.rpc("expire_unpaid_holds")
      .then(() => supabase.rpc("taken_slots", { d: doctor.id, day: dateStr }))
      .then(({ data }) => {
        setTaken((data || []).map((row) => bmLocalHM(typeof row === "string" ? row : row.taken_slots || row)));
        setLoadingSlots(false);
      });
  }, [dateStr, doctor.id, isRealDoctor]);

  useEffect(() => { setSlot(null); }, [locationId]);

  const { slots, closed } = isRealDoctor
    ? bmSlots(schedules, doctor.id, dateStr, locationId)
    : { slots: ["09:00", "09:30", "10:30", "13:00", "15:30", "16:15"], closed: false };
  const now = new Date();
  const isPast = (s) => new Date(`${dateStr}T${s}:00`) <= now;
  const available = slots.filter((s) => !taken.includes(s) && !isPast(s));
  // Distinguish *why* nothing's available, so "no slots configured" (a
  // schedule where end time <= start time, or a very narrow window
  // that's already elapsed today) never gets mislabeled "fully booked".
  const noSlotsConfigured = !closed && slots.length === 0;
  const allRemainingTaken = !closed && slots.length > 0 && slots.every((s) => isPast(s) || taken.includes(s)) && slots.some((s) => !isPast(s));
  const allRemainingPast = !closed && slots.length > 0 && slots.every(isPast);

  const confirmBooking = async () => {
    if (!slot) return;
    if (!isRealDoctor || !session?.user?.id) { setBooked(true); return; }
    setSaving(true);
    setSaveError(null);

    let recordId = patientRecordId;
    if (!recordId) {
      const { data: newRecordId, error: patErr } = await supabase.rpc("get_or_create_patient_record", {
        p_profile_id: session.user.id, p_full_name: profile?.full_name || "Patient",
      });
      if (patErr) { setSaveError("Couldn't set up your patient record: " + patErr.message); setSaving(false); return; }
      recordId = newRecordId;
      setPatientRecordId(recordId);
    }

    const starts = new Date(`${dateStr}T${slot}:00`);
    const ends = new Date(starts.getTime() + 30 * 60000);
    // When the doctor asks for payment up front the slot is only held —
    // it isn't a confirmed booking until the clinic checks the payment.
    const due = doctor.requirePrepayment
      ? new Date(Math.min(starts.getTime(), Date.now() + doctor.holdMinutes * 60000))
      : null;
    const { data: appt, error } = await supabase.from("appointments").insert({
      doctor_id: doctor.id,
      patient_id: session.user.id,
      patient_record_id: recordId,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      mode,
      fee_charged: doctor.fee,
      location_id: locationId || null,
      source: "online",
      payment_status: doctor.requirePrepayment ? "awaiting_payment" : "not_required",
      payment_due_at: due ? due.toISOString() : null,
    }).select("id").single();
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setNewAppt({ id: appt.id, dueAt: due });
    setBooked(true);
  };

  const prettyDate = new Date(dateStr + "T12:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  const tint = tintForSpecialty(doctor.specialty);
  const tomorrowLocal = fmtLocal(new Date(Date.now() + 86400000));
  const awaitingPay = doctor.requirePrepayment && !paySent;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${doctor.name}`}
        className="w-full sm:max-w-lg rounded-t-xl sm:rounded-xl bg-white card-deal max-h-[92vh] overflow-y-auto shadow-[0_24px_60px_-20px_rgba(19,48,94,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* card header: the doctor's card stock */}
        <div className={"px-5 sm:px-6 py-4 border-b border-ink/15 flex items-start justify-between gap-3 sticky top-0 z-10 " + tint}>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={doctor.name} tint="bg-white" size={44} />
            <div className="min-w-0">
              <div className="font-display font-bold text-lg text-ink truncate">{doctor.name}</div>
              <div className="text-sm text-slate-200 font-body truncate">{doctor.specialty} · {peso(doctor.fee)} consult</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 -mr-1 rounded-md flex items-center justify-center text-ink hover:bg-white/60" aria-label="Close"><X size={18} /></button>
        </div>

        {booked ? (
          <div className="px-5 sm:px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-2xl font-bold text-ink">
                {!doctor.requirePrepayment ? "You're booked" : paySent ? "Receipt sent" : "Your slot is held"}
              </h3>
              {!doctor.requirePrepayment
                ? <Stamp press size="lg" tilt={-6}>Confirmed</Stamp>
                : paySent ? <span className="pending-mark mt-2">Checking payment</span> : <span className="pending-mark mt-2">Awaiting payment</span>}
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 mt-5 font-body">
              <div><FieldLabel>Date</FieldLabel><div className="write-in text-ink mt-1">{prettyDate}</div></div>
              <div><FieldLabel>Time</FieldLabel><div className="write-in text-ink mt-1 tnum">{bm12h(slot)}</div></div>
              <div className="col-span-2"><FieldLabel>Where</FieldLabel><div className="write-in text-ink mt-1">{mode === "video" ? "Video visit" : chosenLocation ? chosenLocation.name : "In clinic"}</div></div>
            </div>
            {!doctor.requirePrepayment && <p className="text-sm text-slate-300 font-body mt-5">We'll remind you a day before.</p>}

            {awaitingPay && (
              <Notice tone="warn" className="mt-5">
                {newAppt?.dueAt && <div className="text-base text-ink mb-1.5"><HoldCountdown dueAt={newAppt.dueAt} /></div>}
                <p>
                  Send {prepayTerms(doctor).isDown ? `the ${peso(prepayTerms(doctor).now)} downpayment` : peso(prepayTerms(doctor).now)} and upload your receipt
                  {newAppt?.dueAt ? ` by ${newAppt.dueAt.toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}, or the slot is released.
                  {prepayTerms(doctor).isDown ? ` The remaining ${peso(prepayTerms(doctor).balance)} is paid at the clinic.` : ""}
                </p>
                {doctor.paymentInstructions && <p className="mt-2 text-ink whitespace-pre-wrap">{doctor.paymentInstructions}</p>}
              </Notice>
            )}
            {paySent && (
              <p className="mt-5 text-sm text-slate-200 font-body">
                The clinic will check your receipt and stamp the appointment confirmed. Follow it under My appointments.
              </p>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              {awaitingPay && newAppt && (
                <button onClick={() => setPayOpen(true)} className={btn}>Upload proof of payment</button>
              )}
              <button onClick={onClose} className={awaitingPay ? btnGhost : btn}>{awaitingPay ? "Later" : "Done"}</button>
            </div>

            {payOpen && newAppt && (
              <PaymentProofModal
                appointment={{ id: newAppt.id }}
                userId={session.user.id}
                amount={doctor.prepayAmount}
                instructions={doctor.paymentInstructions}
                onClose={() => setPayOpen(false)}
                onDone={() => { setPayOpen(false); setPaySent(true); }}
              />
            )}
          </div>
        ) : (
          <div className="px-5 sm:px-6 py-5 space-y-5">
            <div>
              <FieldLabel as="span" className="block mb-2">Visit</FieldLabel>
              <div className="flex gap-2">
                <Pill active={mode === "clinic"} onClick={() => setMode("clinic")}>In clinic</Pill>
                {doctor.telehealth && <Pill active={mode === "video"} onClick={() => setMode("video")}>Video visit</Pill>}
              </div>
            </div>

            {mode === "clinic" && doctor.locations?.length > 1 && (
              <label className="block">
                <FieldLabel>Clinic</FieldLabel>
                <select className={inputCls + " mt-1.5"} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">Choose where you'll be seen…</option>
                  {doctor.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
            {mode === "clinic" && doctor.locations?.length === 1 && (
              <div className="flex items-start gap-2 text-sm text-slate-200 font-body">
                <MapPin size={16} className="mt-0.5 shrink-0" />
                <span>{doctor.locations[0].name}{doctor.locations[0].address ? `, ${doctor.locations[0].address}` : ""}</span>
              </div>
            )}

            <div>
              <FieldLabel as="span" className="block mb-2">Date</FieldLabel>
              <div className="flex items-center gap-2">
                <input type="date" min={todayLocal} value={dateStr} onChange={(e) => setDateStr(e.target.value)} className={inputCls + " flex-1"} aria-label="Appointment date" />
                <Pill active={dateStr === todayLocal} onClick={() => setDateStr(todayLocal)}>Today</Pill>
                <Pill active={dateStr === tomorrowLocal} onClick={() => setDateStr(tomorrowLocal)}>Tomorrow</Pill>
              </div>
            </div>

            <div>
              <FieldLabel as="span" className="block mb-2">{prettyDate} · open times</FieldLabel>
              {loadingSlots ? (
                <div className="text-sm text-slate-400 font-body py-6 text-center border border-dashed border-slate-700 rounded-lg">Checking the doctor's schedule…</div>
              ) : closed ? (
                <div className="text-sm text-slate-300 font-body py-6 text-center border border-dashed border-slate-700 rounded-lg">No clinic hours on this day. Try another date.</div>
              ) : noSlotsConfigured ? (
                <Notice tone="warn">This day's clinic hours aren't set up correctly. Please contact the clinic.</Notice>
              ) : allRemainingPast ? (
                <div className="text-sm text-slate-300 font-body py-6 text-center border border-dashed border-slate-700 rounded-lg">Today's clinic hours are over. Try tomorrow.</div>
              ) : allRemainingTaken ? (
                <div className="text-sm text-slate-300 font-body py-6 text-center border border-dashed border-slate-700 rounded-lg">Fully booked on this date. Try another day.</div>
              ) : available.length === 0 ? (
                <div className="text-sm text-slate-300 font-body py-6 text-center border border-dashed border-slate-700 rounded-lg">No open times on this date. Try another day.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {available.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlot(s)}
                      aria-pressed={slot === s}
                      className={
                        "py-2.5 rounded-md text-sm font-body tnum border transition-colors " +
                        (slot === s ? "bg-ink text-white border-ink font-semibold" : "bg-white border-slate-700 text-ink hover:border-ink")
                      }
                    >
                      {bm12h(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {doctor.requirePrepayment && (
              <div className="rounded-lg border border-dashed border-amber-500/60 bg-butter/50 px-4 py-3 text-sm font-body text-ink">
                {prepayTerms(doctor).isDown
                  ? <>This doctor asks for a <b>{peso(prepayTerms(doctor).now)} downpayment</b> to hold your slot; the remaining {peso(prepayTerms(doctor).balance)} is paid at the clinic.</>
                  : <>This doctor asks for the <b>{peso(prepayTerms(doctor).now)} fee</b> in advance to hold your slot.</>}
                {" "}After you pick a time you have <b>{holdText(doctor.holdMinutes)}</b> to pay by GCash, Maya or bank and upload the receipt. The clinic confirms your slot once they've checked it.
              </div>
            )}
            {saveError && <Notice tone="error" icon={AlertCircle}>{saveError}</Notice>}

            <button disabled={!slot || saving} onClick={confirmBooking} className={btnLg + " w-full"}>
              {saving ? "Booking…" : slot ? `Book ${bm12h(slot)}` : "Choose a time"}
            </button>
          </div>
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

  if (loading) {
    return <div className="max-w-md mx-auto px-6 py-24 text-center text-slate-400 font-body">Loading…</div>;
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
    <div className="max-w-md mx-auto px-5 sm:px-6 py-12 sm:py-16 fade-up">
      <div className="rounded-xl border border-ink/20 bg-white overflow-hidden">
        <div className="bg-sky px-6 py-5 border-b border-ink/15">
          <FieldLabel>Patient</FieldLabel>
          <h1 className="font-display text-3xl font-bold text-ink mt-1">
            {mode === "signup" ? "Get your patient card" : "Welcome back"}
          </h1>
          <p className="text-slate-200 font-body text-sm mt-1.5">
            {mode === "signup" ? "One account for every 4MED clinic you visit." : "Log in to book and see your appointments."}
          </p>
        </div>
        <form onSubmit={submit} className="px-6 py-6 space-y-4">
          {mode === "signup" && (
            <label className="block"><FieldLabel>Full name</FieldLabel><input className={inputCls + " mt-1.5"} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} required /></label>
          )}
          <label className="block"><FieldLabel>Email</FieldLabel><input className={inputCls + " mt-1.5"} type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} required /></label>
          <label className="block"><FieldLabel>Password</FieldLabel><input className={inputCls + " mt-1.5"} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 6 characters" : ""} value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={6} /></label>
          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
          <button disabled={busy} className={btnLg + " w-full"}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>
        <div className="px-6 py-4 border-t border-slate-800 text-sm font-body text-slate-300">
          {mode === "signup" ? "Already have an account? " : "New to 4MED? "}
          <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className={btnQuiet}>
            {mode === "signup" ? "Log in" : "Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MyAppointments() {
  const { session } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [cancelError, setCancelError] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const load = async () => {
    setLoading(true);
    await supabase.rpc("expire_unpaid_holds"); // so a lapsed hold shows as released, not still pending
    const { data, error } = await supabase
      .from("appointments")
      .select("id, starts_at, status, type, mode, fee_charged, patient_record_id, payment_status, payment_due_at, location:location_id(name, address), doctors:doctor_id(specialty, prepayment_amount, payment_instructions, profiles(full_name))")
      .eq("patient_id", session.user.id)
      .order("starts_at", { ascending: false });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setRows(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const cancel = async (id) => {
    if (!window.confirm("Cancel this appointment? The slot goes back to the clinic.")) return;
    setBusyId(id);
    setCancelError(null);
    const { error } = await supabase.from("appointments").update({ status: "canceled" }).eq("id", id);
    setBusyId(null);
    if (error) { setCancelError("Couldn't cancel this appointment. Check your connection and try again."); return; }
    load();
  };

  const now = new Date();
  const upcoming = rows.filter((a) => new Date(a.starts_at) >= now && a.status !== "canceled").reverse();
  const past = rows.filter((a) => new Date(a.starts_at) < now || a.status === "canceled");

  // An upcoming visit is a clinic card: the doctor's stock on top, the
  // date written in, and the stamps that have landed so far.
  const Card = ({ a }) => {
    const lapsed = a.payment_status === "awaiting_payment" && a.payment_due_at && new Date(a.payment_due_at) <= new Date();
    const needsPay = ["awaiting_payment", "rejected"].includes(a.payment_status) && !lapsed;
    const when = new Date(a.starts_at);
    return (
      <article className="rounded-xl border border-ink/20 bg-white overflow-hidden flex flex-col">
        <div className={"px-5 py-3.5 border-b border-ink/15 " + tintForSpecialty(a.doctors?.specialty)}>
          <div className="font-display font-bold text-lg text-ink truncate">{a.doctors?.profiles?.full_name || "Doctor"}</div>
          <div className="text-sm text-slate-200 font-body truncate">{a.doctors?.specialty}</div>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] flex-1">
          <div className="px-5 py-4 space-y-3 min-w-0">
            <div>
              <FieldLabel>Date</FieldLabel>
              <div className="write-in text-ink font-body mt-1">{when.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}</div>
            </div>
            <div>
              <FieldLabel>Where</FieldLabel>
              <div className="write-in text-ink font-body mt-1 truncate">{a.mode === "video" ? "Video visit" : a.location?.name || "In clinic"}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 min-h-[34px]">
              <StatusMark status={a.status} />
              <StatusMark status={a.payment_status} />
            </div>
          </div>
          <div className="perf-v perf" aria-hidden="true" />
          <div className="w-24 flex flex-col items-center justify-center px-2 py-4 text-center">
            <FieldLabel>Time</FieldLabel>
            <div className="queue-no text-4xl text-ink mt-1">{when.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "")}</div>
            <div className="text-xs font-semibold text-slate-300 font-body">{when.getHours() >= 12 ? "PM" : "AM"}</div>
          </div>
        </div>
        {needsPay && (
          <div className="px-5 py-3 border-t border-amber-500/30 bg-butter/60 text-sm font-body text-amber-200">
            {a.payment_status === "rejected" ? (
              "The clinic couldn't verify your payment. Please send it again."
            ) : (
              <>
                {a.payment_due_at && <div className="text-base text-ink"><HoldCountdown dueAt={a.payment_due_at} /></div>}
                Your slot is held until you upload proof of payment
                {a.payment_due_at ? `, by ${new Date(a.payment_due_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "."}
              </>
            )}
          </div>
        )}
        {lapsed && (
          <div className="px-5 py-3 border-t border-rose-500/30 bg-blush/60 text-sm font-body text-rose-200">
            The time to pay ran out, so this slot is being released. Book again if you still need the visit.
          </div>
        )}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between gap-3">
          {needsPay ? <button onClick={() => setPayFor(a)} className={btn}>Upload proof of payment</button> : <span />}
          {["booked", "confirmed"].includes(a.status) && (
            <button onClick={() => cancel(a.id)} disabled={busyId === a.id} className="text-sm font-body text-rose-300 hover:underline underline-offset-4 disabled:opacity-50">
              {busyId === a.id ? "Cancelling…" : "Cancel visit"}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="fade-up">
      {payFor && (
        <PaymentProofModal
          appointment={payFor}
          userId={session.user.id}
          amount={payFor.doctors?.prepayment_amount || payFor.fee_charged}
          instructions={payFor.doctors?.payment_instructions}
          onClose={() => setPayFor(null)}
          onDone={() => { setPayFor(null); load(); }}
        />
      )}
      {error && <Notice tone="error" icon={AlertCircle} className="mb-6">We couldn't load your appointments. Check your connection, then reload the page.</Notice>}
      {cancelError && <Notice tone="error" icon={AlertCircle} className="mb-6">{cancelError}</Notice>}
      {loading ? (
        <div className="py-16 text-center text-slate-400 font-body">Loading your appointments…</div>
      ) : rows.length === 0 ? (
        !error && (
          <div className="rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center font-body">
            <div className="font-display text-2xl font-bold text-ink">No appointments yet</div>
            <p className="text-slate-300 mt-2">When you book a doctor, your clinic card shows up here with its stamps.</p>
          </div>
        )
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="font-display text-xl font-bold text-ink mb-4">Coming up <span className="text-slate-400 font-body font-normal text-base tnum">· {upcoming.length}</span></h2>
            {upcoming.length === 0 ? (
              <p className="text-slate-300 font-body">Nothing booked. Find a doctor to book your next visit.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-5">{upcoming.map((a) => <Card key={a.id} a={a} />)}</div>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold text-ink mb-3">Past visits</h2>
              <div className="rounded-xl border border-slate-700 bg-white">
                {past.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 border-b border-slate-800 last:border-0 font-body">
                    <div className="min-w-0">
                      <div className="text-ink truncate">{a.doctors?.profiles?.full_name || "Doctor"} <span className="text-slate-400">· {a.doctors?.specialty}</span></div>
                      <div className="text-sm text-slate-400 tnum">
                        {new Date(a.starts_at).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        {a.mode === "video" ? " · video" : a.location ? ` · ${a.location.name}` : ""}
                      </div>
                    </div>
                    <StatusMark status={a.payment_status === "expired" ? "expired" : a.status} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PatientPortal() {
  const [tab, setTab] = useState("find");
  const { session, profile, signOut } = useAuth();
  const [recordId, setRecordId] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from("patients").select("id").eq("profile_id", session.user.id).maybeSingle()
      .then(({ data }) => setRecordId(data?.id || null));
  }, [session?.user?.id]);

  return (
    <PatientAuthGate>
      <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-8 sm:pt-10">
        <div className="flex items-center justify-between gap-4 mb-5">
          <p className="font-body text-slate-300">Hi, <span className="text-ink font-semibold">{(profile?.full_name || "there").split(" ")[0]}</span></p>
          <button onClick={signOut} className="text-sm font-body text-slate-300 hover:text-ink flex items-center gap-1.5"><LogOut size={15} /> Log out</button>
        </div>
        <Tabs tabs={[["find", "Find a doctor"], ["mine", "My appointments"], ["forms", "Consent forms"]]} value={tab} onChange={setTab} />
      </div>
      {tab === "find" ? <PatientDirectory /> : (
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
          {tab === "mine"
            ? <MyAppointments />
            : <ConsentFormsPanel patientRecordId={recordId} userId={session?.user?.id} />}
        </div>
      )}
    </PatientAuthGate>
  );
}

function PatientDirectory() {
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("All");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [booking, setBooking] = useState(null);
  const [doctors, setDoctors] = useState(DOCTORS);
  const [isSample, setIsSample] = useState(true); // still showing the built-in DOCTORS
  const [loadError, setLoadError] = useState(null);
  const [liveSpecialties, setLiveSpecialties] = useState([]);

  useEffect(() => {
    supabase.from("specialties").select("name").eq("active", true).order("profession_type").order("sort_order")
      .then(({ data }) => { if (data && data.length > 0) setLiveSpecialties(["All", ...data.map((d) => d.name)]); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, specialty, specialties, consult_fee, telehealth_enabled, is_online, hospital, years_experience, require_prepayment, prepayment_amount, payment_instructions, prepayment_hold_minutes, profiles(full_name), locations:clinic_locations(id, name, address)");
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setLoadError(error?.message || null);
        return; // keep demo DOCTORS as fallback
      }
      setIsSample(false);
      setDoctors(
        data.map((d) => ({
          id: d.id,
          name: d.profiles?.full_name || "Unnamed doctor",
          specialty: d.specialty,
          specialties: d.specialties?.length ? d.specialties : (d.specialty ? [d.specialty] : []),
          // No review system yet: live doctors carry no rating rather
          // than a made-up one.
          rating: null,
          reviews: 0,
          fee: d.consult_fee,
          online: d.is_online,
          telehealth: d.telehealth_enabled,
          nextSlot: null,
          hospital: d.locations?.[0]?.name || d.hospital || "",
          locations: d.locations || [],
          exp: d.years_experience || 0,
          requirePrepayment: !!d.require_prepayment,
          prepayAmount: d.prepayment_amount ?? d.consult_fee,
          paymentInstructions: d.payment_instructions || "",
          holdMinutes: d.prepayment_hold_minutes || 1440,
        }))
      );
    })();
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(
    () =>
      doctors.filter(
        (d) =>
          (spec === "All" || d.specialties.includes(spec)) &&
          (!onlineOnly || d.online) &&
          (d.name + d.specialties.join(" ") + d.hospital).toLowerCase().includes(q.toLowerCase())
      ),
    [doctors, q, spec, onlineOnly]
  );
  const availableNow = doctors.filter((d) => d.online).length;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-10 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">Find a doctor</h1>
        <p className="font-body text-sm text-slate-300 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F8A57]" aria-hidden="true" /> {availableNow} available now
        </p>
      </div>
      {isSample && (
        <Notice tone={loadError ? "warn" : "info"} className="mb-6">
          {loadError
            ? "We couldn't reach 4MED, so these are sample doctors. Check your connection and reload to see real ones."
            : "These are sample doctors. Real listings appear here as practitioners join."}
        </Notice>
      )}

      {/* search + filters */}
      <div className="grid sm:grid-cols-[1fr_16rem_auto] gap-3 mb-8">
        <label className="relative block">
          <span className="sr-only">Search doctors</span>
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, specialty or hospital" className={inputCls + " pl-10"} />
        </label>
        <label className="block">
          <span className="sr-only">Specialty</span>
          <select value={spec} onChange={(e) => setSpec(e.target.value)} className={inputCls}>
            {(liveSpecialties.length > 0 ? liveSpecialties : SPECIALTIES).map((s) => (
              <option key={s} value={s}>{s === "All" ? "All specialties" : s}</option>
            ))}
          </select>
        </label>
        <Pill active={onlineOnly} onClick={() => setOnlineOnly(!onlineOnly)}>Available now</Pill>
      </div>

      {/* doctor cards: hovering one quiets the rest */}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 px-6 py-14 text-center font-body">
          <div className="font-display text-2xl font-bold text-ink">No doctors match</div>
          <p className="text-slate-300 mt-2">Try another specialty, or clear the search.</p>
          <button onClick={() => { setQ(""); setSpec("All"); setOnlineOnly(false); }} className={btnGhost + " mt-5"}>Clear filters</button>
        </div>
      ) : (
        <div className="group/grid grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((d) => (
            <article
              key={d.id}
              className="group/card rounded-xl border border-ink/20 bg-white overflow-hidden flex flex-col transition-[opacity,transform] duration-300 group-hover/grid:opacity-70 hover:!opacity-100 focus-within:!opacity-100 hover:-translate-y-1"
            >
              <div className={"px-5 pt-5 pb-4 border-b border-ink/15 flex items-start gap-3.5 " + tintForSpecialty(d.specialty)}>
                <Avatar name={d.name} tint="bg-white" online={d.online} />
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-lg text-ink leading-tight">{d.name}</h3>
                  <div className="text-sm text-slate-200 font-body mt-0.5">{d.specialties.join(" · ")}</div>
                </div>
              </div>
              <div className="px-5 py-4 space-y-2 text-sm font-body text-slate-200 flex-1">
                {d.hospital && <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" /> {d.hospital}</div>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
                  {d.rating && d.reviews > 0 && <span className="flex items-center gap-1"><Star size={14} className="text-amber-400 fill-current" /> {d.rating} <span className="text-slate-400">({d.reviews})</span></span>}
                  {d.exp > 0 && <span>{d.exp} yrs practice</span>}
                  {d.telehealth && <span className="flex items-center gap-1"><Video size={14} /> Video visits</span>}
                </div>
                {/* the card's back: opens on hover or focus, always open on phones */}
                <div className="grid grid-rows-[1fr] md:grid-rows-[0fr] md:group-hover/card:grid-rows-[1fr] md:group-focus-within/card:grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.16,1,.3,1)]">
                  <dl className="overflow-hidden">
                    <div className="pt-3 mt-1 border-t border-dashed border-slate-700 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5">
                      <dt className="field-label pt-0.5">Payment</dt>
                      <dd>{!d.requirePrepayment ? "Pay at the clinic" : prepayTerms(d).isDown ? `${peso(prepayTerms(d).now)} downpayment within ${holdText(d.holdMinutes)}, rest at the clinic` : `Pay ${peso(prepayTerms(d).now)} within ${holdText(d.holdMinutes)} to confirm`}</dd>
                      {d.locations?.length > 1 && (<>
                        <dt className="field-label pt-0.5">Clinics</dt>
                        <dd>{d.locations.map((l) => l.name).join(" · ")}</dd>
                      </>)}
                      <dt className="field-label pt-0.5">Visits</dt>
                      <dd>{d.telehealth ? "In clinic or by video" : "In clinic"}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-800">
                <div className="font-body">
                  <div className="text-ink font-semibold tnum">{peso(d.fee)}</div>
                  <div className="text-xs text-slate-400">{d.nextSlot ? `Next: ${d.nextSlot}` : "Consultation fee"}</div>
                </div>
                <button onClick={() => setBooking(d)} className={btn}>Book</button>
              </div>
            </article>
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

  if (loading) return <div className="max-w-md mx-auto px-6 py-24 text-center text-slate-400 font-body">Loading…</div>;

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
      <div className="max-w-md mx-auto px-5 sm:px-6 py-16 fade-up">
        <h1 className="font-display text-3xl font-bold text-ink">Admin login</h1>
        <p className="text-slate-300 font-body mt-1.5 mb-6">For 4MED platform administrators.</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><FieldLabel>Email</FieldLabel><input className={inputCls + " mt-1.5"} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></label>
          <label className="block"><FieldLabel>Password</FieldLabel><input className={inputCls + " mt-1.5"} type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required /></label>
          {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
          <button disabled={busy} className={btnLg + " w-full"}>{busy ? "Please wait…" : "Log in"}</button>
        </form>
      </div>
    );
  }

  if (profile.role !== "admin") {
    return (
      <div className="max-w-md mx-auto px-5 sm:px-6 py-16 fade-up">
        <Stamp tone="void" size="lg">Admins only</Stamp>
        <h1 className="font-display text-3xl font-bold text-ink mt-6">This page is for administrators</h1>
        <p className="text-slate-300 font-body mt-2">
          {profile.full_name} is signed in as {profile.role}. To promote an account, run the promote statement in medipulse-admin-patch.sql.
        </p>
        <button onClick={signOut} className={btnGhost + " mt-6"}>Log out and switch accounts</button>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState("subscriptions");
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

  const daysLeft = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d) - new Date()) / 86400000);
  };

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-10 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">Platform admin</h1>
        <button onClick={signOut} className="text-sm font-body text-slate-300 hover:text-ink flex items-center gap-1.5"><LogOut size={15} /> Log out</button>
      </div>

      <Tabs className="mb-8" tabs={[["subscriptions", "Subscriptions"], ["plans", "Plans"], ["invites", "Invites"], ["specialties", "Specialties"]]} value={tab} onChange={setTab} />

      {tab === "plans" && <PlansTab />}
      {tab === "invites" && <InvitesTab />}
      {tab === "specialties" && <SpecialtiesTab />}

      {tab === "subscriptions" && (
        <>
          {loadError && <Notice tone="error" icon={AlertCircle} className="mb-6">{loadError}</Notice>}

          {/* the ledger strip: four counts in one ruled row */}
          <dl className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-slate-700 bg-white mb-8">
            {[
              { label: "Monthly recurring revenue", value: peso(stats.mrr), sub: `+ ${peso(stats.trialMrr)} in trials` },
              { label: "Active subscriptions", value: stats.active, sub: `${stats.total} signups in all` },
              { label: "On a free trial", value: stats.trialing, sub: "14-day trials" },
              { label: "Licenses to check", value: stats.pendingLicenses, sub: "Waiting for PRC review" },
            ].map((s, i) => (
              <div key={s.label} className={"px-5 py-4 border-slate-800 " + (i % 2 === 0 ? "border-r " : "") + (i < 2 ? "border-b lg:border-b-0 " : "") + (i === 1 ? "lg:border-r" : "")}>
                <dt className="text-sm text-slate-300 font-body">{s.label}</dt>
                <dd className="queue-no text-4xl text-ink mt-1.5">{s.value}</dd>
                <dd className="text-xs text-slate-400 font-body mt-1">{s.sub}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-xl border border-slate-700 bg-white overflow-x-auto">
            <table className="w-full min-w-[760px] text-left font-body text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Doctor", "Specialty", "Plan", "Status", "PRC license"].map((h, i) => (
                    <th key={h} className={"field-label font-semibold px-5 py-3 " + (i === 4 ? "text-right" : "")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Loading subscriptions…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-300">No subscriptions yet. Doctors appear here as they sign up.</td></tr>
                ) : (
                  rows.map((r) => {
                    const left = r.status === "trialing" ? daysLeft(r.trial_ends_at) : null;
                    return (
                      <tr key={r.id} className="border-b border-slate-800 last:border-0">
                        <td className="px-5 py-3.5">
                          <div className="text-ink font-semibold">{r.doctors?.profiles?.full_name || "—"}</div>
                          <div className="text-xs text-slate-400 tnum">{peso(monthlyValue(r))}/mo · {r.billing_cycle === "annual" ? "yearly" : "monthly"}</div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-200">{r.doctors?.specialty || "—"}</td>
                        <td className="px-5 py-3.5 text-slate-200">{r.plans?.name || r.plan_id}</td>
                        <td className="px-5 py-3.5"><StatusMark status={r.status} label={r.status === "trialing" && left != null ? `Trial · ${left} days left` : undefined} /></td>
                        <td className="px-5 py-3.5 text-right">
                          {r.doctors?.license_verified ? (
                            <span className="inline-flex items-center gap-3"><span className="text-slate-300 tnum">{r.doctors.prc_license}</span><Stamp>Verified</Stamp></span>
                          ) : (
                            <button onClick={() => verify(r.doctors?.id)} disabled={verifying === r.doctors?.id} className={btnGhost}>
                              {verifying === r.doctors?.id ? "Verifying…" : `Verify ${r.doctors?.prc_license || "license"}`}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm text-slate-400 font-body">
            Recurring revenue counts active subscriptions only; trials are shown separately. A verified license marks the doctor as trusted in the patient directory.
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------ secretary join ------------------------- */

function StaffJoin({ go }) {
  const { signUp } = useAuth();
  const [f, setF] = useState({ code: "", name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await signUp({ email: f.email, password: f.password, fullName: f.name, role: "secretary" });
    if (error) { setError(error.message); setBusy(false); return; }
    const { error: rpcErr } = await supabase.rpc("redeem_invite", { invite_code: f.code.trim().toUpperCase() });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message.includes("Invalid") ? "That invite code is invalid or expired — ask your doctor for a new one. Your account was created; once you have a valid code, log in to the Clinic App and contact support to link it." : rpcErr.message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="max-w-md mx-auto px-5 sm:px-6 py-12 sm:py-16 fade-up">
      <div className="rounded-xl border border-ink/20 bg-white overflow-hidden">
        <div className="bg-mint px-6 py-5 border-b border-ink/15 flex items-start justify-between gap-4">
          <div>
            <FieldLabel>Clinic staff</FieldLabel>
            <h1 className="font-display text-3xl font-bold text-ink mt-1">{done ? "You're on the team" : "Join a practice"}</h1>
          </div>
          {done && <Stamp press size="lg" tilt={-6}>Joined</Stamp>}
        </div>
        {done ? (
          <div className="px-6 py-6 font-body">
            <p className="text-slate-200">Your secretary account is linked to the practice. You can register patients, run appointments and the queue, and take payments.</p>
            <button onClick={() => go("app")} className={btn + " mt-6"}>Open the Clinic App <ArrowRight size={16} /></button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-6 space-y-4">
            <p className="text-slate-300 font-body text-sm">Ask your doctor for the invite code from their Practice settings.</p>
            <label className="block"><FieldLabel>Invite code</FieldLabel><input className={inputCls + " mt-1.5 tracking-[0.25em] uppercase font-semibold"} value={f.code} onChange={(e) => setF((p) => ({ ...p, code: e.target.value }))} required /></label>
            <label className="block"><FieldLabel>Full name</FieldLabel><input className={inputCls + " mt-1.5"} autoComplete="name" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} required /></label>
            <label className="block"><FieldLabel>Email</FieldLabel><input className={inputCls + " mt-1.5"} type="email" autoComplete="email" value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} required /></label>
            <label className="block"><FieldLabel>Password</FieldLabel><input className={inputCls + " mt-1.5"} type="password" autoComplete="new-password" placeholder="At least 6 characters" value={f.password} onChange={(e) => setF((p) => ({ ...p, password: e.target.value }))} required minLength={6} /></label>
            {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}
            <button disabled={busy} className={btnLg + " w-full"}>{busy ? "Joining…" : "Create account and join"}</button>
          </form>
        )}
      </div>
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

const SITE_NAV = [
  ["landing", "Home"],
  ["patient", "Book a doctor"],
  ["doctor", "For practitioners"],
  ["app", "Clinic App"],
];

function AppShell() {
  const { session, profile, signOut } = useAuth();
  // Dev-only: `?view=patient|doctor|app` opens a view directly, alongside
  // the `?demo=` sign-in in AuthContext, for previews and screenshots.
  const [view, setView] = useState(() =>
    (import.meta.env.DEV && new URLSearchParams(window.location.search).get("view")) || "landing"
  );
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const go = (v) => {
    setView(v);
    setNavOpen(false);
    setAccountOpen(false);
    window.scrollTo({ top: 0 });
  };

  if (view === "app") {
    return (
      <div className="min-h-screen bg-ground text-ink font-body">
        <StaffApp AdminPortal={AdminPortal} onExitToSite={() => go("landing")} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground text-ink font-body flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:rounded-md">Skip to content</a>

      {/* nav */}
      <nav className="sticky top-0 z-40 bg-ground border-b border-slate-800" aria-label="Main">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-6 relative">
          <button onClick={() => go("landing")} className="flex items-center gap-2.5 shrink-0" aria-label="4MED home">
            <LogoMark size={30} />
            <span className="font-display font-extrabold text-xl text-ink">4MED</span>
          </button>

          {/* desktop nav */}
          <div className="hidden md:flex items-center gap-7 h-full">
            {SITE_NAV.map(([id, label]) => (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={view === id ? "page" : undefined}
                className={
                  "h-full flex items-center text-sm font-body border-b-2 -mb-px transition-colors " +
                  (view === id ? "border-ink text-ink font-semibold" : "border-transparent text-slate-300 hover:text-ink")
                }
              >
                {label}
              </button>
            ))}
            {session && profile && (
              <div className="relative">
                <button
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-expanded={accountOpen}
                  className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-slate-700 bg-white text-sm font-body text-ink hover:border-ink transition-colors"
                >
                  <Avatar name={profile.full_name} size={26} tint={profile.role === "patient" ? "bg-sky" : "bg-mint"} />
                  <span className="max-w-[10rem] truncate">{profile.full_name}</span>
                </button>
                {accountOpen && (
                  <div className="absolute top-full right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-white shadow-[0_14px_30px_-12px_rgba(19,48,94,0.35)] overflow-hidden fade-up z-50">
                    <div className="px-4 py-3 border-b border-slate-800">
                      <div className="text-sm text-ink font-semibold truncate">{profile.full_name}</div>
                      <div className="text-xs text-slate-400 capitalize">{profile.role}</div>
                    </div>
                    <button onClick={() => go(profile.role === "patient" ? "patient" : "app")} className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-ground transition-colors">
                      {profile.role === "patient" ? "My appointments" : "Clinic App"}
                    </button>
                    <button onClick={() => { setAccountOpen(false); signOut(); }} className="w-full text-left px-4 py-2.5 text-sm text-rose-300 hover:bg-ground transition-colors border-t border-slate-800">
                      Log out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* mobile menu */}
          <button
            onClick={() => setNavOpen((o) => !o)}
            className="md:hidden w-11 h-11 -mr-2 rounded-md flex items-center justify-center text-ink"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
          >
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {navOpen && (
            <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-700 shadow-[0_14px_30px_-12px_rgba(19,48,94,0.35)] fade-up">
              {session && profile && (
                <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-ink font-semibold">{profile.full_name}</div>
                    <div className="text-xs text-slate-400 capitalize">{profile.role}</div>
                  </div>
                  <button onClick={() => { setNavOpen(false); signOut(); }} className="text-sm text-rose-300">Log out</button>
                </div>
              )}
              {SITE_NAV.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => go(id)}
                  className={"w-full text-left px-5 py-4 text-base font-body border-b border-slate-800 last:border-0 " + (view === id ? "text-ink font-semibold bg-sky/50" : "text-slate-200")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      <main id="main" className="flex-1">
        {view === "landing" && <Landing go={go} />}
        {view === "doctor" && <DoctorSignup go={go} />}
        {view === "staffjoin" && <StaffJoin go={go} />}
        {view === "patient" && <PatientPortal />}
      </main>

      <footer className="border-t border-slate-800 mt-16">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm font-body text-slate-400">
          <span className="flex items-center gap-2"><LogoMark size={20} /> 4MED · clinic management for Philippine practices</span>
          <span>Health data handled under the Data Privacy Act of 2012</span>
        </div>
      </footer>
    </div>
  );
}
