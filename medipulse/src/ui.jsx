import React, { useEffect, useRef, useState } from "react";
import { PROFESSIONS } from "./lib/professions";

/* ------------------------------------------------------------------ */
/*  Clinic Card primitives                                             */
/*                                                                     */
/*  Shared pieces of the 4MED look: profession card-stock tints, the   */
/*  rubber stamp that marks a state change, the printed field label,   */
/*  and the button set. Styling details live in theme.css; these keep  */
/*  the vocabulary in one place so every module stamps the same way.   */
/* ------------------------------------------------------------------ */

/* ---------------------- profession card stock --------------------- */

// Each profession gets its own card-stock colour, the way clinics in a
// medical arts building hand out differently coloured cards.
export const PROFESSION_TINT = {
  doctor: "bg-sky",
  dentist: "bg-mint",
  ophthalmologist: "bg-butter",
  psychiatrist: "bg-lilac",
  psychologist: "bg-blush",
};

export function professionOfSpecialty(specialty) {
  const hit = PROFESSIONS.find((p) => p.specialties.includes(specialty));
  return hit ? hit.id : "doctor";
}

export const tintForProfession = (id) => PROFESSION_TINT[id] || PROFESSION_TINT.doctor;
export const tintForSpecialty = (specialty) => tintForProfession(professionOfSpecialty(specialty));

/* ------------------------------ buttons ---------------------------- */

export const btn =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-ink text-white text-sm font-body font-semibold hover:bg-teal-600 active:translate-y-px transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnLg =
  "inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-ink text-white text-base font-body font-semibold hover:bg-teal-600 active:translate-y-px transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-ink/70 text-ink text-sm font-body font-semibold hover:bg-ink hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnGhostLg =
  "inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg border border-ink/70 text-ink text-base font-body font-semibold hover:bg-ink hover:text-white transition-colors";
export const btnQuiet =
  "inline-flex items-center gap-1.5 text-sm font-body font-medium text-teal-300 hover:text-ink underline-offset-4 hover:underline disabled:opacity-50";

export const inputCls =
  "w-full rounded-lg bg-white border border-slate-700 px-3.5 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-ink focus:ring-2 focus:ring-sky";

// The denser set the Clinic App modules use: same look, smaller step.
export const inputSm =
  "w-full rounded-md bg-white border border-slate-700 px-3 py-2 text-sm text-ink font-body placeholder-slate-500 focus:outline-none focus:border-ink focus:ring-2 focus:ring-sky disabled:opacity-60 disabled:bg-ground";
export const selectSm =
  "rounded-md bg-white border border-slate-700 px-3 py-2 text-sm text-ink font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-sky disabled:opacity-60 disabled:bg-ground";
export const btnSm =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-ink text-white text-sm font-body font-semibold hover:bg-teal-600 active:translate-y-px transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnGhostSm =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-700 bg-white text-ink text-sm font-body font-medium hover:border-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const panel = "rounded-xl border border-slate-700 bg-white p-5";
export const labelCls = "field-label mb-1.5 block";
export const modalCard =
  "w-full rounded-xl bg-white p-6 card-deal shadow-[0_24px_60px_-20px_rgba(19,48,94,0.5)]";

/* ------------------------------ labels ----------------------------- */

export function FieldLabel({ children, className = "", as: Tag = "div", ...rest }) {
  return <Tag className={"field-label " + className} {...rest}>{children}</Tag>;
}

/* ------------------------------ stamps ----------------------------- */

export function Stamp({ children, tone = "violet", size, press, tilt, className = "" }) {
  const toneCls = { violet: "", void: " stamp-void", ink: " stamp-ink", link: " stamp-link" }[tone] || "";
  return (
    <span
      className={"stamp" + toneCls + (size === "lg" ? " stamp-lg" : size === "md" ? " stamp-md" : "") + (press ? " stamp-press" : "") + " " + className}
      style={tilt != null ? { "--stamp-tilt": `${tilt}deg` } : undefined}
    >
      {children}
    </span>
  );
}

export function Pending({ children, className = "" }) {
  return <span className={"pending-mark " + className}>{children}</span>;
}

// Every status the app knows, split into the ones that get inked (an
// action happened: paid, checked in, signed) and the ones still waiting
// on someone (a printed blank, not a stamp).
const MARKS = {
  // appointment lifecycle
  booked: { pending: "Booked" },
  confirmed: { stamp: "Confirmed" },
  checked_in: { stamp: "Checked in" },
  in_progress: { stamp: "With doctor", tone: "link" },
  completed: { stamp: "Done", tone: "ink" },
  canceled: { stamp: "Cancelled", tone: "void" },
  cancelled: { stamp: "Cancelled", tone: "void" },
  no_show: { stamp: "No-show", tone: "void" },
  // payment
  not_required: null,
  awaiting_payment: { pending: "Awaiting payment" },
  proof_submitted: { pending: "Checking payment" },
  verified: { stamp: "Paid" },
  paid: { stamp: "Paid" },
  rejected: { stamp: "Payment rejected", tone: "void" },
  // queue
  waiting: { pending: "Waiting" },
  called: { stamp: "Called", tone: "link" },
  serving: { stamp: "With doctor", tone: "link" },
  done: { stamp: "Done", tone: "ink" },
  skipped: { stamp: "Skipped", tone: "void" },
  // consent / documents
  signed: { stamp: "Signed" },
  unsigned: { pending: "Not signed" },
  // invoices
  draft: { pending: "Draft" },
  final: { pending: "Unpaid" },
  partially_paid: { stamp: "Part paid", tone: "link" },
  void: { stamp: "Void", tone: "void" },
  // outbox
  pending: { pending: "Queued" },
  sent: { stamp: "Sent", tone: "ink" },
  failed: { stamp: "Failed", tone: "void" },
  // subscriptions
  trialing: { pending: "Trial" },
  active: { stamp: "Active" },
  past_due: { stamp: "Past due", tone: "void" },
};

export function StatusMark({ status, label, size, className = "" }) {
  const mark = MARKS[status];
  const prev = useRef(status);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (prev.current !== status) {
      prev.current = status;
      setPressed(true);
    }
  }, [status]);

  if (mark === null) return null;
  if (!mark) {
    const text = label || String(status || "").replace(/_/g, " ");
    return text ? <Pending className={className}>{text}</Pending> : null;
  }
  if (mark.pending) return <Pending className={className}>{label || mark.pending}</Pending>;
  return (
    <Stamp key={status} tone={mark.tone} size={size} press={pressed} className={className}>
      {label || mark.stamp}
    </Stamp>
  );
}

/* ------------------------------ avatar ----------------------------- */

export function Avatar({ name = "", tint = "bg-sky", size = 48, online }) {
  const initials = name
    .replace(/^(Dr|Dra|Doc)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={"w-full h-full rounded-lg border border-ink/15 flex items-center justify-center text-ink font-bold " + tint}
        style={{ fontSize: size * 0.36, fontStretch: "75%" }}
        aria-hidden="true"
      >
        {initials}
      </div>
      {online != null && (
        <span
          className={"absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white " + (online ? "bg-[#2F8A57]" : "bg-slate-600")}
          title={online ? "Available now" : "Not available now"}
        />
      )}
    </div>
  );
}

/* ------------------------------ notices ---------------------------- */

export function Notice({ tone = "info", icon: Icon, children, className = "" }) {
  const cls = {
    info: "bg-sky/60 border-ink/15 text-ink",
    warn: "bg-butter/70 border-amber-500/40 text-amber-200",
    error: "bg-blush/70 border-rose-500/30 text-rose-200",
    ok: "bg-mint/70 border-ink/15 text-ink",
  }[tone];
  return (
    <div className={"flex items-start gap-2.5 text-sm font-body rounded-lg border px-4 py-3 " + cls + " " + className}>
      {Icon && <Icon size={16} className="mt-0.5 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ---------------------------- tab strip ---------------------------- */

// Underline tabs: the module's own sections. A hairline runs the whole
// width; the active tab sits on it in ink.
export function Tabs({ tabs, value, onChange, className = "" }) {
  return (
    <div role="tablist" className={"flex gap-6 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_#DDE2E8] " + className}>
      {tabs.map(([id, label]) => {
        const on = value === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={
              "relative pb-3 pt-1 text-sm font-body whitespace-nowrap transition-colors border-b-2 " +
              (on ? "border-ink text-ink font-semibold" : "border-transparent text-slate-400 hover:text-ink")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
