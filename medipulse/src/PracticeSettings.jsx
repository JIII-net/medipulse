import React, { useState, useEffect } from "react";
import { CreditCard, MapPin, Users, Plus, Trash2, Copy, Check, AlertCircle, FileText, Pencil, X } from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/*  Practice settings — for doctors: subscription, locations, team     */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";
const card = "rounded-3xl border border-slate-800 bg-slate-900 p-5";
const peso = (n) => "₱" + Number(n).toLocaleString();

export default function PracticeSettings() {
  const { profile, session } = useAuth();
  const me = profile?.id;
  const isDoctor = profile?.role === "doctor";

  const [sub, setSub] = useState(null);
  const [locations, setLocations] = useState([]);
  const [team, setTeam] = useState([]);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState(null);
  const [locForm, setLocForm] = useState({ name: "", address: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);

  const load = async () => {
    const [s, l, t, i] = await Promise.all([
      supabase.from("subscriptions").select("status, billing_cycle, trial_ends_at, plans(name, monthly_price, features)").eq("doctor_id", me).maybeSingle(),
      supabase.from("clinic_locations").select("*").eq("doctor_id", me).order("created_at"),
      supabase.from("staff_assignments").select("id, created_at, secretary:secretary_id(full_name, id)").eq("doctor_id", me),
      supabase.from("practice_invites").select("*").eq("doctor_id", me).is("used_by", null).gte("expires_at", new Date().toISOString()),
    ]);
    if (s.error) setError(s.error.message);
    setSub(s.data || null);
    setLocations(l.data || []);
    setTeam(t.data || []);
    setInvites(i.data || []);
  };
  useEffect(() => { if (me) load(); /* eslint-disable-next-line */ }, [me]);

  const addLocation = async () => {
    if (!locForm.name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("clinic_locations").insert({
      doctor_id: me, name: locForm.name.trim(), address: locForm.address || null, phone: locForm.phone || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setLocForm({ name: "", address: "", phone: "" });
    load();
  };

  const removeLocation = async (id) => {
    const { error } = await supabase.from("clinic_locations").delete().eq("id", id);
    if (error) setError("Can't delete: " + error.message + " (locations already used by schedules/appointments are kept for record integrity)");
    else load();
  };

  const generateInvite = async () => {
    setBusy(true);
    const code = Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("") +
                 Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
    const { error } = await supabase.from("practice_invites").insert({ code, doctor_id: me });
    setBusy(false);
    if (error) { setError(error.message); return; }
    load();
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  const removeSecretary = async (id) => {
    await supabase.from("staff_assignments").delete().eq("id", id);
    load();
  };

  if (!isDoctor && profile?.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center text-slate-400 font-body text-sm">
        Practice settings are managed by the doctor. Ask your doctor to add locations or team members.
      </div>
    );
  }

  const trialDays = sub?.trial_ends_at ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - new Date()) / 86400000)) : null;
  const price = sub?.plans ? (sub.billing_cycle === "annual" ? Math.round(sub.plans.monthly_price * 0.8) : sub.plans.monthly_price) : 0;
  const statusColor = { trialing: "text-violet-300 border-violet-500/40 bg-violet-500/10", active: "text-teal-300 border-teal-400/40 bg-teal-400/10", past_due: "text-amber-300 border-amber-500/40 bg-amber-500/10", canceled: "text-slate-400 border-slate-600 bg-slate-800/40" };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 fade-up">
      <div className="mb-6">
        <div className="font-mono2 text-xs text-teal-300 mb-1">PRACTICE SETTINGS</div>
        <h2 className="font-display text-3xl font-bold text-slate-50">My practice</h2>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="space-y-5">
        {/* subscription */}
        <div className={card}>
          <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-4">
            <CreditCard size={16} className="text-teal-300" /> Subscription
          </div>
          {!sub ? (
            <div className="text-sm text-slate-500 font-body">No subscription found for this account.</div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-display text-xl font-bold text-slate-50">{sub.plans?.name} — {peso(price)}/mo</div>
                <div className="font-mono2 text-xs text-slate-500 mt-1">
                  {sub.billing_cycle} billing
                  {sub.status === "trialing" && trialDays != null && ` · ${trialDays} day${trialDays === 1 ? "" : "s"} left in trial`}
                </div>
              </div>
              <span className={"px-3 py-1 rounded-full border text-sm font-body " + (statusColor[sub.status] || statusColor.canceled)}>
                {sub.status}
              </span>
            </div>
          )}
          <p className="text-xs text-slate-500 font-body mt-3">To change plans or billing, contact support — self-serve plan changes arrive with the billing integration.</p>
        </div>

        {/* locations */}
        <div className={card}>
          <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-1">
            <MapPin size={16} className="text-teal-300" /> Clinic locations
          </div>
          <p className="text-xs text-slate-500 font-body mb-4">
            Add each clinic or hospital where you hold hours. Your schedule rules and appointments can then be tied to a location, so staff and patients always know where a slot is.
          </p>
          {locations.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
              <div>
                <span className="text-slate-100">{l.name}</span>
                {l.address && <div className="text-xs text-slate-500">{l.address}{l.phone ? ` · ${l.phone}` : ""}</div>}
              </div>
              <button onClick={() => removeLocation(l.id)} className="text-slate-500 hover:text-rose-300"><Trash2 size={15} /></button>
            </div>
          ))}
          {locations.length === 0 && <div className="text-sm text-slate-500 font-body mb-2">No locations yet — add your first clinic below.</div>}
          <div className="grid sm:grid-cols-3 gap-2 mt-4">
            <input className={inputCls} placeholder="Name (e.g. St. Luke's QC — Rm 405)" value={locForm.name} onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))} />
            <input className={inputCls} placeholder="Address" value={locForm.address} onChange={(e) => setLocForm((f) => ({ ...f, address: e.target.value }))} />
            <input className={inputCls} placeholder="Phone" value={locForm.phone} onChange={(e) => setLocForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <button onClick={addLocation} disabled={busy} className={btnPrimary + " mt-3 flex items-center gap-1.5"}><Plus size={14} /> Add location</button>
        </div>

        {/* team */}
        <div className={card}>
          <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-1">
            <Users size={16} className="text-teal-300" /> Team (secretaries)
          </div>
          <p className="text-xs text-slate-500 font-body mb-4">
            Secretaries get their own login and can manage your patients, appointments, and queue — but can never open clinical notes or prescriptions. Generate an invite code and give it to them; they redeem it when signing up on the site ("Join a practice").
          </p>
          {team.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
              <span className="text-slate-100">{t.secretary?.full_name || "—"} <span className="text-slate-500 text-xs">· secretary</span></span>
              <button onClick={() => removeSecretary(t.id)} className="text-slate-500 hover:text-rose-300" title="Remove from practice"><Trash2 size={15} /></button>
            </div>
          ))}
          {team.length === 0 && <div className="text-sm text-slate-500 font-body">No team members yet.</div>}

          {invites.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-mono2 text-slate-500 mb-2">ACTIVE INVITE CODES (valid 7 days, single use)</div>
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono2 text-teal-300 tracking-widest">{i.code}</span>
                  <button onClick={() => copyCode(i.code)} className={btnGhost + " py-1 px-3 text-xs flex items-center gap-1.5"}>
                    {copied === i.code ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={generateInvite} disabled={busy} className={btnPrimary + " mt-4 flex items-center gap-1.5"}>
            <Plus size={14} /> Generate invite code
          </button>
        </div>

        <TemplatesCard doctorId={me} />
      </div>
    </div>
  );
}

/* --------------------------- SOAP templates -------------------------- */

const SOAP_FIELDS = [
  ["subjective", "Subjective"], ["objective", "Objective"], ["assessment", "Assessment"], ["plan", "Plan"],
];
const EMPTY_TEMPLATE = { name: "", specialty: "", subjective: "", objective: "", assessment: "", plan: "" };

function TemplatesCard({ doctorId }) {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // {} for new, or a template row
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("note_templates").select("*").order("created_at", { ascending: false });
    if (error) { setError(error.message); return; }
    setTemplates(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const mine = templates.filter((t) => t.doctor_id === doctorId);
  const builtIn = templates.filter((t) => !t.doctor_id);

  const openNew = () => setEditing({ ...EMPTY_TEMPLATE });
  const openEdit = (t) => setEditing({ ...t });

  const save = async () => {
    if (!editing.name.trim()) { setError("Give the template a name."); return; }
    setBusy(true); setError(null);
    const payload = {
      name: editing.name.trim(), specialty: editing.specialty.trim() || null,
      subjective: editing.subjective || null, objective: editing.objective || null,
      assessment: editing.assessment || null, plan: editing.plan || null,
    };
    const { error } = editing.id
      ? await supabase.from("note_templates").update(payload).eq("id", editing.id)
      : await supabase.from("note_templates").insert({ ...payload, doctor_id: doctorId });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setEditing(null);
    load();
  };

  const remove = async (id) => {
    const { error } = await supabase.from("note_templates").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    load();
  };

  return (
    <div className={card}>
      <div className="font-display font-semibold text-slate-100 flex items-center gap-2 mb-1">
        <FileText size={16} className="text-teal-300" /> Consultation templates
      </div>
      <p className="text-xs text-slate-500 font-body mb-4">
        Build your own SOAP note templates — they show up in the "Apply a template" picker during a consultation, alongside the built-in ones. Only you can see, edit, or delete your own templates.
      </p>

      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-4">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="text-xs font-mono2 text-teal-300 mb-2">MY TEMPLATES</div>
      {mine.length === 0 && <div className="text-sm text-slate-500 font-body mb-3">You haven't created any yet.</div>}
      {mine.map((t) => (
        <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0 text-sm font-body">
          <span className="text-slate-200">{t.name}{t.specialty ? <span className="text-slate-500"> · {t.specialty}</span> : ""}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => openEdit(t)} className="text-slate-500 hover:text-teal-300"><Pencil size={14} /></button>
            <button onClick={() => remove(t.id)} className="text-slate-500 hover:text-rose-300"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
      <button onClick={openNew} className={btnGhost + " mt-3 flex items-center gap-1.5"}><Plus size={14} /> New template</button>

      {builtIn.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-800">
          <div className="text-xs font-mono2 text-slate-500 mb-2">BUILT-IN (shared, read-only)</div>
          {builtIn.map((t) => (
            <div key={t.id} className="py-1.5 text-sm font-body text-slate-400">
              {t.name}{t.specialty ? <span className="text-slate-600"> · {t.specialty}</span> : ""}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-slate-50">{editing.id ? "Edit template" : "New template"}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Template name (e.g. Follow-up: Diabetes)" value={editing.name} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
              <input className={inputCls} placeholder="Specialty tag (optional)" value={editing.specialty || ""} onChange={(e) => setEditing((p) => ({ ...p, specialty: e.target.value }))} />
              {SOAP_FIELDS.map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-mono2 text-slate-500 mb-1 block">{label.toUpperCase()}</label>
                  <textarea
                    className={inputCls + " min-h-20"}
                    value={editing[key] || ""}
                    onChange={(e) => setEditing((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={`Default text for ${label.toLowerCase()}...`}
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className={btnGhost}>Cancel</button>
                <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save template"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
