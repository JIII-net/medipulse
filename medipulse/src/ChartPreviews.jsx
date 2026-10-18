import React from "react";
import { AlertTriangle } from "lucide-react";
import { STATUS_META, TOOTH_PATHS, toothType } from "./DentalChart";
import { IOP_ALERT } from "./EyeExamChart";
import { INSTRUMENTS } from "./MentalHealthChart";

/* ------------------------------------------------------------------ */
/*  Chart previews for the landing's profession rack                   */
/*                                                                     */
/*  A small slip of each profession's real consult chart, drawn from   */
/*  the same tooth shapes, condition palette, IOP alert line and       */
/*  screener scoring the Clinic App uses. Axes are fixed (IOP 10–30    */
/*  mmHg, PHQ-9 0–27, GAD-7 0–21) the way the charts hold their scale  */
/*  across visits. Every value here is a made-up sample patient.       */
/* ------------------------------------------------------------------ */

const INK = "#13305E";
const LINK = "#1F56A0";
const VOID = "#B8322F";
const HAIRLINE = "#DDE2E8";
const LABEL_INK = "#46597A";

function SampleSlip({ title, children }) {
  return (
    <figure className="rounded-md bg-white border border-ink/15 px-4 pt-3 pb-3.5">
      <figcaption className="flex items-baseline justify-between gap-3 mb-3">
        <span className="font-display font-bold text-ink text-base leading-tight">{title}</span>
        <span className="text-[11px] font-body font-semibold uppercase tracking-[0.12em] text-slate-300 shrink-0">Sample</span>
      </figcaption>
      {children}
    </figure>
  );
}

function Key({ swatch, children }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

/* ------------------------------ dental ----------------------------- */

// Both arches in FDI order as you face the patient: the patient's right
// on the viewer's left, upper 18→11 | 21→28 over lower 48→41 | 31→38.
const UPPER_ARCH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_ARCH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const SAMPLE_TEETH = { 18: "missing", 16: "crown", 14: "caries", 24: "root_canal", 26: "filled", 36: "filled", 46: "implant", 38: "missing" };

function DentalPreview() {
  const PITCH = 26, MID = 10, H = 104;
  const x = (i) => i * PITCH + (i >= 8 ? MID : 0);
  const width = 16 * PITCH + MID - 2;
  const used = [...new Set(Object.values(SAMPLE_TEETH))];
  const numStyle = { fontStretch: "80%", fontVariantNumeric: "tabular-nums" };
  // Crowns meet at the bite line in the middle; lower teeth reuse the
  // upper path flipped, exactly as the Clinic App chart draws them.
  const arch = (teeth, lower) =>
    teeth.map((n, i) => {
      const meta = STATUS_META[SAMPLE_TEETH[n] || "healthy"];
      return (
        <g key={n} transform={`translate(${x(i)},0)`}>
          <g transform={lower ? "translate(0,87) scale(1,-1)" : "translate(0,17)"}>
            <path d={TOOTH_PATHS[toothType(n)]} fill={meta.color} stroke={meta.border} strokeWidth="1.3" />
          </g>
          <text x="12" y={lower ? H - 1 : 10} textAnchor="middle" fontSize="12" fill={LABEL_INK} style={numStyle}>{n}</text>
        </g>
      );
    });
  return (
    <SampleSlip title="Odontogram · FDI">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        className="w-full h-auto max-w-[440px] overflow-visible"
        role="img"
        aria-label="Sample odontogram: 18 and 38 missing, 16 crown, 14 caries, 24 root canal, 26 and 36 filled, 46 implant, the rest healthy"
      >
        <line x1={x(8) - MID / 2 - 1} x2={x(8) - MID / 2 - 1} y1="14" y2={H - 14} stroke={HAIRLINE} strokeWidth="1" />
        <line x1="0" x2={width} y1="52" y2="52" stroke={HAIRLINE} strokeWidth="1" />
        {arch(UPPER_ARCH, false)}
        {arch(LOWER_ARCH, true)}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-xs font-body text-slate-300">
        {used.map((s) => (
          <Key key={s} swatch={<span className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_META[s].color, border: `1.5px solid ${STATUS_META[s].border}` }} />}>
            {STATUS_META[s].label}
          </Key>
        ))}
      </div>
    </SampleSlip>
  );
}

/* ------------------------------- shared trend ---------------------- */

// A trend on a fixed axis: the same plot every visit, so a change in the
// line is a change in the patient, not in the scale.
function FixedTrend({ min, max, ticks, guides = [], series, labels, ariaLabel }) {
  const W = 340, H = 92, L = 22, R = 8, T = 6, B = 18;
  const n = labels.length;
  const x = (i) => L + (i * (W - L - R)) / (n - 1);
  const y = (v) => T + ((max - v) * (H - T - B)) / (max - min);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-[400px] overflow-visible" role="img" aria-label={ariaLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={HAIRLINE} strokeWidth="1" />
          <text x={L - 5} y={y(t) + 4} textAnchor="end" fontSize="11" fill={LABEL_INK} style={{ fontStretch: "85%", fontVariantNumeric: "tabular-nums" }}>{t}</text>
        </g>
      ))}
      {guides.map((g) => (
        <line key={g.at} x1={L} x2={W - R} y1={y(g.at)} y2={y(g.at)} stroke={g.color} strokeWidth="1" strokeDasharray="4 3" />
      ))}
      {series.map((s) => (
        <g key={s.key}>
          <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="1.6" strokeDasharray={s.dash} />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 3.6 : 2.6} fill={s.color} />
          ))}
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={H - 3} textAnchor="middle" fontSize="11" fill={LABEL_INK} style={{ fontStretch: "85%" }}>{l}</text>
      ))}
    </svg>
  );
}

/* --------------------------- ophthalmology ------------------------- */

const IOP_VISITS = ["Mar", "Jun", "Sep", "Dec", "Mar"];
const IOP_OD = [24, 23, 19, 17, 16];
const IOP_OS = [22, 22, 18, 17, 15];

function EyePreview() {
  return (
    <SampleSlip title="IOP trend · mmHg">
      <FixedTrend
        min={10}
        max={30}
        ticks={[10, 20, 30]}
        guides={[{ at: IOP_ALERT, color: VOID }]}
        labels={IOP_VISITS}
        series={[
          { key: "od", values: IOP_OD, color: INK },
          { key: "os", values: IOP_OS, color: LINK, dash: "5 3" },
        ]}
        ariaLabel={`Sample IOP trend over five visits on a fixed 10 to 30 mmHg scale: right eye ${IOP_OD.join(", ")}; left eye ${IOP_OS.join(", ")}; alert line at ${IOP_ALERT}`}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-body text-slate-300">
        <Key swatch={<span className="w-4 border-t-2" style={{ borderColor: INK }} />}>OD · now 16</Key>
        <Key swatch={<span className="w-4 border-t-2 border-dashed" style={{ borderColor: LINK }} />}>OS · now 15</Key>
        <Key swatch={<span className="w-4 border-t border-dashed" style={{ borderColor: VOID }} />}>{IOP_ALERT} mmHg</Key>
      </div>
    </SampleSlip>
  );
}

/* --------------------------- mental health ------------------------- */

const SESSIONS = ["S1", "S2", "S3", "S4", "S5"];
const SCREENER_SAMPLES = {
  phq9: { scores: [18, 15, 12, 9, 6], ticks: [0, 10, 20, 27] },
  gad7: { scores: [15, 13, 10, 8, 7], ticks: [0, 5, 10, 15, 21] },
};

function ScreenerPreview({ instrument }) {
  const meta = INSTRUMENTS[instrument];
  const { scores, ticks } = SCREENER_SAMPLES[instrument];
  const first = scores[0], last = scores[scores.length - 1];
  const short = meta.label.split(" — ")[0];
  return (
    <SampleSlip title={`${meta.label.replace(" — ", " · ")} score`}>
      <FixedTrend
        min={0}
        max={meta.max}
        ticks={ticks}
        labels={SESSIONS}
        series={[{ key: instrument, values: scores, color: INK }]}
        ariaLabel={`Sample ${short} totals over five sessions on a fixed 0 to ${meta.max} scale: ${scores.join(", ")}`}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-body text-slate-300">
        <span>First <span className="font-semibold text-ink tnum">{first}</span> · {meta.severity(first).label}</span>
        <span>Latest <span className="font-semibold text-ink tnum">{last}</span> · {meta.severity(last).label}</span>
      </div>
    </SampleSlip>
  );
}

/* ----------------------------- consultation ------------------------ */

function ConsultPreview() {
  return (
    <SampleSlip title="SOAP note · e-Rx">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-rose-300 border border-rose-500/50 text-xs font-body font-semibold">
        <AlertTriangle size={12} aria-hidden="true" /> Allergy: Penicillin
      </span>
      <dl className="mt-3 grid grid-cols-[1.5rem_1fr] gap-x-2 gap-y-1.5 text-sm font-body">
        <dt className="font-bold text-ink" title="Assessment">A</dt>
        <dd className="text-slate-200">Essential hypertension, controlled</dd>
        <dt className="font-bold text-ink" title="Plan">P</dt>
        <dd className="text-slate-200">Continue medication; recheck BP in 4 weeks</dd>
      </dl>
      <div className="mt-3 pt-3 border-t border-slate-800 flex items-start gap-2 font-body">
        <span className="font-display font-extrabold italic text-ink text-lg leading-none" aria-label="Prescription">Rx</span>
        <div className="text-sm">
          <div><span className="font-semibold text-ink">Amlodipine</span> <span className="text-slate-300">5 mg</span></div>
          <div className="text-xs text-slate-400 mt-0.5 tnum">oral · once daily · 30 days · #30</div>
        </div>
      </div>
    </SampleSlip>
  );
}

const PREVIEWS = {
  doctor: () => <ConsultPreview />,
  dentist: () => <DentalPreview />,
  ophthalmologist: () => <EyePreview />,
  psychiatrist: () => <ScreenerPreview instrument="phq9" />,
  psychologist: () => <ScreenerPreview instrument="gad7" />,
};

export function ChartPreview({ profession }) {
  const Preview = PREVIEWS[profession];
  return Preview ? <Preview /> : null;
}
