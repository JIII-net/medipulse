import React, { useState, useEffect } from "react";
import { X, Check, Printer, Eye, Activity, Glasses } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { printDocument, esc } from "./lib/print";

/* ------------------------------------------------------------------ */
/*  Eye Exam — visual acuity, IOP with trend, refraction, per-eye      */
/*  findings. Shown in the Doctor Portal consult workspace for         */
/*  ophthalmologists (analog of the dentists' DentalChart).            */
/* ------------------------------------------------------------------ */

const SNELLEN = ["20/20", "20/25", "20/30", "20/40", "20/50", "20/60", "20/70", "20/80", "20/100", "20/200", "20/400", "CF", "HM", "LP", "NLP"];

const EYES = { OD: "Right eye (OD)", OS: "Left eye (OS)" };

const CONDITION_META = {
  normal: { label: "Normal", color: "#1e293b", border: "#475569", text: "#94a3b8" },
  refractive_error: { label: "Refractive error", color: "#164e63", border: "#22d3ee", text: "#a5f3fc" },
  cataract: { label: "Cataract", color: "#78350f", border: "#fbbf24", text: "#fde68a" },
  glaucoma_suspect: { label: "Glaucoma suspect", color: "#7c2d12", border: "#fb923c", text: "#fed7aa" },
  glaucoma: { label: "Glaucoma", color: "#7f1d1d", border: "#f87171", text: "#fecaca" },
  dry_eye: { label: "Dry eye", color: "#134e4a", border: "#2dd4bf", text: "#99f6e4" },
  conjunctivitis: { label: "Conjunctivitis", color: "#701a75", border: "#e879f9", text: "#f5d0fe" },
  pterygium: { label: "Pterygium", color: "#365314", border: "#a3e635", text: "#d9f99d" },
  diabetic_retinopathy: { label: "Diabetic retinopathy", color: "#4c1d95", border: "#a78bfa", text: "#ddd6fe" },
  macular_degeneration: { label: "Macular degeneration", color: "#581c87", border: "#c084fc", text: "#f3e8ff" },
  corneal_abrasion: { label: "Corneal abrasion", color: "#7c2d12", border: "#f97316", text: "#ffedd5" },
  other: { label: "Other", color: "#1c1917", border: "#78716c", text: "#d6d3d1" },
};

// +2.00 / -0.75 style — plus lenses conventionally carry an explicit sign
const fmtDiopter = (v) => (v == null || v === "" ? "—" : (Number(v) > 0 ? "+" : "") + Number(v).toFixed(2));

const IOP_ALERT = 21; // mmHg — conventional upper limit of normal

const selectCls = "rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-body focus:outline-none focus:border-teal-400 disabled:opacity-50";
const inputCls = selectCls + " placeholder-slate-500 w-full";

function EyeIcon({ eye, status, selected, onClick }) {
  const meta = CONDITION_META[status] || CONDITION_META.normal;
  return (
    <button
      onClick={() => onClick(eye)}
      className="flex flex-col items-center gap-1 group"
      title={`${EYES[eye]} — ${meta.label}`}
    >
      <div className={"transition-transform group-hover:scale-105 " + (selected ? "drop-shadow-[0_0_8px_rgba(45,212,191,0.6)]" : "")}>
        <svg width="120" height="70" viewBox="0 0 120 70" className="overflow-visible">
          <path
            d="M10 35 Q60 -2 110 35 Q60 72 10 35 Z"
            fill="#0f172a"
            stroke={selected ? "#2dd4bf" : meta.border}
            strokeWidth={selected ? 2.5 : 1.5}
          />
          <circle cx="60" cy="35" r="17" fill={meta.color} stroke={meta.border} strokeWidth="1.5" />
          <circle cx="60" cy="35" r="7.5" fill="#020617" />
          <circle cx="55" cy="30" r="2.5" fill="#e2e8f0" opacity="0.7" />
        </svg>
      </div>
      <span className="font-mono2 text-[10px] text-slate-500 group-hover:text-teal-300">{EYES[eye]}</span>
    </button>
  );
}

function IopSparkline({ rows, encounterId }) {
  const pts = rows.filter((r) => r.iop_od != null || r.iop_os != null);
  if (pts.length < 2) return null;
  const W = 280, H = 64, PAD = 6;
  const vals = pts.flatMap((r) => [r.iop_od, r.iop_os]).filter((v) => v != null).map(Number);
  const min = Math.min(...vals, IOP_ALERT - 2), max = Math.max(...vals, IOP_ALERT + 2);
  const x = (i) => PAD + (i * (W - 2 * PAD)) / (pts.length - 1);
  const y = (v) => H - PAD - ((Number(v) - min) * (H - 2 * PAD)) / (max - min || 1);
  const line = (key) => pts.map((r, i) => (r[key] == null ? null : `${x(i)},${y(r[key])}`)).filter(Boolean).join(" ");
  return (
    <svg width={W} height={H} className="mt-2">
      <line x1={PAD} x2={W - PAD} y1={y(IOP_ALERT)} y2={y(IOP_ALERT)} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <polyline points={line("iop_od")} fill="none" stroke="#2dd4bf" strokeWidth="1.5" />
      <polyline points={line("iop_os")} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="5 3" />
      {pts.map((r, i) => (
        <g key={r.id || i}>
          {r.iop_od != null && <circle cx={x(i)} cy={y(r.iop_od)} r={r.encounter_id === encounterId ? 3.5 : 2.5} fill="#2dd4bf" />}
          {r.iop_os != null && <circle cx={x(i)} cy={y(r.iop_os)} r={r.encounter_id === encounterId ? 3.5 : 2.5} fill="#22d3ee" />}
        </g>
      ))}
    </svg>
  );
}

const EMPTY_EXAM = {
  va_uncorr_od: "", va_uncorr_os: "", va_pinhole_od: "", va_pinhole_os: "", va_corr_od: "", va_corr_os: "",
  iop_od: "", iop_os: "",
  sphere_od: "", cyl_od: "", axis_od: "", add_od: "",
  sphere_os: "", cyl_os: "", axis_os: "", add_os: "",
  pd: "", notes: "",
};

export default function EyeExamChart({ patient, encounterId, me, signed, myName }) {
  const [exam, setExam] = useState(EMPTY_EXAM);
  const [examId, setExamId] = useState(null);
  const [iopHistory, setIopHistory] = useState([]);
  const [chart, setChart] = useState({});      // { OD: latest condition row, OS: ... }
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("normal");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const [ex, trend, cond] = await Promise.all([
      supabase.from("eye_exams").select("*").eq("encounter_id", encounterId).maybeSingle(),
      supabase.from("eye_exams").select("id, encounter_id, recorded_at, iop_od, iop_os").eq("patient_record_id", patient.id).order("recorded_at"),
      supabase.from("eye_conditions").select("*").eq("patient_record_id", patient.id).order("recorded_at", { ascending: false }),
    ]);
    const err = ex.error || trend.error || cond.error;
    if (err) { setError(err.message); return; }
    if (ex.data) {
      setExamId(ex.data.id);
      const next = { ...EMPTY_EXAM };
      Object.keys(EMPTY_EXAM).forEach((k) => { next[k] = ex.data[k] ?? ""; });
      setExam(next);
    }
    setIopHistory(trend.data || []);
    const latest = {};
    (cond.data || []).forEach((row) => { if (!latest[row.eye]) latest[row.eye] = row; });
    setChart(latest);
    setHistory(cond.data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patient.id, encounterId]);

  const set = (k) => (e) => setExam((x) => ({ ...x, [k]: e.target.value }));

  const num = (v) => (v === "" || v == null ? null : Number(v));

  const saveExam = async () => {
    setBusy(true); setError(null); setSaved(false);
    const payload = {
      va_uncorr_od: exam.va_uncorr_od || null, va_uncorr_os: exam.va_uncorr_os || null,
      va_pinhole_od: exam.va_pinhole_od || null, va_pinhole_os: exam.va_pinhole_os || null,
      va_corr_od: exam.va_corr_od || null, va_corr_os: exam.va_corr_os || null,
      iop_od: num(exam.iop_od), iop_os: num(exam.iop_os),
      sphere_od: num(exam.sphere_od), cyl_od: num(exam.cyl_od), axis_od: num(exam.axis_od), add_od: num(exam.add_od),
      sphere_os: num(exam.sphere_os), cyl_os: num(exam.cyl_os), axis_os: num(exam.axis_os), add_os: num(exam.add_os),
      pd: num(exam.pd), notes: exam.notes || null,
    };
    let err;
    if (examId) {
      ({ error: err } = await supabase.from("eye_exams").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", examId));
    } else {
      const { data, error: e2 } = await supabase.from("eye_exams")
        .insert({ ...payload, encounter_id: encounterId, patient_record_id: patient.id, recorded_by: me })
        .select("id").single();
      err = e2;
      if (data) setExamId(data.id);
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    load();
  };

  const openEye = (eye) => {
    setSelected(eye);
    setStatus(chart[eye]?.status || "normal");
    setNotes("");
  };

  const saveEye = async () => {
    if (!selected) return;
    setBusy(true); setError(null);
    const { error } = await supabase.from("eye_conditions").insert({
      patient_record_id: patient.id,
      eye: selected,
      status,
      notes: notes || null,
      encounter_id: encounterId,
      recorded_by: me,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setSelected(null);
    load();
  };

  const printGlassesRx = () => {
    const row = (label, sph, cyl, axis, add) => `
      <tr><td class="label">${label}</td>
      <td style="text-align:center">${esc(fmtDiopter(sph))}</td>
      <td style="text-align:center">${esc(fmtDiopter(cyl))}</td>
      <td style="text-align:center">${axis === "" || axis == null ? "—" : esc(axis) + "°"}</td>
      <td style="text-align:center">${esc(fmtDiopter(add))}</td></tr>`;
    printDocument("Eyeglass Prescription", `
      <h1>MEDIPULSE CLINIC</h1><div class="sub">Eyeglass Prescription</div><div class="rule"></div>
      <table><tr><td class="label">Patient</td><td>${esc(patient.first_name)} ${esc(patient.last_name)}</td></tr>
      <tr><td class="label">MRN</td><td>${esc(patient.mrn)}</td></tr>
      <tr><td class="label">Date</td><td>${esc(new Date().toLocaleDateString("en-PH", { dateStyle: "long" }))}</td></tr></table>
      <div class="rule"></div>
      <table>
        <tr><td class="label"></td><td style="text-align:center"><strong>SPH</strong></td><td style="text-align:center"><strong>CYL</strong></td><td style="text-align:center"><strong>AXIS</strong></td><td style="text-align:center"><strong>ADD</strong></td></tr>
        ${row("OD (right)", exam.sphere_od, exam.cyl_od, exam.axis_od, exam.add_od)}
        ${row("OS (left)", exam.sphere_os, exam.cyl_os, exam.axis_os, exam.add_os)}
      </table>
      ${exam.pd !== "" && exam.pd != null ? `<p><strong>PD:</strong> ${esc(exam.pd)} mm</p>` : ""}
      ${exam.va_corr_od || exam.va_corr_os ? `<p><strong>Corrected VA:</strong> OD ${esc(exam.va_corr_od || "—")} · OS ${esc(exam.va_corr_os || "—")}</p>` : ""}
      ${exam.notes ? `<p><strong>Notes:</strong> ${esc(exam.notes)}</p>` : ""}
      <div class="sig"><div class="line">${esc(myName)}<br/>Lic. No. _______________</div></div>
      <div class="muted">Electronically generated via MediPulse. Valid with prescriber's signature.</div>`);
  };

  const legend = Object.entries(CONDITION_META);
  const iopWarn = (v) => v !== "" && v != null && Number(v) > IOP_ALERT;
  const hasRx = exam.sphere_od !== "" || exam.sphere_os !== "";
  const vaRows = [["od", "OD (right)"], ["os", "OS (left)"]];

  return (
    <div>
      {error && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">{error}</div>
      )}

      {/* eye diagram */}
      <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5 mb-5">
        <div className="flex justify-center gap-10">
          {/* OD on the viewer's left, as on a chart facing the patient */}
          <EyeIcon eye="OD" status={chart.OD?.status || "normal"} selected={selected === "OD"} onClick={openEye} />
          <EyeIcon eye="OS" status={chart.OS?.status || "normal"} selected={selected === "OS"} onClick={openEye} />
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {legend.map(([key, meta]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs font-body text-slate-400">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: meta.color, border: `1.5px solid ${meta.border}` }} />
              {meta.label}
            </span>
          ))}
        </div>
      </div>

      {/* eye finding editor */}
      {selected && !signed && (
        <div className="rounded-3xl border border-teal-400/40 bg-teal-400/5 p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-semibold text-slate-100">{EYES[selected]}</div>
            <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {legend.map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>
            <input className={inputCls} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button onClick={saveEye} disabled={busy} className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60 flex items-center gap-1.5">
            <Check size={14} /> {busy ? "Saving…" : "Save eye finding"}
          </button>
        </div>
      )}

      {/* visual acuity + IOP */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 mb-5">
        <div className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Eye size={15} className="text-teal-300" /> Visual acuity & pressure</div>
        <div className="overflow-x-auto">
          <table className="text-sm font-body text-slate-300 w-full min-w-fit">
            <thead>
              <tr className="text-xs font-mono2 text-slate-500">
                <th className="text-left font-normal pb-2 pr-3"></th>
                <th className="text-left font-normal pb-2 pr-3">UNCORRECTED</th>
                <th className="text-left font-normal pb-2 pr-3">PINHOLE</th>
                <th className="text-left font-normal pb-2 pr-3">CORRECTED</th>
                <th className="text-left font-normal pb-2">IOP (mmHg)</th>
              </tr>
            </thead>
            <tbody>
              {vaRows.map(([k, label]) => (
                <tr key={k}>
                  <td className="pr-3 py-1 font-mono2 text-xs text-slate-400 whitespace-nowrap">{label}</td>
                  {["va_uncorr_", "va_pinhole_", "va_corr_"].map((prefix) => (
                    <td key={prefix} className="pr-3 py-1">
                      <select className={selectCls} value={exam[prefix + k]} onChange={set(prefix + k)} disabled={signed}>
                        <option value="">—</option>
                        {SNELLEN.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                  ))}
                  <td className="py-1">
                    <input
                      type="number" step="0.5" min="0" max="80"
                      className={selectCls + " w-24 " + (iopWarn(exam["iop_" + k]) ? "border-amber-400 text-amber-300" : "")}
                      value={exam["iop_" + k]} onChange={set("iop_" + k)} disabled={signed} placeholder="—"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(iopWarn(exam.iop_od) || iopWarn(exam.iop_os)) && (
          <p className="text-xs text-amber-300 font-body mt-2">⚠ IOP above {IOP_ALERT} mmHg — consider glaucoma workup.</p>
        )}
      </div>

      {/* IOP trend */}
      {iopHistory.some((r) => r.iop_od != null || r.iop_os != null) && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 mb-5">
          <div className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Activity size={15} className="text-teal-300" /> IOP trend</div>
          <div className="flex flex-wrap items-start gap-6">
            <table className="text-sm font-body">
              <thead>
                <tr className="text-xs font-mono2 text-slate-500">
                  <th className="text-left font-normal pb-1 pr-6">DATE</th>
                  <th className="text-right font-normal pb-1 pr-6">OD</th>
                  <th className="text-right font-normal pb-1">OS</th>
                </tr>
              </thead>
              <tbody>
                {iopHistory.filter((r) => r.iop_od != null || r.iop_os != null).map((r) => (
                  <tr key={r.id} className={r.encounter_id === encounterId ? "text-teal-300" : "text-slate-300"}>
                    <td className="pr-6 py-0.5 font-mono2 text-xs">{new Date(r.recorded_at).toLocaleDateString("en-PH", { year: "2-digit", month: "short", day: "numeric" })}{r.encounter_id === encounterId ? " · now" : ""}</td>
                    <td className={"text-right pr-6 py-0.5 " + (iopWarn(r.iop_od) ? "text-amber-300" : "")}>{r.iop_od ?? "—"}</td>
                    <td className={"text-right py-0.5 " + (iopWarn(r.iop_os) ? "text-amber-300" : "")}>{r.iop_os ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <IopSparkline rows={iopHistory} encounterId={encounterId} />
              <div className="flex gap-4 text-xs font-body text-slate-500 mt-1">
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-teal-400" /> OD</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-cyan-400" /> OS</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-amber-400" /> {IOP_ALERT} mmHg</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* refraction / glasses Rx */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-semibold text-slate-100 flex items-center gap-2"><Glasses size={15} className="text-teal-300" /> Refraction — glasses Rx</div>
          {hasRx && (
            <button onClick={printGlassesRx} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors flex items-center gap-1.5">
              <Printer size={14} /> Print glasses Rx
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm font-body text-slate-300 w-full min-w-fit">
            <thead>
              <tr className="text-xs font-mono2 text-slate-500">
                <th className="text-left font-normal pb-2 pr-3"></th>
                <th className="text-left font-normal pb-2 pr-3">SPHERE</th>
                <th className="text-left font-normal pb-2 pr-3">CYLINDER</th>
                <th className="text-left font-normal pb-2 pr-3">AXIS (°)</th>
                <th className="text-left font-normal pb-2">ADD</th>
              </tr>
            </thead>
            <tbody>
              {vaRows.map(([k, label]) => (
                <tr key={k}>
                  <td className="pr-3 py-1 font-mono2 text-xs text-slate-400 whitespace-nowrap">{label}</td>
                  {[["sphere_", "0.25"], ["cyl_", "0.25"], ["axis_", "1"], ["add_", "0.25"]].map(([prefix, step]) => (
                    <td key={prefix} className={prefix === "add_" ? "py-1" : "pr-3 py-1"}>
                      <input
                        type="number" step={step}
                        {...(prefix === "axis_" ? { min: 0, max: 180 } : {})}
                        className={selectCls + " w-24"}
                        value={exam[prefix + k]} onChange={set(prefix + k)} disabled={signed} placeholder="—"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <label className="text-xs font-mono2 text-slate-500">PD (mm)</label>
          <input type="number" step="0.5" className={selectCls + " w-24"} value={exam.pd} onChange={set("pd")} disabled={signed} placeholder="—" />
          <input className={inputCls + " flex-1 min-w-48"} placeholder="Exam notes (optional)" value={exam.notes} onChange={set("notes")} disabled={signed} />
        </div>
        {!signed && (
          <div className="flex items-center gap-3 mt-4">
            <button onClick={saveExam} disabled={busy} className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60 flex items-center gap-1.5">
              <Check size={14} /> {busy ? "Saving…" : "Save eye exam"}
            </button>
            {saved && <span className="text-xs text-teal-300 font-body">Saved ✓</span>}
            <span className="text-xs text-slate-500 font-body">Saves acuity, pressure and refraction together.</span>
          </div>
        )}
      </div>

      {/* findings history */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <div className="font-display font-semibold text-slate-100 mb-3">Findings history</div>
        {history.length === 0 ? (
          <div className="text-sm text-slate-500 font-body">No entries yet — click an eye above to record a finding.</div>
        ) : (
          history.slice(0, 15).map((h) => (
            <div key={h.id} className="flex justify-between items-center py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
              <span className="text-slate-200">
                {h.eye} — {CONDITION_META[h.status]?.label || h.status}
                {h.notes && <span className="text-slate-500"> · {h.notes}</span>}
              </span>
              <span className="font-mono2 text-xs text-slate-500">{new Date(h.recorded_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
