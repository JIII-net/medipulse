import React, { useState, useEffect } from "react";
import { Check, Brain, ClipboardList, AlertTriangle, Activity, NotebookPen } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/*  Mental Health — PHQ-9 / GAD-7 screeners with trend, mental status  */
/*  exam, risk assessment, and therapy session notes. Shown in the     */
/*  consult workspace for psychiatrists and psychologists.             */
/* ------------------------------------------------------------------ */

const selectCls = "rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-body focus:outline-none focus:border-teal-400 disabled:opacity-50";
const inputCls = selectCls + " placeholder-slate-500 w-full";
const areaCls = inputCls + " min-h-20 resize-y";
const cardCls = "rounded-3xl border border-slate-800 bg-slate-900 p-5 mb-5";

/* ----------------------------- screeners --------------------------- */

// PHQ-9 and GAD-7 are free to use, reproduce and distribute — no licence
// or permission required. Wording kept verbatim; changing it invalidates
// the published severity bands.
const FREQ = [
  ["0", "Not at all"],
  ["1", "Several days"],
  ["2", "More than half the days"],
  ["3", "Nearly every day"],
];

const PHQ9 = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the newspaper or watching television",
  "Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead, or of hurting yourself in some way",
];

const GAD7 = [
  "Feeling nervous, anxious, or on edge",
  "Not being able to stop or control worrying",
  "Worrying too much about different things",
  "Trouble relaxing",
  "Being so restless that it is hard to sit still",
  "Becoming easily annoyed or irritable",
  "Feeling afraid, as if something awful might happen",
];

// The item index whose any-positive answer means the patient has endorsed
// thoughts of self-harm. Never let this pass silently.
const PHQ9_RISK_ITEM = 8;

const phq9Severity = (t) =>
  t <= 4 ? { label: "Minimal", tone: "text-slate-300" }
  : t <= 9 ? { label: "Mild", tone: "text-teal-300" }
  : t <= 14 ? { label: "Moderate", tone: "text-amber-300" }
  : t <= 19 ? { label: "Moderately severe", tone: "text-orange-300" }
  : { label: "Severe", tone: "text-rose-300" };

const gad7Severity = (t) =>
  t <= 4 ? { label: "Minimal", tone: "text-slate-300" }
  : t <= 9 ? { label: "Mild", tone: "text-teal-300" }
  : t <= 14 ? { label: "Moderate", tone: "text-amber-300" }
  : { label: "Severe", tone: "text-rose-300" };

const INSTRUMENTS = {
  phq9: { label: "PHQ-9 — Depression", items: PHQ9, max: 27, severity: phq9Severity, stem: "Over the last 2 weeks, how often have you been bothered by any of the following problems?" },
  gad7: { label: "GAD-7 — Anxiety", items: GAD7, max: 21, severity: gad7Severity, stem: "Over the last 2 weeks, how often have you been bothered by the following problems?" },
};

/* ------------------------- mental status exam ---------------------- */

const MSE_FIELDS = [
  ["appearance", "Appearance & grooming", ["Well-groomed", "Casual, appropriate", "Dishevelled", "Poor hygiene", "Inappropriate for weather/setting"]],
  ["behavior", "Behaviour & psychomotor", ["Calm, cooperative", "Restless", "Agitated", "Psychomotor retardation", "Guarded", "Uncooperative"]],
  ["speech", "Speech", ["Normal rate & volume", "Soft / slow", "Loud / pressured", "Slurred", "Minimal / monosyllabic", "Mute"]],
  ["affect", "Affect", ["Euthymic", "Constricted", "Blunted", "Flat", "Labile", "Tearful", "Irritable", "Anxious", "Elevated"]],
  ["thought_process", "Thought process", ["Linear & goal-directed", "Circumstantial", "Tangential", "Flight of ideas", "Loose associations", "Thought blocking"]],
  ["thought_content", "Thought content", ["No abnormality", "Preoccupations", "Obsessions", "Ruminations", "Paranoid ideation", "Delusions", "Ideas of reference"]],
  ["perception", "Perception", ["No hallucinations", "Auditory hallucinations", "Visual hallucinations", "Other hallucinations", "Illusions", "Depersonalisation / derealisation"]],
  ["cognition", "Cognition & orientation", ["Alert, oriented x3", "Mildly impaired attention", "Impaired recent memory", "Disoriented", "Requires formal testing"]],
  ["insight", "Insight", ["Good", "Fair", "Limited", "Poor", "Absent"]],
  ["judgment", "Judgment", ["Intact", "Mildly impaired", "Impaired", "Severely impaired"]],
];

/* --------------------------- risk assessment ----------------------- */

const IDEATION = [
  ["none", "None reported"],
  ["passive", "Passive — wishes to be dead / not wake up"],
  ["active_no_plan", "Active — thoughts of suicide, no plan"],
  ["active_with_plan", "Active — with a plan"],
  ["active_with_intent", "Active — with plan and intent"],
];

const RISK_META = {
  none: { label: "None", chip: "bg-slate-700/40 border-slate-600 text-slate-300" },
  low: { label: "Low", chip: "bg-teal-400/15 border-teal-400/40 text-teal-200" },
  moderate: { label: "Moderate", chip: "bg-amber-500/15 border-amber-500/40 text-amber-200" },
  high: { label: "High", chip: "bg-rose-500/15 border-rose-500/40 text-rose-200" },
};

const SESSION_FIELDS = [
  ["presenting_concerns", "Presenting concerns", "What the patient brought to this session…"],
  ["interventions", "Interventions used", "CBT thought record, behavioural activation, motivational interviewing, psychoeducation…"],
  ["patient_response", "Patient response", "How they engaged and responded to the interventions…"],
  ["homework", "Homework / between-session tasks", "Agreed practice before the next session…"],
  ["goals_plan", "Goals & plan", "Treatment goals, progress toward them, plan for next session…"],
];

const EMPTY = {
  ...Object.fromEntries(MSE_FIELDS.map(([k]) => [k, ""])),
  mood: "",
  mse_notes: "",
  risk_level: "none",
  suicidal_ideation: "none",
  self_harm: "",
  harm_to_others: "",
  protective_factors: "",
  safety_plan: "",
  ...Object.fromEntries(SESSION_FIELDS.map(([k]) => [k, ""])),
};

/* ------------------------------ sparkline -------------------------- */

function ScoreTrend({ rows, instrument, encounterId }) {
  const pts = rows.filter((r) => r.instrument === instrument);
  if (pts.length === 0) return null;
  const meta = INSTRUMENTS[instrument];
  const W = 260, H = 60, PAD = 6;
  const x = (i) => (pts.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (pts.length - 1));
  const y = (v) => H - PAD - ((Number(v) / meta.max) * (H - 2 * PAD));
  return (
    <div className="mt-3">
      <div className="text-xs font-mono2 text-slate-500 mb-1">TREND</div>
      {pts.length > 1 && (
        <svg width={W} height={H} className="overflow-visible">
          <polyline points={pts.map((r, i) => `${x(i)},${y(r.total)}`).join(" ")} fill="none" stroke="#2dd4bf" strokeWidth="1.5" />
          {pts.map((r, i) => (
            <circle key={r.id} cx={x(i)} cy={y(r.total)} r={r.encounter_id === encounterId ? 3.5 : 2.5} fill="#2dd4bf" />
          ))}
        </svg>
      )}
      <div className="flex flex-wrap gap-3 mt-1">
        {pts.map((r) => (
          <span key={r.id} className={"text-xs font-mono2 " + (r.encounter_id === encounterId ? "text-teal-300" : "text-slate-500")}>
            {new Date(r.recorded_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}: {r.total}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ screener --------------------------- */

function Screener({ instrument, history, encounterId, signed, onSave, busy }) {
  const meta = INSTRUMENTS[instrument];
  const alreadyThisVisit = history.find((r) => r.instrument === instrument && r.encounter_id === encounterId);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState(() => meta.items.map(() => ""));

  const answered = answers.filter((a) => a !== "").length;
  const complete = answered === meta.items.length;
  const total = answers.reduce((s, a) => s + (Number(a) || 0), 0);
  const sev = meta.severity(total);
  const flagged = instrument === "phq9" && Number(answers[PHQ9_RISK_ITEM] || 0) > 0;

  const save = async () => {
    const ok = await onSave(instrument, answers, total, sev.label, flagged);
    if (ok) { setAnswers(meta.items.map(() => "")); setOpen(false); }
  };

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-display font-semibold text-slate-100 flex items-center gap-2">
          <ClipboardList size={15} className="text-teal-300" /> {meta.label}
        </div>
        {alreadyThisVisit ? (
          <span className="text-sm font-body text-slate-300">
            This visit: <strong className="font-mono2">{alreadyThisVisit.total}</strong>/{meta.max}
            <span className={"ml-2 " + meta.severity(alreadyThisVisit.total).tone}>{alreadyThisVisit.severity}</span>
          </span>
        ) : !signed && (
          <button onClick={() => setOpen((o) => !o)} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors">
            {open ? "Close" : "Administer"}
          </button>
        )}
      </div>

      {open && !alreadyThisVisit && !signed && (
        <div className="mt-4">
          <p className="text-sm text-slate-400 font-body mb-3">{meta.stem}</p>
          {meta.items.map((q, i) => (
            <div key={i} className={"py-2.5 border-b border-slate-800/60 " + (i === PHQ9_RISK_ITEM && instrument === "phq9" ? "bg-rose-500/5 -mx-2 px-2 rounded-lg" : "")}>
              <div className="text-sm text-slate-200 font-body mb-1.5">{i + 1}. {q}</div>
              <div className="flex flex-wrap gap-1.5">
                {FREQ.map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? val : x)))}
                    className={
                      "px-3 py-1 rounded-full text-xs font-body border transition-colors " +
                      (answers[i] === val ? "bg-teal-400 text-slate-950 border-teal-400 font-medium" : "bg-slate-900 text-slate-400 border-slate-700 hover:border-teal-500/60")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {flagged && (
            <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 font-body flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>The patient endorsed item 9 (thoughts of being better off dead or of self-harm). Complete the risk assessment below before finishing this visit.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button onClick={save} disabled={!complete || busy} className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60 flex items-center gap-1.5">
              <Check size={14} /> {busy ? "Saving…" : "Save score"}
            </button>
            <span className="text-sm font-body text-slate-400">
              {answered}/{meta.items.length} answered
              {complete && <> · total <strong className="font-mono2 text-slate-200">{total}</strong>/{meta.max} · <span className={sev.tone}>{sev.label}</span></>}
            </span>
          </div>
        </div>
      )}

      <ScoreTrend rows={history} instrument={instrument} encounterId={encounterId} />
    </div>
  );
}

/* ------------------------------- main ------------------------------ */

export default function MentalHealthChart({ patient, encounterId, me, signed, isPsychologist }) {
  const [f, setF] = useState(EMPTY);
  const [rowId, setRowId] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const [a, s] = await Promise.all([
      supabase.from("mh_assessments").select("*").eq("encounter_id", encounterId).maybeSingle(),
      supabase.from("mh_screenings").select("*").eq("patient_record_id", patient.id).order("recorded_at"),
    ]);
    if (a.error || s.error) { setError((a.error || s.error).message); return; }
    if (a.data) {
      setRowId(a.data.id);
      const next = { ...EMPTY };
      Object.keys(EMPTY).forEach((k) => { next[k] = a.data[k] ?? EMPTY[k]; });
      setF(next);
    }
    setHistory(s.data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patient.id, encounterId]);

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setSaved(false); };

  const saveScreening = async (instrument, answers, total, severity, flagged) => {
    setBusy(true); setError(null);
    const { error } = await supabase.from("mh_screenings").insert({
      patient_record_id: patient.id,
      encounter_id: encounterId,
      instrument,
      responses: answers.map(Number),
      total,
      severity,
      recorded_by: me,
    });
    setBusy(false);
    if (error) { setError(error.message); return false; }
    // Endorsing self-harm on item 9 pulls the risk level up rather than
    // leaving it at whatever it was — the clinician can still adjust it,
    // but it must never stay "none" silently.
    if (flagged && (f.risk_level === "none" || !f.risk_level)) {
      setF((x) => ({ ...x, risk_level: "moderate", suicidal_ideation: x.suicidal_ideation === "none" ? "passive" : x.suicidal_ideation }));
    }
    load();
    return true;
  };

  const saveAssessment = async () => {
    setBusy(true); setError(null); setSaved(false);
    const payload = { ...f };
    let err;
    if (rowId) {
      ({ error: err } = await supabase.from("mh_assessments").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", rowId));
    } else {
      const { data, error: e2 } = await supabase.from("mh_assessments")
        .insert({ ...payload, encounter_id: encounterId, patient_record_id: patient.id, recorded_by: me })
        .select("id").single();
      err = e2;
      if (data) setRowId(data.id);
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    load();
  };

  const risk = RISK_META[f.risk_level] || RISK_META.none;
  const riskElevated = ["moderate", "high"].includes(f.risk_level);

  return (
    <div>
      {error && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">{error}</div>
      )}

      <Screener instrument="phq9" history={history} encounterId={encounterId} signed={signed} onSave={saveScreening} busy={busy} />
      <Screener instrument="gad7" history={history} encounterId={encounterId} signed={signed} onSave={saveScreening} busy={busy} />

      {/* risk assessment — first, because it matters most */}
      <div className={"rounded-3xl border p-5 mb-5 " + (riskElevated ? "border-rose-500/40 bg-rose-500/5" : "border-slate-800 bg-slate-900")}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="font-display font-semibold text-slate-100 flex items-center gap-2">
            <AlertTriangle size={15} className={riskElevated ? "text-rose-300" : "text-teal-300"} /> Risk assessment
          </div>
          <span className={"px-3 py-1 rounded-full border text-xs font-body " + risk.chip}>{risk.label} risk</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-mono2 text-slate-500 mb-1 block">SUICIDAL IDEATION</label>
            <select className={selectCls + " w-full"} value={f.suicidal_ideation} onChange={set("suicidal_ideation")} disabled={signed}>
              {IDEATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono2 text-slate-500 mb-1 block">OVERALL RISK LEVEL</label>
            <select className={selectCls + " w-full"} value={f.risk_level} onChange={set("risk_level")} disabled={signed}>
              {Object.entries(RISK_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input className={inputCls} placeholder="Self-harm — history, recency, method" value={f.self_harm} onChange={set("self_harm")} disabled={signed} />
          <input className={inputCls} placeholder="Risk of harm to others" value={f.harm_to_others} onChange={set("harm_to_others")} disabled={signed} />
        </div>
        <input className={inputCls + " mb-3"} placeholder="Protective factors — family, faith, treatment engagement, reasons for living…" value={f.protective_factors} onChange={set("protective_factors")} disabled={signed} />
        <div>
          <label className="text-xs font-mono2 text-slate-500 mb-1 block">SAFETY PLAN</label>
          <textarea className={areaCls} placeholder="Warning signs, coping strategies, people to contact, means restriction, crisis numbers…" value={f.safety_plan} onChange={set("safety_plan")} disabled={signed} />
        </div>
        {riskElevated && !f.safety_plan.trim() && (
          <p className="text-xs text-rose-300 font-body mt-2">Risk is {risk.label.toLowerCase()} — document a safety plan before signing.</p>
        )}
      </div>

      {/* mental status exam */}
      <div className={cardCls}>
        <div className="font-display font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Brain size={15} className="text-teal-300" /> Mental status exam
        </div>
        <div className="mb-3">
          <label className="text-xs font-mono2 text-slate-500 mb-1 block">MOOD (PATIENT'S OWN WORDS)</label>
          <input className={inputCls} placeholder={'e.g. "I feel empty most days"'} value={f.mood} onChange={set("mood")} disabled={signed} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {MSE_FIELDS.map(([key, label, options]) => (
            <div key={key}>
              <label className="text-xs font-mono2 text-slate-500 mb-1 block">{label.toUpperCase()}</label>
              <select className={selectCls + " w-full"} value={f[key]} onChange={set(key)} disabled={signed}>
                <option value="">—</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="text-xs font-mono2 text-slate-500 mb-1 block">ADDITIONAL OBSERVATIONS</label>
          <textarea className={areaCls} placeholder="Anything the dropdowns don't capture…" value={f.mse_notes} onChange={set("mse_notes")} disabled={signed} />
        </div>
      </div>

      {/* session note */}
      <div className={cardCls}>
        <div className="font-display font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <NotebookPen size={15} className="text-teal-300" /> {isPsychologist ? "Therapy session note" : "Session note"}
        </div>
        {SESSION_FIELDS.map(([key, label, ph]) => (
          <div key={key} className="mb-3 last:mb-0">
            <label className="text-xs font-mono2 text-slate-500 mb-1 block">{label.toUpperCase()}</label>
            <textarea className={areaCls} placeholder={ph} value={f[key]} onChange={set(key)} disabled={signed} />
          </div>
        ))}
      </div>

      {!signed && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={saveAssessment} disabled={busy} className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60 flex items-center gap-1.5">
            <Check size={14} /> {busy ? "Saving…" : "Save mental health assessment"}
          </button>
          {saved && <span className="text-xs text-teal-300 font-body">Saved ✓</span>}
          <span className="text-xs text-slate-500 font-body flex items-center gap-1.5">
            <Activity size={12} /> Screener scores save separately, as each one is administered.
          </span>
        </div>
      )}
    </div>
  );
}
