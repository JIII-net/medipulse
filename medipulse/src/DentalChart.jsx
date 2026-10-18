import React, { useState, useEffect } from "react";
import { Plus, X, Check } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/*  Dental Chart (odontogram) — FDI notation, per-tooth conditions      */
/*  Shown in the Doctor Portal consult workspace for dental specialties */
/* ------------------------------------------------------------------ */

// FDI quadrants: upper-right 18-11, upper-left 21-28, lower-left 38-31, lower-right 41-48
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
const LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];

export const STATUS_META = {
  healthy: { label: "Healthy", color: "#FFFFFF", border: "#8794A8", text: "#46597A" },
  caries: { label: "Caries", color: "#F6D3D0", border: "#B8322F", text: "#8E2420" },
  filled: { label: "Filled", color: "#CFE3F5", border: "#1F56A0", text: "#0B2C5E" },
  crown: { label: "Crown", color: "#F6E7A8", border: "#9A6600", text: "#6E4700" },
  missing: { label: "Missing", color: "#F2F3EF", border: "#C3CBD6", text: "#6E7D94" },
  root_canal: { label: "Root canal", color: "#DDD5F0", border: "#5B3FA8", text: "#3F2A80" },
  extraction_planned: { label: "Extraction planned", color: "#FBE0C8", border: "#C25E14", text: "#7A3A0A" },
  extracted: { label: "Extracted", color: "#E4E6E9", border: "#6E7D94", text: "#46597A" },
  impacted: { label: "Impacted", color: "#EBD8F2", border: "#8A3FA8", text: "#5C2470" },
  implant: { label: "Implant", color: "#CDEBD9", border: "#2F8A57", text: "#1C5A37" },
  bridge: { label: "Bridge", color: "#E3EFC6", border: "#5E7F1F", text: "#3E5612" },
  fractured: { label: "Fractured", color: "#F7D5E8", border: "#B03A7C", text: "#7A1F52" },
};

// Tooth type by FDI position digit: 1-2 incisor, 3 canine, 4-5 premolar, 6-8 molar
export function toothType(n) {
  const pos = n % 10;
  if (pos <= 2) return "incisor";
  if (pos === 3) return "canine";
  if (pos <= 5) return "premolar";
  return "molar";
}
const isUpper = (n) => n <= 28;

// Each path is drawn crown-down (as if it's an upper tooth hanging from
// the gumline at the top of a 24×34 box); lower teeth reuse the same
// path flipped vertically, so the biting edges meet in the middle like
// a real mouth diagram.
export const TOOTH_PATHS = {
  incisor: "M7 2 H17 Q18 2 18 4 L16.5 24 Q16 27 12 27 Q8 27 7.5 24 L6 4 Q6 2 7 2 Z",
  canine: "M8 2 H16 Q17 2 17 4 L15.5 20 Q15 24 12 29 Q9 24 8.5 20 L7 4 Q7 2 8 2 Z",
  premolar: "M6 2 H18 Q19 2 19 4 L18 20 Q17.5 23 15 24 Q13.5 22.5 12 22.5 Q10.5 22.5 9 24 Q6.5 23 6 20 L5 4 Q5 2 6 2 Z",
  molar: "M4 2 H20 Q21.5 2 21.5 4 L20.5 19 Q20 22.5 17 23.5 Q15 22 13 22.5 Q12 23.5 12 23.5 Q12 23.5 11 22.5 Q9 22 7 23.5 Q4 22.5 3.5 19 L2.5 4 Q2.5 2 4 2 Z",
};

function ToothIcon({ number, status, selected }) {
  const meta = STATUS_META[status] || STATUS_META.healthy;
  const path = TOOTH_PATHS[toothType(number)];
  const flip = !isUpper(number);
  return (
    <svg width="24" height="34" viewBox="0 0 24 34" className="overflow-visible">
      <g transform={flip ? "translate(0,34) scale(1,-1)" : undefined}>
        <path
          d={path}
          fill={meta.color}
          stroke={selected ? "#13305E" : meta.border}
          strokeWidth={selected ? 2.4 : 1.3}
        />
      </g>
    </svg>
  );
}

function Tooth({ number, status, onClick, selected }) {
  const meta = STATUS_META[status] || STATUS_META.healthy;
  return (
    <button
      onClick={() => onClick(number)}
      className="flex flex-col items-center gap-0.5 group"
      title={`Tooth ${number} — ${meta.label}`}
    >
      <div className={"transition-transform group-hover:scale-110 " + (selected ? "-translate-y-0.5" : "")}>
        <ToothIcon number={number} status={status} selected={selected} />
      </div>
      <span className="font-mono2 text-[10px] text-slate-400 group-hover:text-ink">{number}</span>
    </button>
  );
}

function QuadrantRow({ teeth, chart, onToothClick, selected, reverse }) {
  const ordered = reverse ? [...teeth].reverse() : teeth;
  return (
    <div className="flex gap-0.5">
      {ordered.map((n) => (
        <Tooth key={n} number={n} status={chart[n]?.status || "healthy"} onClick={onToothClick} selected={selected === n} />
      ))}
    </div>
  );
}

export default function DentalChart({ patient, encounterId, me, signed }) {
  const [chart, setChart] = useState({});     // { toothNumber: latest condition row }
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("healthy");
  const [surfaces, setSurfaces] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("tooth_conditions")
      .select("*")
      .eq("patient_record_id", patient.id)
      .order("recorded_at", { ascending: false });
    if (error) { setError(error.message); return; }
    const latest = {};
    (data || []).forEach((row) => { if (!latest[row.tooth_number]) latest[row.tooth_number] = row; });
    setChart(latest);
    setHistory(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patient.id]);

  const openTooth = (n) => {
    setSelected(n);
    const existing = chart[n];
    setStatus(existing?.status || "healthy");
    setSurfaces(existing?.surfaces || "");
    setNotes("");
  };

  const saveTooth = async () => {
    if (!selected) return;
    setBusy(true); setError(null);
    const { error } = await supabase.from("tooth_conditions").insert({
      patient_record_id: patient.id,
      tooth_number: selected,
      status,
      surfaces: surfaces || null,
      notes: notes || null,
      encounter_id: encounterId,
      recorded_by: me,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setSelected(null);
    load();
  };

  const legend = Object.entries(STATUS_META);

  return (
    <div>
      {error && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">{error}</div>
      )}

      {/* odontogram */}
      <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5 mb-5 overflow-x-auto">
        <div className="min-w-fit mx-auto w-fit space-y-1">
          <div className="flex justify-center gap-1 text-center">
            <QuadrantRow teeth={UPPER_RIGHT} chart={chart} onToothClick={openTooth} selected={selected} reverse />
            <div className="w-3" />
            <QuadrantRow teeth={UPPER_LEFT} chart={chart} onToothClick={openTooth} selected={selected} />
          </div>
          <div className="flex justify-center gap-1 text-xs font-mono2 text-slate-600 py-1">
            <span>UPPER RIGHT</span><span className="w-8" /><span>UPPER LEFT</span>
          </div>
          <div className="h-px bg-slate-800 my-2" />
          <div className="flex justify-center gap-1 text-xs font-mono2 text-slate-600 pb-1">
            <span>LOWER RIGHT</span><span className="w-8" /><span>LOWER LEFT</span>
          </div>
          <div className="flex justify-center gap-1 text-center">
            <QuadrantRow teeth={LOWER_RIGHT} chart={chart} onToothClick={openTooth} selected={selected} reverse />
            <div className="w-3" />
            <QuadrantRow teeth={LOWER_LEFT} chart={chart} onToothClick={openTooth} selected={selected} />
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-2 mb-5">
        {legend.map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs font-body text-slate-400">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: meta.color, border: `1.5px solid ${meta.border}` }} />
            {meta.label}
          </span>
        ))}
      </div>

      {/* tooth editor */}
      {selected && !signed && (
        <div className="rounded-3xl border border-teal-400/40 bg-teal-400/5 p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-semibold text-slate-100">Tooth {selected}</div>
            <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <select
              className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-body focus:outline-none focus:border-teal-400"
              value={status} onChange={(e) => setStatus(e.target.value)}
            >
              {legend.map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>
            <input
              className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400"
              placeholder="Surfaces (e.g. mesial, occlusal)" value={surfaces} onChange={(e) => setSurfaces(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 mb-3"
            placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
          />
          <button onClick={saveTooth} disabled={busy} className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60 flex items-center gap-1.5">
            <Check size={14} /> {busy ? "Saving…" : "Save tooth condition"}
          </button>
        </div>
      )}

      {/* history */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <div className="font-display font-semibold text-slate-100 mb-3">Chart history</div>
        {history.length === 0 ? (
          <div className="text-sm text-slate-500 font-body">No entries yet — click a tooth above to start charting.</div>
        ) : (
          history.slice(0, 15).map((h) => (
            <div key={h.id} className="flex justify-between items-center py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
              <span className="text-slate-200">
                Tooth {h.tooth_number} — {STATUS_META[h.status]?.label || h.status}
                {h.surfaces && <span className="text-slate-500"> · {h.surfaces}</span>}
              </span>
              <span className="font-mono2 text-xs text-slate-500">{new Date(h.recorded_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
