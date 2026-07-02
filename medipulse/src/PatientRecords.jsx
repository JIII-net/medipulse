import React, { useState, useEffect, useMemo } from "react";
import {
  Search, UserPlus, QrCode, ArrowLeft, Plus, Check, X, AlertCircle,
  Phone, Droplet, Link2, ClipboardList, Shield, Lock, LogOut, AlertTriangle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "./lib/AuthContext";
import { StaffGate } from "./lib/StaffGate";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/*  Patient Master Records — staff module (doctor / admin)             */
/*  Search → Register (with duplicate detection) → Master record       */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const labelCls = "text-xs font-mono2 text-slate-500 mb-1 block";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";
const card = "rounded-3xl border border-slate-800 bg-slate-900 p-5";

const calcAge = (birthdate) => {
  const b = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—");

const fullName = (p) => [p.first_name, p.middle_name, p.last_name, p.suffix].filter(Boolean).join(" ");

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-4">
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> {msg}
    </div>
  );
}

/* ------------------------------ search ---------------------------- */

function SearchView({ onOpen, onRegister }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setError(null);
    const term = q.trim().replace(/[%,()]/g, "");
    const { data, error } = await supabase
      .from("patients")
      .select("id, mrn, first_name, middle_name, last_name, suffix, birthdate, sex, phone, senior_citizen_id, pwd_id")
      .is("deleted_at", null)
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,mrn.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(25);
    setBusy(false);
    setSearched(true);
    if (error) { setError(error.message); return; }
    setResults(data || []);
  };

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <form onSubmit={search} className="relative flex-1 min-w-64">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, MRN, or phone — search before registering"
            className="w-full rounded-2xl bg-slate-900 border border-slate-700 pl-11 pr-4 py-3 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400"
          />
        </form>
        <button onClick={search} disabled={busy} className={btnPrimary}>{busy ? "Searching…" : "Search"}</button>
        <button onClick={onRegister} className={btnGhost + " flex items-center gap-1.5"}><UserPlus size={15} /> New patient</button>
      </div>

      <ErrorBanner msg={error} />

      {!searched ? (
        <div className={card + " text-center py-14 text-slate-500 font-body text-sm"}>
          Search for a patient to open their master record. Always search first — it's the best duplicate prevention.
        </div>
      ) : results.length === 0 ? (
        <div className={card + " text-center py-14 font-body text-sm text-slate-400"}>
          No patients match "{q}". <button onClick={onRegister} className="text-teal-300 hover:underline">Register them as a new patient →</button>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
          {results.map((p) => (
            <button key={p.id} onClick={() => onOpen(p.id)} className="w-full grid grid-cols-12 gap-2 items-center px-5 py-4 border-b border-slate-800/60 last:border-0 text-left hover:bg-slate-800/40 transition-colors">
              <div className="col-span-5 min-w-0">
                <div className="text-slate-100 font-body text-sm truncate">{fullName(p)}</div>
                <div className="font-mono2 text-xs text-teal-300">{p.mrn}</div>
              </div>
              <div className="col-span-3 text-sm text-slate-400 font-body">{fmtDate(p.birthdate)} · {calcAge(p.birthdate)}y · {p.sex}</div>
              <div className="col-span-2 text-sm text-slate-400 font-body truncate">{p.phone || "—"}</div>
              <div className="col-span-2 flex justify-end gap-1.5">
                {p.senior_citizen_id && <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs">Senior</span>}
                {p.pwd_id && <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 text-xs">PWD</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- register ---------------------------- */

const EMPTY_FORM = {
  first_name: "", middle_name: "", last_name: "", suffix: "",
  birthdate: "", sex: "female", civil_status: "single", nationality: "Filipino",
  phone: "", email: "",
  line1: "", barangay: "", city: "", province: "", zip: "",
  blood_type: "", philhealth_no: "", senior_citizen_id: "", pwd_id: "",
};

const Field = ({ label, value, onChange, type = "text", placeholder }) => (
  <div>
    <label className={labelCls}>{label}</label>
    <input className={inputCls} type={type} value={value} onChange={onChange} placeholder={placeholder || ""} />
  </div>
);

function RegisterView({ onDone, onBack }) {
  const { session } = useAuth();
  const [f, setF] = useState(EMPTY_FORM);
  const [dupes, setDupes] = useState(null);   // null = not checked; [] = checked, none
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((prev) => ({ ...prev, [k]: e.target.value })); setDupes(null); };

  const checkDuplicates = async () => {
    const { data } = await supabase
      .from("patients")
      .select("id, mrn, first_name, last_name, birthdate, phone")
      .is("deleted_at", null)
      .ilike("last_name", f.last_name.trim())
      .eq("birthdate", f.birthdate)
      .limit(5);
    return data || [];
  };

  const save = async (force = false) => {
    setError(null);
    if (!f.first_name.trim() || !f.last_name.trim() || !f.birthdate) {
      setError("First name, last name, and birthdate are required.");
      return;
    }
    setBusy(true);
    if (!force) {
      const candidates = await checkDuplicates();
      if (candidates.length > 0) {
        setDupes(candidates);
        setBusy(false);
        return;
      }
    }
    const { data, error } = await supabase
      .from("patients")
      .insert({
        first_name: f.first_name.trim(), middle_name: f.middle_name.trim() || null,
        last_name: f.last_name.trim(), suffix: f.suffix.trim() || null,
        birthdate: f.birthdate, sex: f.sex,
        civil_status: f.civil_status, nationality: f.nationality.trim() || "Filipino",
        phone: f.phone.trim() || null, email: f.email.trim() || null,
        address: { line1: f.line1, barangay: f.barangay, city: f.city, province: f.province, zip: f.zip },
        blood_type: f.blood_type || null,
        philhealth_no: f.philhealth_no.trim() || null,
        senior_citizen_id: f.senior_citizen_id.trim() || null,
        pwd_id: f.pwd_id.trim() || null,
        created_by: session?.user?.id || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) { setError(error.message); return; }
    onDone(data.id);
  };

  return (
    <div className="fade-up max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 font-body mb-5">
        <ArrowLeft size={15} /> Back to search
      </button>
      <h2 className="font-display text-2xl font-bold text-slate-50 mb-6">Register new patient</h2>

      {dupes && dupes.length > 0 && (
        <div className="mb-6 rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex items-center gap-2 text-amber-300 font-body text-sm font-semibold mb-3">
            <AlertTriangle size={16} /> Possible duplicate — same last name and birthdate found
          </div>
          {dupes.map((d) => (
            <button key={d.id} onClick={() => onDone(d.id)} className="w-full text-left flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 mb-2 hover:border-teal-400 transition-colors">
              <span className="text-sm text-slate-100 font-body">{d.first_name} {d.last_name} · {fmtDate(d.birthdate)} · {d.phone || "no phone"}</span>
              <span className="text-xs text-teal-300 font-mono2">{d.mrn} → open</span>
            </button>
          ))}
          <button onClick={() => save(true)} disabled={busy} className="mt-2 text-sm text-amber-300 font-body hover:underline">
            None of these — register as a new patient anyway
          </button>
        </div>
      )}

      <div className="space-y-6">
        <div className={card}>
          <div className="font-display font-semibold text-slate-100 mb-4">Identity</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="FIRST NAME *"  value={f.first_name} onChange={set("first_name")} />
            <Field label="MIDDLE NAME"  value={f.middle_name} onChange={set("middle_name")} />
            <Field label="LAST NAME *"  value={f.last_name} onChange={set("last_name")} />
            <Field label="SUFFIX" placeholder="Jr., III…"  value={f.suffix} onChange={set("suffix")} />
            <Field label="BIRTHDATE *" type="date"  value={f.birthdate} onChange={set("birthdate")} />
            <div>
              <label className={labelCls}>SEX *</label>
              <select className={inputCls} value={f.sex} onChange={set("sex")}>
                <option value="female">Female</option><option value="male">Male</option>
                <option value="intersex">Intersex</option><option value="unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>CIVIL STATUS</label>
              <select className={inputCls} value={f.civil_status} onChange={set("civil_status")}>
                <option>single</option><option>married</option><option>widowed</option><option>separated</option><option>annulled</option>
              </select>
            </div>
            <Field label="NATIONALITY"  value={f.nationality} onChange={set("nationality")} />
          </div>
          {f.birthdate && <div className="mt-3 font-mono2 text-xs text-teal-300">Computed age: {calcAge(f.birthdate)} years</div>}
        </div>

        <div className={card}>
          <div className="font-display font-semibold text-slate-100 mb-4">Contact & address</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="MOBILE PHONE" placeholder="09xx xxx xxxx"  value={f.phone} onChange={set("phone")} />
            <Field label="EMAIL" type="email"  value={f.email} onChange={set("email")} />
            <Field label="STREET / HOUSE NO." value={f.line1} onChange={set("line1")} />
            <Field label="BARANGAY"  value={f.barangay} onChange={set("barangay")} />
            <Field label="CITY / MUNICIPALITY" value={f.city} onChange={set("city")} />
            <Field label="PROVINCE"  value={f.province} onChange={set("province")} />
          </div>
        </div>

        <div className={card}>
          <div className="font-display font-semibold text-slate-100 mb-4">Clinical & benefits</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>BLOOD TYPE</label>
              <select className={inputCls} value={f.blood_type} onChange={set("blood_type")}>
                <option value="">Unknown</option>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <Field label="PHILHEALTH NO."  value={f.philhealth_no} onChange={set("philhealth_no")} />
            <Field label="SENIOR CITIZEN ID (if applicable)"  value={f.senior_citizen_id} onChange={set("senior_citizen_id")} />
            <Field label="PWD ID (if applicable)"  value={f.pwd_id} onChange={set("pwd_id")} />
          </div>
          <p className="mt-3 text-xs text-slate-500 font-body">Senior citizen and PWD IDs automatically flag the patient for the 20% discount + VAT exemption at billing.</p>
        </div>

        <ErrorBanner msg={error} />
        <div className="flex justify-end gap-3">
          <button onClick={onBack} className={btnGhost}>Cancel</button>
          <button onClick={() => save(false)} disabled={busy} className={btnPrimary}>
            {busy ? "Saving…" : "Check duplicates & save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- master record ------------------------- */

function AddRow({ fields, onAdd, addLabel = "Add" }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-teal-300 font-body hover:underline mt-2">
        <Plus size={13} /> {addLabel}
      </button>
    );
  return (
    <div className="mt-3 rounded-2xl border border-slate-700 p-3 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        {fields.map((fl) =>
          fl.options ? (
            <select key={fl.key} className={inputCls} value={vals[fl.key] || ""} onChange={(e) => setVals((v) => ({ ...v, [fl.key]: e.target.value }))}>
              <option value="">{fl.label}…</option>
              {fl.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input key={fl.key} className={inputCls} type={fl.type || "text"} placeholder={fl.label} value={vals[fl.key] || ""} onChange={(e) => setVals((v) => ({ ...v, [fl.key]: e.target.value }))} />
          )
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => { setOpen(false); setVals({}); }} className={btnGhost}>Cancel</button>
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); await onAdd(vals); setBusy(false); setOpen(false); setVals({}); }}
          className={btnPrimary}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function DetailView({ patientId, onBack, onOpen }) {
  const { session } = useAuth();
  const [tab, setTab] = useState("overview");
  const [p, setP] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [insurance, setInsurance] = useState([]);
  const [links, setLinks] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const uid = session?.user?.id || null;

  const load = async () => {
    const [pt, ct, al, cd, ins, hx, lk1, lk2] = await Promise.all([
      supabase.from("patients").select("*").eq("id", patientId).single(),
      supabase.from("patient_contacts").select("*").eq("patient_id", patientId).order("is_primary", { ascending: false }),
      supabase.from("allergies").select("*").eq("patient_id", patientId),
      supabase.from("conditions").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
      supabase.from("insurance_policies").select("*").eq("patient_id", patientId),
      supabase.from("history_entries").select("*").eq("patient_id", patientId).order("occurred_at", { ascending: false }),
      supabase.from("patient_links").select("id, relationship, linked:linked_patient_id(id, first_name, last_name, mrn, birthdate)").eq("patient_id", patientId),
      supabase.from("patient_links").select("id, relationship, linked:patient_id(id, first_name, last_name, mrn, birthdate)").eq("linked_patient_id", patientId),
    ]);
    if (pt.error) { setError(pt.error.message); return; }
    setP(pt.data);
    setContacts(ct.data || []);
    setAllergies(al.data || []);
    setConditions(cd.data || []);
    setInsurance(ins.data || []);
    setHistory(hx.data || []);
    setLinks([...(lk1.data || []).map((l) => ({ ...l, direction: "out" })), ...(lk2.data || []).map((l) => ({ ...l, direction: "in" }))]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patientId]);

  const timeline = useMemo(() => {
    if (!p) return [];
    const events = [
      { date: p.created_at, kind: "registration", title: "Registered as patient", details: `MRN ${p.mrn} assigned` },
      ...conditions.map((c) => ({ date: c.onset_date || c.created_at, kind: "condition", title: `Condition: ${c.description}`, details: [c.icd10_code, c.status].filter(Boolean).join(" · ") })),
      ...allergies.map((a) => ({ date: a.created_at, kind: "allergy", title: `Allergy noted: ${a.substance}`, details: [a.severity, a.reaction].filter(Boolean).join(" · ") })),
      ...history.map((h) => ({ date: h.occurred_at, kind: h.kind, title: h.title, details: h.details })),
    ];
    return events.filter((e) => e.date).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [p, conditions, allergies, history]);

  if (error) return <div className="fade-up"><ErrorBanner msg={error} /><button onClick={onBack} className={btnGhost}>Back</button></div>;
  if (!p) return <div className="py-20 text-center text-slate-500 font-body">Loading record…</div>;

  const isSenior = !!p.senior_citizen_id || calcAge(p.birthdate) >= 60;
  const severityColor = { life_threatening: "text-rose-300 border-rose-500/40 bg-rose-500/10", severe: "text-rose-300 border-rose-500/40 bg-rose-500/10", moderate: "text-amber-300 border-amber-500/40 bg-amber-500/10", mild: "text-slate-300 border-slate-600 bg-slate-800/40" };

  return (
    <div className="fade-up">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 font-body mb-5">
        <ArrowLeft size={15} /> Back to search
      </button>

      {/* patient context banner — always visible */}
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5 mb-6 flex flex-wrap items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center font-display font-bold text-xl text-slate-950">
          {p.first_name[0]}{p.last_name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-bold text-slate-50 truncate">{fullName(p)}</div>
          <div className="font-mono2 text-xs text-teal-300">{p.mrn} · {calcAge(p.birthdate)}y {p.sex} · {fmtDate(p.birthdate)}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {allergies.map((a) => (
              <span key={a.id} className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/40 text-xs font-body">⚠ {a.substance}</span>
            ))}
            {isSenior && <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-body">Senior</span>}
            {p.pwd_id && <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 text-xs font-body">PWD</span>}
            {p.blood_type && <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-600 text-xs font-body flex items-center gap-1"><Droplet size={10} /> {p.blood_type}</span>}
          </div>
        </div>
        <button onClick={() => setShowQR(true)} className={btnGhost + " flex items-center gap-1.5"}>
          <QrCode size={15} /> ID card
        </button>
      </div>

      {/* tabs */}
      <div className="flex gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1 text-sm w-fit mb-6">
        {[["overview", "Overview"], ["medical", "Medical"], ["family", "Family"], ["timeline", "Timeline"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={"px-3.5 py-1.5 rounded-xl font-body transition-colors " + (tab === id ? "bg-teal-400 text-slate-950 font-medium" : "text-slate-400 hover:text-slate-100")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className={card}>
            <div className="font-display font-semibold text-slate-100 mb-3">Demographics</div>
            {[
              ["Civil status", p.civil_status], ["Nationality", p.nationality],
              ["Phone", p.phone], ["Email", p.email],
              ["Address", [p.address?.line1, p.address?.barangay, p.address?.city, p.address?.province].filter(Boolean).join(", ")],
              ["PhilHealth no.", p.philhealth_no],
              ["Senior citizen ID", p.senior_citizen_id], ["PWD ID", p.pwd_id],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
                <span className="text-slate-500">{k}</span><span className="text-slate-200 text-right max-w-[60%]">{v || "—"}</span>
              </div>
            ))}
          </div>
          <div className="space-y-5">
            <div className={card}>
              <div className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Phone size={15} className="text-teal-300" /> Emergency contacts</div>
              {contacts.length === 0 && <div className="text-sm text-slate-500 font-body">No emergency contacts recorded yet.</div>}
              {contacts.map((c) => (
                <div key={c.id} className="flex justify-between py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
                  <span className="text-slate-200">{c.name} {c.is_primary && <span className="text-teal-300 text-xs">· primary</span>}<span className="text-slate-500"> · {c.relationship}</span></span>
                  <span className="font-mono2 text-slate-300">{c.phone}</span>
                </div>
              ))}
              <AddRow
                addLabel="Add contact"
                fields={[{ key: "name", label: "Name" }, { key: "relationship", label: "Relationship" }, { key: "phone", label: "Phone" }]}
                onAdd={async (v) => { await supabase.from("patient_contacts").insert({ patient_id: p.id, name: v.name, relationship: v.relationship, phone: v.phone, is_primary: contacts.length === 0 }); load(); }}
              />
            </div>
            <div className={card}>
              <div className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Shield size={15} className="text-teal-300" /> Insurance</div>
              {insurance.length === 0 && <div className="text-sm text-slate-500 font-body">No policies recorded yet.</div>}
              {insurance.map((i) => (
                <div key={i.id} className="flex justify-between py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
                  <span className="text-slate-200">{i.provider_name}<span className="text-slate-500"> · {i.provider_type}</span></span>
                  <span className="font-mono2 text-slate-300">{i.policy_no}</span>
                </div>
              ))}
              <AddRow
                addLabel="Add policy"
                fields={[
                  { key: "provider_type", label: "Type", options: ["philhealth", "hmo", "private"] },
                  { key: "provider_name", label: "Provider (e.g. Maxicare)" },
                  { key: "policy_no", label: "Policy / member no." },
                ]}
                onAdd={async (v) => { await supabase.from("insurance_policies").insert({ patient_id: p.id, provider_type: v.provider_type || "hmo", provider_name: v.provider_name, policy_no: v.policy_no }); load(); }}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "medical" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className={card}>
            <div className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><AlertTriangle size={15} className="text-rose-300" /> Allergies</div>
            {allergies.length === 0 && <div className="text-sm text-slate-500 font-body">No known allergies recorded.</div>}
            {allergies.map((a) => (
              <div key={a.id} className={"rounded-2xl border px-3.5 py-2.5 mb-2 text-sm font-body " + (severityColor[a.severity] || severityColor.mild)}>
                <span className="font-semibold">{a.substance}</span>
                {a.severity && <span> · {a.severity.replace("_", " ")}</span>}
                {a.reaction && <div className="text-xs opacity-80 mt-0.5">{a.reaction}</div>}
              </div>
            ))}
            <AddRow
              addLabel="Add allergy"
              fields={[
                { key: "substance", label: "Substance (e.g. Penicillin)" },
                { key: "severity", label: "Severity", options: ["mild", "moderate", "severe", "life_threatening"] },
                { key: "reaction", label: "Reaction" },
              ]}
              onAdd={async (v) => { await supabase.from("allergies").insert({ patient_id: p.id, substance: v.substance, severity: v.severity || null, reaction: v.reaction || null, noted_by: uid }); load(); }}
            />
          </div>
          <div className={card}>
            <div className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><ClipboardList size={15} className="text-teal-300" /> Existing conditions</div>
            {conditions.length === 0 && <div className="text-sm text-slate-500 font-body">No conditions on the problem list.</div>}
            {conditions.map((c) => (
              <div key={c.id} className="flex justify-between items-start py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
                <div>
                  <span className="text-slate-200">{c.description}</span>
                  {c.icd10_code && <span className="ml-2 font-mono2 text-xs text-teal-300">{c.icd10_code}</span>}
                  {c.onset_date && <div className="text-xs text-slate-500">since {fmtDate(c.onset_date)}</div>}
                </div>
                <span className={"px-2 py-0.5 rounded-full text-xs border " + (c.status === "resolved" ? "text-slate-400 border-slate-600" : "text-teal-300 border-teal-400/40 bg-teal-400/10")}>{c.status}</span>
              </div>
            ))}
            <AddRow
              addLabel="Add condition"
              fields={[
                { key: "description", label: "Condition (e.g. Type 2 Diabetes)" },
                { key: "icd10_code", label: "ICD-10 code (optional)" },
                { key: "status", label: "Status", options: ["active", "chronic", "resolved"] },
                { key: "onset_date", label: "Onset date", type: "date" },
              ]}
              onAdd={async (v) => { await supabase.from("conditions").insert({ patient_id: p.id, description: v.description, icd10_code: v.icd10_code || null, status: v.status || "active", onset_date: v.onset_date || null, recorded_by: uid }); load(); }}
            />
          </div>
        </div>
      )}

      {tab === "family" && (
        <div className={card + " max-w-2xl"}>
          <div className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Link2 size={15} className="text-teal-300" /> Family members</div>
          {links.length === 0 && <div className="text-sm text-slate-500 font-body">No linked family members.</div>}
          {links.map((l) => (
            <button key={l.id + l.direction} onClick={() => l.linked && onOpen(l.linked.id)} className="w-full flex justify-between items-center py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body text-left hover:text-teal-300 transition-colors">
              <span className="text-slate-200">{l.linked ? `${l.linked.first_name} ${l.linked.last_name}` : "—"}<span className="text-slate-500"> · {l.direction === "out" ? l.relationship : `linked as ${l.relationship}`}</span></span>
              <span className="font-mono2 text-xs text-teal-300">{l.linked?.mrn} →</span>
            </button>
          ))}
          <FamilyLinker patientId={p.id} onLinked={load} />
        </div>
      )}

      {tab === "timeline" && (
        <div className="max-w-2xl">
          <div className={card}>
            <div className="font-display font-semibold text-slate-100 mb-4">Medical history & timeline</div>
            <AddRow
              addLabel="Add history entry"
              fields={[
                { key: "kind", label: "Type", options: ["consultation", "procedure", "hospitalization", "immunization", "other"] },
                { key: "title", label: "Title (e.g. Appendectomy)" },
                { key: "occurred_at", label: "Date", type: "date" },
                { key: "details", label: "Details" },
              ]}
              onAdd={async (v) => { await supabase.from("history_entries").insert({ patient_id: p.id, kind: v.kind || "other", title: v.title, occurred_at: v.occurred_at || new Date().toISOString().slice(0, 10), details: v.details || null, recorded_by: uid }); load(); }}
            />
            <div className="mt-5 space-y-0">
              {timeline.map((e, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={"w-2.5 h-2.5 rounded-full mt-1.5 " + (e.kind === "allergy" ? "bg-rose-400" : e.kind === "condition" ? "bg-amber-400" : e.kind === "registration" ? "bg-slate-500" : "bg-teal-400")} />
                    {i < timeline.length - 1 && <div className="w-px flex-1 bg-slate-800" />}
                  </div>
                  <div className="pb-5 min-w-0">
                    <div className="font-mono2 text-xs text-slate-500">{fmtDate(e.date)} · {e.kind.replace("_", " ")}</div>
                    <div className="text-sm text-slate-100 font-body">{e.title}</div>
                    {e.details && <div className="text-xs text-slate-400 font-body mt-0.5">{e.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* QR ID card modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={() => setShowQR(false)}>
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl p-4 inline-block">
              <QRCodeSVG value={JSON.stringify({ mrn: p.mrn, t: p.qr_token })} size={180} />
            </div>
            <div className="font-display font-bold text-slate-50 mt-4">{fullName(p)}</div>
            <div className="font-mono2 text-sm text-teal-300">{p.mrn}</div>
            <p className="text-xs text-slate-500 font-body mt-2 max-w-56 mx-auto">Scan at check-in to identify this patient instantly.</p>
            <button onClick={() => setShowQR(false)} className={btnGhost + " mt-5"}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FamilyLinker({ patientId, onLinked }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [relationship, setRelationship] = useState("");
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    const term = q.trim().replace(/[%,()]/g, "");
    if (!term) return;
    const { data } = await supabase
      .from("patients")
      .select("id, mrn, first_name, last_name, birthdate")
      .is("deleted_at", null)
      .neq("id", patientId)
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,mrn.ilike.%${term}%`)
      .limit(5);
    setResults(data || []);
  };

  const link = async () => {
    if (!chosen || !relationship.trim()) return;
    setBusy(true);
    await supabase.from("patient_links").insert({ patient_id: patientId, linked_patient_id: chosen.id, relationship: relationship.trim() });
    setBusy(false);
    setOpen(false); setQ(""); setResults([]); setChosen(null); setRelationship("");
    onLinked();
  };

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-teal-300 font-body hover:underline mt-2">
        <Plus size={13} /> Link family member
      </button>
    );

  return (
    <div className="mt-3 rounded-2xl border border-slate-700 p-3 space-y-2">
      {!chosen ? (
        <>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Search patient by name or MRN" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button onClick={search} className={btnGhost}>Find</button>
          </div>
          {results.map((r) => (
            <button key={r.id} onClick={() => setChosen(r)} className="w-full text-left text-sm font-body text-slate-200 rounded-xl border border-slate-700 px-3 py-2 hover:border-teal-400 transition-colors">
              {r.first_name} {r.last_name} · <span className="font-mono2 text-xs text-teal-300">{r.mrn}</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <div className="text-sm font-body text-slate-200">Linking: <span className="text-teal-300">{chosen.first_name} {chosen.last_name}</span></div>
          <input className={inputCls} placeholder="Relationship (e.g. mother, child, spouse)" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setChosen(null); }} className={btnGhost}>Back</button>
            <button onClick={link} disabled={busy || !relationship.trim()} className={btnPrimary}>{busy ? "Linking…" : "Link"}</button>
          </div>
        </>
      )}
      <button onClick={() => setOpen(false)} className="text-xs text-slate-500 font-body hover:text-slate-300">Cancel</button>
    </div>
  );
}

/* ----------------------------- module root ------------------------ */

export default function PatientRecords() {
  const [view, setView] = useState({ name: "search" });

  return (
    <StaffGate>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6">
          <div className="font-mono2 text-xs text-teal-300 mb-1">STAFF · PATIENT MASTER RECORDS</div>
          <h2 className="font-display text-3xl font-bold text-slate-50">Patient records</h2>
        </div>
        {view.name === "search" && <SearchView onOpen={(id) => setView({ name: "detail", id })} onRegister={() => setView({ name: "register" })} />}
        {view.name === "register" && <RegisterView onBack={() => setView({ name: "search" })} onDone={(id) => setView({ name: "detail", id })} />}
        {view.name === "detail" && <DetailView patientId={view.id} onBack={() => setView({ name: "search" })} onOpen={(id) => setView({ name: "detail", id })} />}
      </div>
    </StaffGate>
  );
}
