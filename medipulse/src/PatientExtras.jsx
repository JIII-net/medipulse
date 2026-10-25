import React, { useState, useEffect, useCallback } from "react";
import { UserPlus, Trash2, Star, X, AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/AuthContext";
import { useT } from "./lib/i18n";
import { friendlyError } from "./lib/errors";
import { Avatar, Stamp, FieldLabel, Notice, HoldCountdown, btn, btnGhost, btnSm, btnGhostSm, inputCls } from "./ui";

/* ------------------------------------------------------------------ */
/*  Patient portal extras: family members, waitlist offers, no-show    */
/*  credit and visit reviews.                                          */
/* ------------------------------------------------------------------ */

const peso = (n) => "₱" + Number(n || 0).toLocaleString();
const fullName = (p) => [p.first_name, p.last_name].filter(Boolean).join(" ");

/* --------------------------- people I book for ---------------------- */

// The signed-in patient's own record (once they have one) and the
// dependents they look after. ensureSelf() creates their own record the
// first time it's needed, the same way the first booking does.
export function useMyPeople() {
  const { session, profile } = useAuth();
  const uid = session?.user?.id;
  const [self, setSelf] = useState(null);
  const [dependents, setDependents] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!uid) return;
    const [me, deps] = await Promise.all([
      supabase.from("patients").select("id, first_name, last_name, birthdate").eq("profile_id", uid).maybeSingle(),
      supabase.from("patients").select("id, first_name, last_name, birthdate, sex, guardian_relationship").eq("guardian_profile_id", uid).is("deleted_at", null).order("created_at"),
    ]);
    // Dev-only ?demo= preview: stand in a record so per-person screens render.
    const demo = import.meta.env.DEV && me.error && new URLSearchParams(window.location.search).get("demo");
    setSelf(me.data || (demo ? { id: "demo-self", first_name: "Ana", last_name: "Reyes" } : null));
    setDependents(deps.data || []);
    setLoaded(true);
  }, [uid]);
  useEffect(() => { reload(); }, [reload]);

  const ensureSelf = async () => {
    if (self) return self.id;
    const { data, error } = await supabase.rpc("get_or_create_patient_record", { p_profile_id: uid, p_full_name: profile?.full_name || "Patient" });
    if (error) throw error;
    await reload();
    return data;
  };

  // Everyone this account can book for: themselves first.
  const people = [
    { id: self?.id || "self", name: profile?.full_name || "Me", relationship: "me", isSelf: true },
    ...dependents.map((d) => ({ id: d.id, name: fullName(d), relationship: d.guardian_relationship || "family", isSelf: false })),
  ];

  return { self, dependents, people, loaded, reload, ensureSelf };
}

/* ------------------------------ family ------------------------------ */

const RELATIONSHIPS = ["Child", "Parent", "Grandparent", "Spouse", "Sibling", "Other"];

export function FamilyPanel() {
  const t = useT();
  const { profile } = useAuth();
  const { dependents, reload, loaded } = useMyPeople();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ first_name: "", last_name: "", birthdate: "", sex: "unknown", relationship: "Child" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("add_dependent", {
      p_first_name: f.first_name, p_last_name: f.last_name,
      p_birthdate: f.birthdate || null, p_sex: f.sex, p_relationship: f.relationship,
    });
    setBusy(false);
    if (error) { setError(friendlyError(error)); return; }
    setF({ first_name: "", last_name: "", birthdate: "", sex: "unknown", relationship: "Child" });
    setAdding(false);
    reload();
  };

  const remove = async (d) => {
    if (!window.confirm(t("Remove {name} from your family? Their past visits stay on record at the clinic.", { name: fullName(d) }))) return;
    const { error } = await supabase.rpc("remove_dependent", { p_id: d.id });
    if (error) { setError(friendlyError(error)); return; }
    reload();
  };

  return (
    <div className="fade-up max-w-2xl">
      <p className="font-body text-slate-300 mb-5">{t("Add the children, parents or grandparents you book for. Each person keeps their own records; you manage their bookings from this account.")}</p>

      <ul className="rounded-xl border border-slate-700 bg-white">
        <li className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800">
          <Avatar name={profile?.full_name || ""} tint="bg-sky" size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-ink font-semibold font-body truncate">{profile?.full_name}</div>
            <div className="text-sm text-slate-400 font-body">{t("You (account holder)")}</div>
          </div>
        </li>
        {loaded && dependents.length === 0 && !adding && (
          <li className="px-5 py-4 text-sm text-slate-300 font-body">{t("No family members yet.")}</li>
        )}
        {dependents.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800 last:border-0">
            <Avatar name={fullName(d)} tint="bg-mint" size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-ink font-semibold font-body truncate">{fullName(d)}</div>
              <div className="text-sm text-slate-400 font-body">
                {t(d.guardian_relationship || "Family")}
                {d.birthdate ? ` · ${new Date(d.birthdate + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : ""}
              </div>
            </div>
            <button onClick={() => remove(d)} className="p-2 rounded-md text-slate-400 hover:text-rose-300" aria-label={t("Remove {name}", { name: fullName(d) })}><Trash2 size={17} /></button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={add} className="mt-5 rounded-xl border border-ink/20 bg-white overflow-hidden">
          <div className="bg-mint px-5 py-3 border-b border-ink/15 font-display text-lg font-bold text-ink">{t("Add a family member")}</div>
          <div className="px-5 py-5 grid sm:grid-cols-2 gap-4">
            <label className="block"><FieldLabel>{t("First name")}</FieldLabel><input className={inputCls + " mt-1.5"} value={f.first_name} onChange={(e) => setF((x) => ({ ...x, first_name: e.target.value }))} required /></label>
            <label className="block"><FieldLabel>{t("Last name")}</FieldLabel><input className={inputCls + " mt-1.5"} value={f.last_name} onChange={(e) => setF((x) => ({ ...x, last_name: e.target.value }))} required /></label>
            <label className="block"><FieldLabel>{t("Birthdate")}</FieldLabel><input type="date" className={inputCls + " mt-1.5"} value={f.birthdate} onChange={(e) => setF((x) => ({ ...x, birthdate: e.target.value }))} /></label>
            <label className="block"><FieldLabel>{t("Sex")}</FieldLabel>
              <select className={inputCls + " mt-1.5"} value={f.sex} onChange={(e) => setF((x) => ({ ...x, sex: e.target.value }))}>
                <option value="unknown">{t("Prefer not to say")}</option><option value="female">{t("Female")}</option><option value="male">{t("Male")}</option>
              </select>
            </label>
            <label className="block sm:col-span-2"><FieldLabel>{t("They are my")}</FieldLabel>
              <select className={inputCls + " mt-1.5"} value={f.relationship} onChange={(e) => setF((x) => ({ ...x, relationship: e.target.value }))}>
                {RELATIONSHIPS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
            </label>
          </div>
          {error && <Notice tone="error" icon={AlertCircle} className="mx-5 mb-4">{error}</Notice>}
          <div className="px-5 py-3 border-t border-slate-800 flex gap-3">
            <button disabled={busy} className={btn}>{busy ? t("Saving…") : t("Add")}</button>
            <button type="button" onClick={() => setAdding(false)} className={btnGhost}>{t("Cancel")}</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className={btnGhost + " mt-5"}><UserPlus size={16} /> {t("Add a family member")}</button>
      )}
      {error && !adding && <Notice tone="error" className="mt-4">{error}</Notice>}
    </div>
  );
}

/* --------------------------- waitlist + credit ---------------------- */

// Waitlist offers and entries, and credit from missed visits, shown at the
// top of My appointments. Renders nothing when there's nothing to show.
export function OffersAndCredits({ onBooked }) {
  const t = useT();
  const { session } = useAuth();
  const [entries, setEntries] = useState([]);
  const [credits, setCredits] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    await supabase.rpc("expire_waitlist_offers");
    const [w, c] = await Promise.all([
      supabase.from("waitlist")
        .select("id, status, preferred_date, offered_starts_at, offer_expires_at, patient:patient_record_id(first_name, last_name), doctor:doctor_id(specialty, profiles(full_name))")
        .eq("profile_id", session.user.id).in("status", ["waiting", "offered"]).order("preferred_date"),
      supabase.from("patient_credits")
        .select("id, amount, expires_at, doctor:doctor_id(specialty, profiles(full_name))")
        .eq("patient_profile_id", session.user.id).is("used_at", null).gt("expires_at", new Date().toISOString()).order("expires_at"),
    ]);
    setEntries(w.data || []);
    setCredits(c.data || []);
  }, [session?.user?.id]);
  useEffect(() => { load(); }, [load]);

  const claim = async (w) => {
    setBusyId(w.id); setError(null);
    const { data: apptId, error } = await supabase.rpc("claim_waitlist_offer", { p_id: w.id });
    if (!error && apptId) await supabase.rpc("apply_credit", { p_appointment_id: apptId });
    setBusyId(null);
    if (error) { setError(friendlyError(error)); load(); return; }
    load();
    onBooked?.();
  };
  const leave = async (w) => {
    setBusyId(w.id);
    await supabase.rpc("leave_waitlist", { p_id: w.id });
    setBusyId(null);
    load();
  };

  if (entries.length === 0 && credits.length === 0) return null;
  const docName = (x) => x.doctor?.profiles?.full_name || t("your doctor");

  return (
    <div className="space-y-4 mb-8">
      {error && <Notice tone="error">{error}</Notice>}
      {entries.filter((w) => w.status === "offered").map((w) => (
        <div key={w.id} className="rounded-xl border-2 border-stamp bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-4 card-deal">
          <div className="font-body">
            <Stamp>{t("Slot opened")}</Stamp>
            <div className="text-ink font-semibold mt-2">
              {docName(w)} · {new Date(w.offered_starts_at).toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="text-sm text-slate-300">{t("For {name}", { name: fullName(w.patient || {}) })} · <HoldCountdown dueAt={w.offer_expires_at} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => claim(w)} disabled={busyId === w.id} className={btn}>{busyId === w.id ? t("Booking…") : t("Book this slot")}</button>
            <button onClick={() => leave(w)} disabled={busyId === w.id} className={btnGhost}>{t("No thanks")}</button>
          </div>
        </div>
      ))}
      {entries.filter((w) => w.status === "waiting").length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-white">
          <div className="px-5 py-3 border-b border-slate-800 font-display text-lg font-bold text-ink">{t("On the waitlist")}</div>
          <ul>
            {entries.filter((w) => w.status === "waiting").map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 last:border-0 font-body">
                <div className="min-w-0">
                  <div className="text-ink font-semibold truncate">{docName(w)} · {new Date(w.preferred_date + "T12:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}</div>
                  <div className="text-sm text-slate-400">{t("For {name}", { name: fullName(w.patient || {}) })} · {t("we'll text you if a slot opens")}</div>
                </div>
                <button onClick={() => leave(w)} disabled={busyId === w.id} className="text-sm text-rose-300 hover:underline underline-offset-4">{t("Leave")}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {credits.length > 0 && (
        <div className="rounded-xl border border-ink/20 bg-mint/60 px-5 py-4 font-body">
          <div className="font-display text-lg font-bold text-ink">{t("Your credit")}</div>
          <ul className="mt-1.5 space-y-1">
            {credits.map((c) => (
              <li key={c.id} className="text-ink">
                <b className="tnum">{peso(c.amount)}</b> {t("with {doctor}, until {date}", { doctor: docName(c), date: new Date(c.expires_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) })}
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-200 mt-1.5">{t("It's used automatically on your next booking with that doctor.")}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ reviews ----------------------------- */

export function ReviewModal({ appointment, onClose, onDone }) {
  const t = useT();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!rating) { setError(t("Pick 1 to 5 stars.")); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("submit_review", { p_appointment_id: appointment.id, p_rating: rating, p_comment: comment });
    setBusy(false);
    if (error) { setError(friendlyError(error)); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("Rate your visit")} className="w-full sm:max-w-md rounded-t-xl sm:rounded-xl bg-white card-deal shadow-[0_24px_60px_-20px_rgba(19,48,94,0.5)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">{t("Rate your visit")}</h2>
            <p className="text-sm text-slate-300 font-body mt-1">{appointment.doctors?.profiles?.full_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-ink" aria-label={t("Close")}><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex gap-1" role="radiogroup" aria-label={t("Rating")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)} className="p-1">
                <Star size={32} className={n <= rating ? "text-amber-400 fill-current" : "text-slate-700"} />
              </button>
            ))}
          </div>
          <label className="block">
            <FieldLabel>{t("What should other patients know? (optional)")}</FieldLabel>
            <textarea className={inputCls + " mt-1.5 min-h-24 resize-y"} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <p className="text-sm text-slate-400 font-body">{t("Your review shows your first name and last initial.")}</p>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex gap-3">
          <button onClick={submit} disabled={busy} className={btn}>{busy ? t("Sending…") : t("Post review")}</button>
          <button onClick={onClose} className={btnGhost}>{t("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}

// The little row of stars used on cards and the profile page.
export function Stars({ value, size = 14 }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(value) ? "text-amber-400 fill-current" : "text-slate-700"} />
      ))}
    </span>
  );
}
