import React, { useState, useEffect } from "react";
import { CreditCard, MapPin, Users, Plus, Trash2, Copy, Check, AlertCircle, FileText, Pencil, X, Share2, Upload, ExternalLink } from "lucide-react";
import { profileUrl, slugify } from "./lib/doctors";
import { DoctorInvoices } from "./SubscriptionBilling";
import { DoctorReferralCard } from "./Referrals";
import { validateUpload } from "./lib/uploads";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { inputSm as inputCls, btnSm as btnPrimary, btnGhostSm as btnGhost, panel as card, StatusMark, Avatar, FieldLabel } from "./ui";

/* ------------------------------------------------------------------ */
/*  Practice settings — for doctors: subscription, locations, team     */
/* ------------------------------------------------------------------ */

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
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">My practice</h1>
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
              <StatusMark status={sub.status} size="lg" />
            </div>
          )}
          <DoctorInvoices doctorId={me} />
          <p className="text-xs text-slate-500 font-body mt-3">To change plans or billing, contact 4MED support.</p>
          <DoctorReferralCard doctorId={me} />
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

        <PublicProfileCard doctorId={me} />
        <BookingRulesCard doctorId={me} />

        <ConsentDocsCard doctorId={me} />

        <TemplatesCard doctorId={me} />
      </div>
    </div>
  );
}

/* ------------------------- booking & payment ------------------------- */

// New settings start at a 30-minute hold: long enough to open GCash and
// send, short enough that an unpaid slot goes back on sale quickly.
const EMPTY_RULES = { require_prepayment: false, prepayment_amount: "", payment_instructions: "", prepayment_hold_minutes: 30 };

const HOLD_CHOICES = [
  [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"],
  [360, "6 hours"], [1440, "24 hours"], [2880, "2 days"],
];

const DOWNPAYMENT_SHARES = [20, 30, 50];

/* --------------------------- public profile -------------------------- */

// The page patients see at /dr/<slug>, and the link the doctor shares.
function PublicProfileCard({ doctorId }) {
  const { profile } = useAuth();
  const [f, setF] = useState({ slug: "", bio: "", years_experience: "", photo_url: "" });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!doctorId) return;
    supabase.from("doctors").select("slug, bio, years_experience, photo_url").eq("id", doctorId).maybeSingle()
      .then(({ data }) => data && setF({
        slug: data.slug || slugify(profile?.full_name, doctorId),
        bio: data.bio || "",
        years_experience: data.years_experience ?? "",
        photo_url: data.photo_url || "",
      }));
  }, [doctorId, profile?.full_name]);

  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setSaved(false); };

  const uploadPhoto = async (file) => {
    const bad = validateUpload(file);
    if (bad || !file.type.startsWith("image/")) { setError(bad || "Use a photo (JPG, PNG or WEBP)."); return; }
    setBusy(true); setError(null);
    const path = `${doctorId}/photo-${Date.now()}.${(file.name.split(".").pop() || "jpg").toLowerCase()}`;
    const { error: upErr } = await supabase.storage.from("doctor-photos").upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) { setBusy(false); setError("Upload failed: " + upErr.message); return; }
    const { data } = supabase.storage.from("doctor-photos").getPublicUrl(path);
    setBusy(false);
    set({ photo_url: data.publicUrl });
  };

  const save = async () => {
    const slug = slugify(f.slug);
    if (slug.length < 3) { setError("The link needs at least 3 letters or numbers."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from("doctors").update({
      slug, bio: f.bio.trim() || null,
      years_experience: f.years_experience === "" ? null : Number(f.years_experience),
      photo_url: f.photo_url || null,
    }).eq("id", doctorId);
    setBusy(false);
    if (error) {
      setError(/doctors_slug_key|duplicate/i.test(error.message) ? "Another doctor already uses that link. Try adding your city or specialty." : error.message);
      return;
    }
    setF((x) => ({ ...x, slug }));
    setSaved(true);
  };

  const url = profileUrl(slugify(f.slug));
  const copy = () => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className={card}>
      <div className="font-display text-lg font-bold text-ink mb-1">Public profile</div>
      <p className="text-sm text-slate-300 font-body mb-4">Your page on 4MED. Share the link on Facebook or Messenger so patients can see your schedule and reviews and book you directly.</p>
      {error && <div className="mb-4 text-sm text-rose-300 bg-blush border border-rose-500/30 rounded-lg px-4 py-3 font-body">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-5">
        <div className="shrink-0 flex flex-col items-center gap-2">
          {f.photo_url ? <img src={f.photo_url} alt="" className="w-24 h-24 rounded-lg object-cover border border-slate-700" /> : <Avatar name={profile?.full_name || ""} size={96} />}
          <label className={btnGhost + " cursor-pointer"}>
            <Upload size={14} /> {f.photo_url ? "Change" : "Add photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </label>
        </div>
        <div className="flex-1 space-y-3">
          <label className="block">
            <FieldLabel>Your link</FieldLabel>
            <div className="flex items-center mt-1.5">
              <span className="px-3 py-2 text-sm text-slate-400 font-body border border-r-0 border-slate-700 rounded-l-md bg-ground whitespace-nowrap">{window.location.host}/dr/</span>
              <input className={inputCls + " rounded-l-none"} value={f.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
            </div>
          </label>
          <label className="block">
            <FieldLabel>About you</FieldLabel>
            <textarea className={inputCls + " mt-1.5 min-h-24 resize-y"} maxLength={1200} placeholder="Training, what you treat, languages you speak, what patients should bring." value={f.bio} onChange={(e) => set({ bio: e.target.value })} />
          </label>
          <label className="block w-40">
            <FieldLabel>Years in practice</FieldLabel>
            <input type="number" min="0" className={inputCls + " mt-1.5 tnum"} value={f.years_experience} onChange={(e) => set({ years_experience: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        <button onClick={save} disabled={busy} className={btnPrimary}><Check size={14} /> {busy ? "Saving…" : "Save"}</button>
        <button onClick={copy} className={btnGhost}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}</button>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className={btnGhost}><Share2 size={14} /> Share on Facebook</a>
        <a href={url} target="_blank" rel="noreferrer" className={btnGhost}><ExternalLink size={14} /> View page</a>
        {saved && <span className="text-sm text-ink font-body">Saved</span>}
      </div>
    </div>
  );
}

function BookingRulesCard({ doctorId }) {
  const [f, setF] = useState(EMPTY_RULES);
  // "down" collects a set amount now and the rest at the clinic; "full"
  // collects the whole consultation fee up front (stored as a null amount).
  const [kind, setKind] = useState("down");
  const [fee, setFee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("doctors")
      .select("consult_fee, require_prepayment, prepayment_amount, payment_instructions, prepayment_hold_minutes")
      .eq("id", doctorId).maybeSingle();
    if (error) { setError(error.message); return; }
    if (data) {
      setFee(Number(data.consult_fee || 0));
      setKind(data.require_prepayment && data.prepayment_amount == null ? "full" : "down");
      setF({
        require_prepayment: !!data.require_prepayment,
        prepayment_amount: data.prepayment_amount ?? "",
        payment_instructions: data.payment_instructions || "",
        prepayment_hold_minutes: data.prepayment_hold_minutes || 30,
      });
    }
  };
  useEffect(() => { if (doctorId) load(); /* eslint-disable-next-line */ }, [doctorId]);

  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setSaved(false); };
  const amount = Number(f.prepayment_amount);
  const downValid = kind === "full" || (amount > 0 && (!fee || amount <= fee));

  const save = async () => {
    if (f.require_prepayment && !downValid) {
      setError(fee && amount > fee ? `The downpayment can't be more than your ${peso(fee)} fee.` : "Enter the downpayment amount.");
      return;
    }
    setBusy(true); setError(null); setSaved(false);
    const { error } = await supabase.from("doctors").update({
      require_prepayment: f.require_prepayment,
      prepayment_amount: kind === "full" || f.prepayment_amount === "" ? null : amount,
      payment_instructions: f.payment_instructions.trim() || null,
      prepayment_hold_minutes: Number(f.prepayment_hold_minutes) || 30,
    }).eq("id", doctorId);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setSaved(true);
    load();
  };

  const holdLabel = (HOLD_CHOICES.find(([v]) => v === Number(f.prepayment_hold_minutes)) || [0, `${f.prepayment_hold_minutes} minutes`])[1];
  const payNow = kind === "full" ? fee : amount || 0;

  return (
    <div className={card}>
      <div className="font-display text-lg font-bold text-ink mb-1 flex items-center gap-2">
        <CreditCard size={17} /> Booking and payment
      </div>
      <p className="text-sm text-slate-300 font-body mb-4">
        Ask patients to pay a downpayment, or the full fee, before their slot is confirmed. They pay by GCash, Maya or bank, upload the receipt, and your front desk approves it.
      </p>
      {error && <div className="mb-4 text-sm text-rose-300 bg-blush border border-rose-500/30 rounded-lg px-4 py-3 font-body">{error}</div>}

      <div className="inline-flex gap-1 rounded-lg border border-slate-700 bg-white p-1 text-sm mb-5" role="group" aria-label="Booking rule">
        {[[false, "Confirm bookings right away"], [true, "Ask for payment first"]].map(([val, label]) => (
          <button
            key={String(val)}
            aria-pressed={f.require_prepayment === val}
            onClick={() => set({ require_prepayment: val })}
            className={"px-3.5 py-2 rounded-md font-body transition-colors " + (f.require_prepayment === val ? "bg-ink text-white font-semibold" : "text-slate-300 hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>

      {f.require_prepayment && (
        <div className="space-y-5">
          <div>
            <span className="field-label block mb-2">What the patient pays to hold the slot</span>
            <div className="grid sm:grid-cols-2 gap-3">
              {[["down", "A downpayment", "The rest is paid at the clinic."], ["full", "The full fee", fee ? `${peso(fee)}, paid in advance.` : "Your consultation fee, paid in advance."]].map(([k, t, d]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => { setKind(k); setSaved(false); }}
                  className={"text-left rounded-lg border px-4 py-3 font-body transition-colors " + (kind === k ? "border-ink ring-2 ring-ink bg-sky/40" : "border-slate-700 bg-white hover:border-ink")}
                >
                  <div className="font-semibold text-ink">{t}</div>
                  <div className="text-sm text-slate-300">{d}</div>
                </button>
              ))}
            </div>
          </div>

          {kind === "down" && (
            <div>
              <label className="field-label block mb-1.5" htmlFor="downpayment">Downpayment amount</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                  <input
                    id="downpayment"
                    className={inputCls + " pl-7 tnum"} type="number" min="1" step="1" inputMode="decimal"
                    placeholder="500"
                    value={f.prepayment_amount}
                    onChange={(e) => set({ prepayment_amount: e.target.value })}
                  />
                </div>
                {fee > 0 && DOWNPAYMENT_SHARES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set({ prepayment_amount: String(Math.round((fee * p) / 100)) })}
                    className="px-3 py-2 rounded-md border border-slate-700 bg-white text-sm font-body text-ink hover:border-ink"
                  >
                    {p}% · {peso(Math.round((fee * p) / 100))}
                  </button>
                ))}
              </div>
              {fee > 0 && amount > 0 && amount <= fee && (
                <p className="text-sm text-slate-300 font-body mt-2 tnum">Patient pays {peso(amount)} now and {peso(fee - amount)} at the clinic.</p>
              )}
              {fee > 0 && amount > fee && <p className="text-sm text-rose-300 font-body mt-2">That's more than your {peso(fee)} consultation fee.</p>}
            </div>
          )}

          <div>
            <label className="field-label block mb-1.5" htmlFor="hold">Time to pay before the slot is released</label>
            <select id="hold" className={inputCls + " sm:w-56"} value={f.prepayment_hold_minutes} onChange={(e) => set({ prepayment_hold_minutes: e.target.value })}>
              {HOLD_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <p className="text-sm text-slate-400 font-body mt-1.5">
              The clock stops as soon as the patient uploads a receipt. If they don't pay in time, the slot opens up for someone else.
            </p>
          </div>

          <div>
            <label className="field-label block mb-1.5" htmlFor="howtopay">How to pay, shown to the patient</label>
            <textarea
              id="howtopay"
              className={inputCls + " min-h-24 resize-y"}
              placeholder={"GCash: Juan D. — 0917 123 4567\nBPI: 1234-5678-90 (Juan Dela Cruz)\nSend a screenshot after paying."}
              value={f.payment_instructions}
              onChange={(e) => set({ payment_instructions: e.target.value })}
            />
            <p className="text-sm text-slate-400 font-body mt-1.5">
              Anyone booking with you can read this, so don't put anything private here beyond your payment details.
            </p>
          </div>

          {/* what the patient will be told, so the doctor can check the wording */}
          <div className="rounded-lg border border-dashed border-amber-500/60 bg-butter/50 px-4 py-3 text-sm font-body text-ink">
            <div className="field-label mb-1">Patients will see</div>
            {kind === "full"
              ? `Pay the ${fee ? peso(fee) + " " : ""}fee within ${holdLabel} to hold your slot. The clinic confirms it after checking your receipt.`
              : `Pay a ${payNow ? peso(payNow) + " " : ""}downpayment within ${holdLabel} to hold your slot${fee && payNow ? `; the remaining ${peso(Math.max(fee - payNow, 0))} is paid at the clinic` : ""}. The clinic confirms it after checking your receipt.`}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button onClick={save} disabled={busy} className={btnPrimary}>
          <Check size={14} /> {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-ink font-body">Saved</span>}
      </div>
    </div>
  );
}

/* --------------------------- consent forms --------------------------- */

const EMPTY_DOC = { title: "", body: "", required_before_consult: true, active: true };

function ConsentDocsCard({ doctorId }) {
  const [docs, setDocs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from("consent_documents").select("*").order("title");
    if (error) { setError(error.message); return; }
    setDocs(data || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.title.trim() || !editing.body.trim()) { setError("A form needs a title and body."); return; }
    setBusy(true); setError(null);
    const payload = {
      title: editing.title.trim(),
      body: editing.body,
      required_before_consult: editing.required_before_consult,
      active: editing.active,
    };
    // Editing the wording bumps the version, so patients who signed the
    // old text are asked to read and sign the new one.
    const { error } = editing.id
      ? await supabase.from("consent_documents").update({ ...payload, version: (editing.version || 1) + 1 }).eq("id", editing.id)
      : await supabase.from("consent_documents").insert({ ...payload, doctor_id: doctorId });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setEditing(null);
    load();
  };

  const mine = docs.filter((d) => d.doctor_id === doctorId);
  const builtIn = docs.filter((d) => !d.doctor_id);

  const Row = ({ d, editable }) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-slate-200 font-body truncate">
          {d.title} <span className="font-mono2 text-xs text-slate-600">v{d.version}</span>
        </div>
        <div className="font-mono2 text-xs text-slate-500">
          {d.required_before_consult ? "required before consult" : "optional"}{d.active ? "" : " · inactive"}
        </div>
      </div>
      <button
        onClick={() => setEditing(editable ? d : { ...d, id: null, doctor_id: doctorId, title: d.title + " (my version)", version: 1 })}
        className="text-xs text-teal-300 hover:underline shrink-0"
      >
        {editable ? "Edit" : "Copy & edit"}
      </button>
    </div>
  );

  return (
    <div className={card}>
      <div className="font-display font-semibold text-slate-100 mb-1 flex items-center gap-2">
        <FileText size={15} className="text-teal-300" /> Consent forms
      </div>
      <p className="text-sm text-slate-400 font-body mb-4">
        Patients read and sign these before their consultation, in the portal or on a tablet at the desk. Everyone signing in can read them, so keep them to the form text itself.
      </p>
      {error && <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">{error}</div>}

      {mine.length > 0 && (
        <>
          <div className="text-xs font-mono2 text-slate-500 mb-1">MY FORMS</div>
          <div className="mb-4">{mine.map((d) => <Row key={d.id} d={d} editable />)}</div>
        </>
      )}
      <div className="text-xs font-mono2 text-slate-500 mb-1">BUILT-IN</div>
      {builtIn.length === 0 ? (
        <div className="text-sm text-slate-500 font-body">None yet — run the consent migration to load the standard set.</div>
      ) : builtIn.map((d) => <Row key={d.id} d={d} editable={false} />)}

      <button onClick={() => setEditing({ ...EMPTY_DOC })} className={btnPrimary + " mt-4 flex items-center gap-1.5"}>
        <Plus size={14} /> New form
      </button>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={() => setEditing(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 card-deal shadow-[0_24px_60px_-20px_rgba(19,48,94,0.5)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-slate-50">{editing.id ? "Edit form" : "New form"}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <input className={inputCls + " mb-3"} placeholder="Title, e.g. Consent to Treatment" value={editing.title} onChange={(e) => setEditing((d) => ({ ...d, title: e.target.value }))} />
            <textarea className={inputCls + " min-h-64 resize-y mb-3"} placeholder="The full text the patient reads…" value={editing.body} onChange={(e) => setEditing((d) => ({ ...d, body: e.target.value }))} />
            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center gap-2 text-sm text-slate-300 font-body cursor-pointer">
                <input type="checkbox" className="accent-teal-400" checked={editing.required_before_consult} onChange={(e) => setEditing((d) => ({ ...d, required_before_consult: e.target.checked }))} />
                Required before the consultation
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 font-body cursor-pointer">
                <input type="checkbox" className="accent-teal-400" checked={editing.active} onChange={(e) => setEditing((d) => ({ ...d, active: e.target.checked }))} />
                Active
              </label>
            </div>
            {editing.id && (
              <p className="text-xs text-amber-300 font-body mb-3">
                Saving publishes version {(editing.version || 1) + 1}. Patients who signed the current version will be asked to read and sign again.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className={btnGhost + " flex-1"}>Cancel</button>
              <button onClick={save} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Saving…" : "Save form"}</button>
            </div>
          </div>
        </div>
      )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 card-deal shadow-[0_24px_60px_-20px_rgba(19,48,94,0.5)]" onClick={(e) => e.stopPropagation()}>
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
