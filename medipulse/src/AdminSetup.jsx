import React, { useState, useEffect } from "react";
import { Plus, Trash2, Copy, Check, X, AlertCircle, Pencil, Star } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

/* ------------------------------------------------------------------ */
/*  Admin setup — Plans, Invites, Specialties                          */
/*  Rendered as extra tabs inside AdminDashboard (App.jsx)             */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";
const card = "rounded-3xl border border-slate-800 bg-slate-900 p-5";
const peso = (n) => "₱" + Number(n || 0).toLocaleString();

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body mb-4">
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> {msg}
    </div>
  );
}

/* ------------------------------- plans ----------------------------- */

const EMPTY_PLAN = { id: "", name: "", monthly_price: "", max_doctor_seats: "1", features: "" };

export function PlansTab() {
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null); // plan row being edited, or {} for new
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("plans").select("*").order("monthly_price");
    if (error) { setError(error.message); return; }
    setPlans(data || []);
  };
  useEffect(() => { load(); }, []);

  const openEdit = (p) => setEditing(p ? {
    id: p.id, name: p.name, monthly_price: String(p.monthly_price),
    max_doctor_seats: String(p.max_doctor_seats), features: (p.features || []).join("\n"),
    isNew: false,
  } : { ...EMPTY_PLAN, isNew: true });

  const save = async () => {
    if (!editing.id.trim() || !editing.name.trim() || !editing.monthly_price) {
      setError("Plan ID, name, and price are required."); return;
    }
    setBusy(true); setError(null);
    const payload = {
      id: editing.id.trim().toLowerCase().replace(/\s+/g, "_"),
      name: editing.name.trim(),
      monthly_price: Number(editing.monthly_price),
      max_doctor_seats: Number(editing.max_doctor_seats) || 1,
      features: editing.features.split("\n").map((f) => f.trim()).filter(Boolean),
    };
    const { error } = editing.isNew
      ? await supabase.from("plans").insert(payload)
      : await supabase.from("plans").update(payload).eq("id", editing.id);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setEditing(null);
    load();
  };

  const remove = async (id) => {
    const { error } = await supabase.from("plans").delete().eq("id", id);
    if (error) { setError("Can't delete: " + error.message + " (plans with active subscriptions are protected)"); return; }
    load();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400 font-body">Plans doctors see during signup and in Practice settings. Changes apply immediately to new signups; existing subscribers keep their current price until they change plans.</p>
        <button onClick={() => openEdit(null)} className={btnPrimary + " flex items-center gap-1.5 shrink-0"}><Plus size={15} /> New plan</button>
      </div>
      <ErrorBanner msg={error} />
      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div key={p.id} className={card}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-display font-semibold text-slate-100">{p.name}</div>
                <div className="font-mono2 text-xs text-slate-500">{p.id}</div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(p)} className="text-slate-500 hover:text-teal-300"><Pencil size={15} /></button>
                <button onClick={() => remove(p.id)} className="text-slate-500 hover:text-rose-300"><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="font-display text-2xl font-bold text-slate-50 mb-1">{peso(p.monthly_price)}<span className="text-sm text-slate-500 font-body">/mo</span></div>
            <div className="text-xs text-slate-500 font-mono2 mb-3">{p.max_doctor_seats} doctor seat{p.max_doctor_seats > 1 ? "s" : ""}</div>
            <ul className="space-y-1">
              {(p.features || []).map((f, i) => (
                <li key={i} className="text-xs text-slate-400 font-body flex items-start gap-1.5"><Check size={12} className="text-teal-400 mt-0.5 shrink-0" /> {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-slate-50">{editing.isNew ? "New plan" : "Edit plan"}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Plan ID (e.g. pro)" value={editing.id} disabled={!editing.isNew} onChange={(e) => setEditing((p) => ({ ...p, id: e.target.value }))} />
              <input className={inputCls} placeholder="Display name (e.g. Pro)" value={editing.name} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} type="number" placeholder="Monthly price (₱)" value={editing.monthly_price} onChange={(e) => setEditing((p) => ({ ...p, monthly_price: e.target.value }))} />
                <input className={inputCls} type="number" placeholder="Doctor seats" value={editing.max_doctor_seats} onChange={(e) => setEditing((p) => ({ ...p, max_doctor_seats: e.target.value }))} />
              </div>
              <textarea className={inputCls + " min-h-28"} placeholder={"One feature per line, e.g.\nUnlimited patients\nTelehealth video visits"} value={editing.features} onChange={(e) => setEditing((p) => ({ ...p, features: e.target.value }))} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className={btnGhost}>Cancel</button>
                <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save plan"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ invites ----------------------------- */

export function InvitesTab() {
  const [invites, setInvites] = useState([]);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [note, setNote] = useState("");
  const [planId, setPlanId] = useState("");
  const [role, setRole] = useState("doctor");

  const load = async () => {
    const [inv, pl] = await Promise.all([
      supabase.from("admin_invites").select("*").order("created_at", { ascending: false }),
      supabase.from("plans").select("id, name"),
    ]);
    if (inv.error) { setError(inv.error.message); return; }
    setInvites(inv.data || []);
    setPlans(pl.data || []);
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true); setError(null);
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
    const { error } = await supabase.from("admin_invites").insert({
      code, note: note || null, preassigned_plan_id: planId || null, intended_role: role,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNote(""); setPlanId("");
    load();
  };

  const revoke = async (id) => {
    const { error } = await supabase.from("admin_invites").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    load();
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  const active = invites.filter((i) => !i.used_by && new Date(i.expires_at) > new Date());
  const used = invites.filter((i) => i.used_by);
  const expired = invites.filter((i) => !i.used_by && new Date(i.expires_at) <= new Date());

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-slate-400 font-body mb-4">
        Invite a specific doctor onto the platform directly — useful for pre-approved or referred doctors. Pre-assign a plan so their onboarding is instant. Codes are single-use and expire after 14 days.
      </p>
      <ErrorBanner msg={error} />

      <div className={card + " mb-6"}>
        <div className="grid sm:grid-cols-3 gap-2 mb-3">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="doctor">Doctor</option>
            <option value="admin">Admin</option>
          </select>
          <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">No pre-assigned plan</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className={inputCls} placeholder="Note (e.g. Dr. Reyes, St. Luke's)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button onClick={generate} disabled={busy} className={btnPrimary + " flex items-center gap-1.5"}><Plus size={15} /> Generate invite</button>
      </div>

      {active.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-mono2 text-teal-300 mb-2">ACTIVE ({active.length})</div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
            {active.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 last:border-0 text-sm font-body">
                <div>
                  <span className="font-mono2 text-teal-300 tracking-widest">{i.code}</span>
                  <span className="text-slate-500 ml-2 text-xs">{i.intended_role}{i.preassigned_plan_id ? ` · ${i.preassigned_plan_id}` : ""}{i.note ? ` · ${i.note}` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => copyCode(i.code)} className={btnGhost + " py-1 px-3 text-xs flex items-center gap-1.5"}>
                    {copied === i.code ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                  <button onClick={() => revoke(i.id)} className="text-slate-500 hover:text-rose-300"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {used.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-mono2 text-slate-500 mb-2">USED ({used.length})</div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
            {used.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 last:border-0 text-sm font-body text-slate-500">
                <span className="font-mono2">{i.code}</span>
                <span className="text-xs">used {new Date(i.used_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div>
          <div className="text-xs font-mono2 text-slate-600 mb-2">EXPIRED ({expired.length})</div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
            {expired.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 last:border-0 text-sm font-body text-slate-600">
                <span className="font-mono2">{i.code}</span>
                <button onClick={() => revoke(i.id)} className="text-xs hover:text-rose-300">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- specialties ---------------------------- */

export function SpecialtiesTab() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("doctor");

  const load = async () => {
    const { data, error } = await supabase.from("specialties").select("*").order("profession_type").order("sort_order");
    if (error) { setError(error.message); return; }
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    const { error } = await supabase.from("specialties").insert({
      name: newName.trim(), profession_type: newType,
      sort_order: rows.filter((r) => r.profession_type === newType).length + 1,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNewName("");
    load();
  };

  const toggleActive = async (row) => {
    await supabase.from("specialties").update({ active: !row.active }).eq("id", row.id);
    load();
  };

  const remove = async (id) => {
    const { error } = await supabase.from("specialties").delete().eq("id", id);
    if (error) { setError("Can't delete: " + error.message + " (specialties already used by a doctor are protected — deactivate instead)"); return; }
    load();
  };

  const doctorSpecs = rows.filter((r) => r.profession_type === "doctor");
  const dentistSpecs = rows.filter((r) => r.profession_type === "dentist");

  const List = ({ title, items }) => (
    <div className={card}>
      <div className="font-display font-semibold text-slate-100 mb-3">{title}</div>
      {items.length === 0 && <div className="text-sm text-slate-500 font-body">None yet.</div>}
      {items.map((r) => (
        <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0 text-sm font-body">
          <span className={r.active ? "text-slate-200" : "text-slate-600 line-through"}>{r.name}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => toggleActive(r)} className={"text-xs px-2 py-0.5 rounded-full border " + (r.active ? "text-teal-300 border-teal-400/40" : "text-slate-500 border-slate-700")}>
              {r.active ? "active" : "inactive"}
            </button>
            <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-300"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-slate-400 font-body mb-4">
        The master list of specialties doctors and dentists pick from at signup. Add a new one anytime a doctor needs a specialty that isn't listed — no code changes needed. Deactivate instead of deleting if it's already in use.
      </p>
      <ErrorBanner msg={error} />

      <div className={card + " mb-5"}>
        <div className="flex gap-2">
          <select className={inputCls + " w-40"} value={newType} onChange={(e) => setNewType(e.target.value)}>
            <option value="doctor">Doctor</option>
            <option value="dentist">Dentist</option>
          </select>
          <input className={inputCls} placeholder="Specialty name (e.g. Endocrinology)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button onClick={add} disabled={busy} className={btnPrimary + " shrink-0 flex items-center gap-1.5"}><Plus size={15} /> Add</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <List title="Doctor / Physician specialties" items={doctorSpecs} />
        <List title="Dentist specialties" items={dentistSpecs} />
      </div>
    </div>
  );
}
