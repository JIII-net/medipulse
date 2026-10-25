import React, { useState, useEffect } from "react";
import { Gift, Copy, Check, Share2, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { friendlyError } from "./lib/errors";
import { panel, btnSm, btnGhostSm, inputSm, FieldLabel, Notice, Stamp } from "./ui";

/* ------------------------------------------------------------------ */
/*  Referrals, as in 4POS (medipulse-referrals.sql):                   */
/*    4PP…  a 4Keys Partner Portal partner; the first paid invoice is  */
/*          reported to 4PP so the partner earns their fee there.      */
/*    4MED… another doctor's own code; that doctor earns credit off    */
/*          their next 4MED invoices.                                  */
/*  Either gives the new practice a welcome discount on its first      */
/*  invoice. One code per practice.                                    */
/* ------------------------------------------------------------------ */

export const PARTNER_CODE = /^4PP[A-Z0-9]+$/;
export const DOCTOR_CODE = /^4MED[A-Z0-9]+$/;
export const normalizeCode = (raw) => String(raw || "").toUpperCase().replace(/\s+/g, "");
export const referralLink = (code) => `${window.location.origin}/?ref=${encodeURIComponent(code)}`;

const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (r) => `${Math.round(Number(r || 0) * 100)}%`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export const DEFAULT_SETTINGS = { enabled: true, partnerDiscount: 0.1, doctorDiscount: 0.1, rewardRate: 0.1, rewardCap: 3000 };

// The admin's referral rates (readable before sign-in, for the sign-up form).
export function useReferralSettings() {
  const [s, setS] = useState(DEFAULT_SETTINGS);
  useEffect(() => {
    supabase.from("platform_settings").select("key, value").like("key", "referral\\_%").then(({ data }) => {
      if (!data?.length) return;
      const v = Object.fromEntries(data.map((r) => [r.key, r.value]));
      const num = (k, d) => (Number.isFinite(Number(v[k])) && v[k] !== "" && v[k] != null ? Number(v[k]) : d);
      setS({
        enabled: String(v.referral_enabled ?? "true").toLowerCase() !== "false",
        partnerDiscount: num("referral_partner_discount", 0.1),
        doctorDiscount: num("referral_doctor_discount", 0.1),
        rewardRate: num("referral_reward_rate", 0.1),
        rewardCap: num("referral_reward_cap", 3000),
      });
    });
  }, []);
  return s;
}

/**
 * Checks a code before sign-up. Doctor codes are looked up here; partner
 * codes are asked from 4PP through the partner-portal function.
 * -> { status: "valid", kind, code, name } | { status: "invalid" | "unavailable", code }
 */
export async function checkReferralCode(raw) {
  const code = normalizeCode(raw);
  if (DOCTOR_CODE.test(code)) {
    const { data, error } = await supabase.rpc("check_doctor_referral_code", { p_code: code });
    if (error) return { status: "unavailable", code };
    return data ? { status: "valid", kind: "doctor", code, name: data } : { status: "invalid", code };
  }
  if (PARTNER_CODE.test(code)) {
    try {
      const { data, error } = await supabase.functions.invoke("partner-portal", { body: { action: "check", code } });
      if (error || !data) return { status: "unavailable", code };
      return data.status === "valid" ? { status: "valid", kind: "partner", code: data.code || code, name: data.partner_name } : { status: data.status, code };
    } catch {
      return { status: "unavailable", code };
    }
  }
  return { status: "invalid", code };
}

/** Reports a practice's first paid invoice to 4PP (admins). Never throws. */
export async function reportPartnerReferral(doctorId) {
  try {
    const { data, error } = await supabase.functions.invoke("partner-portal", { body: { action: "record", doctor_id: doctorId } });
    if (error) return { status: "failed", detail: error.message };
    return data;
  } catch (e) {
    return { status: "failed", detail: e?.message || "4PP could not be reached" };
  }
}

export function partnerReportNote(code, r) {
  if (!r || r.status === "nothing") return "";
  if (r.status === "recorded") return `4Keys partner ${code || ""} credited in 4PP (fee ${peso(r.fee)}).`;
  if (r.status === "rejected") return `4PP did not accept partner code ${code || ""}: ${r.detail}`;
  return `The referral for partner ${code || ""} couldn't be sent to 4PP yet (${r.detail}). Retry it under Referrals.`;
}

/* ------------------------------ doctor ------------------------------ */

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} className={btnGhostSm}>
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copied" : label}
    </button>
  );
}

// Practice → Subscription: the doctor's own code, what it earns, and who used it.
export function DoctorReferralCard({ doctorId }) {
  const settings = useReferralSettings();
  const [code, setCode] = useState(null);
  const [balance, setBalance] = useState(0);
  const [referred, setReferred] = useState([]);
  const [mine, setMine] = useState(null); // the code this practice joined with

  useEffect(() => {
    if (!doctorId) return;
    (async () => {
      const [d, ledger, refs, byDoctor, byPartner] = await Promise.all([
        supabase.from("doctors").select("referral_code").eq("id", doctorId).maybeSingle(),
        supabase.from("referral_credit_ledger").select("amount").eq("doctor_id", doctorId),
        supabase.from("doctor_referrals").select("id, referred_name, status, reward_amount, created_at, rewarded_at").eq("referrer_doctor_id", doctorId).order("created_at", { ascending: false }),
        supabase.from("doctor_referrals").select("code, status").eq("referred_doctor_id", doctorId).maybeSingle(),
        supabase.from("partner_referrals").select("code").eq("doctor_id", doctorId).maybeSingle(),
      ]);
      // Dev-only ?demo= preview has no database: show a sample card.
      const demo = import.meta.env.DEV && d.error && new URLSearchParams(window.location.search).get("demo");
      setCode(d.data?.referral_code || (demo ? "4MEDMS" : null));
      setBalance(demo ? 149.9 : Math.max(0, (ledger.data || []).reduce((s, r) => s + Number(r.amount || 0), 0)));
      setReferred(demo ? [
        { id: "1", referred_name: "Dr. Paolo Reyes", status: "rewarded", reward_amount: 149.9, created_at: "2026-10-02T02:00:00Z" },
        { id: "2", referred_name: "Dra. Ana Cruz", status: "pending", created_at: "2026-10-20T02:00:00Z" },
      ] : refs.data || []);
      setMine(byPartner.data?.code || byDoctor.data?.code || null);
    })();
  }, [doctorId]);

  if (!settings.enabled || !code) return null;
  const link = referralLink(code);
  const share = async () => {
    const text = `I use 4MED for my clinic. Sign up with my code ${code} and get ${pct(settings.doctorDiscount)} off your first invoice.`;
    if (navigator.share) { try { await navigator.share({ title: "4MED", text, url: link }); return; } catch { /* closed */ } }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank", "noopener,width=600,height=520");
  };

  return (
    <div className={panel + " mt-5"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-bold text-ink"><Gift size={18} /> Refer a colleague</div>
          <p className="text-sm text-slate-300 font-body mt-1 max-w-xl">
            A doctor who signs up with your code gets {pct(settings.doctorDiscount)} off their first invoice. When they pay it, you earn {pct(settings.rewardRate)} of their plan
            {settings.rewardCap > 0 ? ` (up to ${peso(settings.rewardCap)})` : ""} as credit off your next 4MED invoices.
          </p>
        </div>
        <div className="text-right shrink-0">
          <FieldLabel>Your credit</FieldLabel>
          <div className="text-2xl font-bold text-ink tnum">{peso(balance)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="rounded-lg border-2 border-dashed border-ink/40 bg-ground px-4 py-2 font-display text-2xl font-extrabold tracking-wider text-ink tnum">{code}</div>
        <CopyButton text={code} label="Copy code" />
        <CopyButton text={link} label="Copy link" />
        <button onClick={share} className={btnGhostSm}><Share2 size={14} /> Share</button>
      </div>

      {referred.length > 0 && (
        <ul className="mt-5 border-t border-slate-800 font-body">
          {referred.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-800 last:border-0 text-sm">
              <span className="text-ink">{r.referred_name} <span className="text-slate-400">· joined {fmtDate(r.created_at)}</span></span>
              {r.status === "rewarded"
                ? <span className="flex items-center gap-2"><span className="tnum text-ink">+{peso(r.reward_amount)}</span><Stamp>Earned</Stamp></span>
                : r.status === "voided" ? <Stamp tone="void">Void</Stamp> : <span className="pending-mark">Waiting for first payment</span>}
            </li>
          ))}
        </ul>
      )}
      {mine && <p className="mt-4 text-xs text-slate-400 font-body">You joined 4MED with code <b className="tnum">{mine}</b>.</p>}
    </div>
  );
}

/* ------------------------------ admin ------------------------------ */

export function ReferralsAdminTab() {
  const [partners, setPartners] = useState([]);
  const [doctorRefs, setDoctorRefs] = useState([]);
  const [balances, setBalances] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    const [p, d, l, s] = await Promise.all([
      supabase.from("partner_referrals").select("*, doctor:doctor_id(profiles(full_name))").order("created_at", { ascending: false }),
      supabase.from("doctor_referrals").select("*, referrer:referrer_doctor_id(referral_code, profiles(full_name))").order("created_at", { ascending: false }),
      supabase.from("referral_credit_ledger").select("doctor_id, amount, doctor:doctor_id(profiles(full_name))"),
      supabase.from("platform_settings").select("key, value").like("key", "referral\\_%"),
    ]);
    if (p.error || d.error) setError(friendlyError(p.error || d.error));
    setPartners(p.data || []);
    setDoctorRefs(d.data || []);
    const byDoctor = {};
    (l.data || []).forEach((r) => {
      byDoctor[r.doctor_id] = byDoctor[r.doctor_id] || { name: r.doctor?.profiles?.full_name || "—", amount: 0 };
      byDoctor[r.doctor_id].amount += Number(r.amount || 0);
    });
    setBalances(Object.values(byDoctor).filter((b) => b.amount > 0).sort((a, b) => b.amount - a.amount));
    const v = Object.fromEntries((s.data || []).map((r) => [r.key, r.value]));
    setCfg({
      enabled: String(v.referral_enabled ?? "true").toLowerCase() !== "false",
      partner: String(Math.round(Number(v.referral_partner_discount ?? 0.1) * 100)),
      doctor: String(Math.round(Number(v.referral_doctor_discount ?? 0.1) * 100)),
      reward: String(Math.round(Number(v.referral_reward_rate ?? 0.1) * 100)),
      cap: String(Number(v.referral_reward_cap ?? 3000)),
    });
  };
  useEffect(() => { load(); }, []);

  const report = async (r) => {
    setBusy(r.doctor_id); setNote(null); setError(null);
    const res = await reportPartnerReferral(r.doctor_id);
    setBusy(null);
    setNote(partnerReportNote(r.code, res) || res?.detail || "Nothing to report yet: the practice hasn't paid an invoice.");
    load();
  };
  const remove = async (r) => {
    if (!window.confirm(`Remove partner code ${r.code} from ${r.doctor?.profiles?.full_name || "this practice"}?`)) return;
    const { error } = await supabase.from("partner_referrals").delete().eq("doctor_id", r.doctor_id);
    if (error) { setError(friendlyError(error)); return; }
    load();
  };
  const saveSettings = async () => {
    setError(null);
    const rate = (x) => String(Math.min(Math.max(Number(x) || 0, 0), 100) / 100);
    const now = new Date().toISOString();
    const { error } = await supabase.from("platform_settings").upsert([
      { key: "referral_enabled", value: cfg.enabled ? "true" : "false", updated_at: now },
      { key: "referral_partner_discount", value: rate(cfg.partner), updated_at: now },
      { key: "referral_doctor_discount", value: rate(cfg.doctor), updated_at: now },
      { key: "referral_reward_rate", value: rate(cfg.reward), updated_at: now },
      { key: "referral_reward_cap", value: String(Math.max(Number(cfg.cap) || 0, 0)), updated_at: now },
    ]);
    if (error) { setError(friendlyError(error)); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const P_STATUS = { pending: ["Not reported yet", null], recorded: ["Credited in 4PP", "stamp"], rejected: ["Rejected by 4PP", "void"], failed: ["Couldn't send", "void"] };

  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="info">{note}</Notice>}

      <div className={panel}>
        <div className="font-display text-lg font-bold text-ink mb-1">4PP partner referrals</div>
        <p className="text-sm text-slate-300 font-body mb-4">Practices that signed up with a 4Keys partner code. Their first paid invoice is reported to 4PP when you record the payment, so the partner earns their fee there. Retry here if it didn't go through.</p>
        {partners.length === 0 ? <p className="text-sm text-slate-400 font-body">No partner referrals yet.</p> : (
          <ul className="font-body">
            {partners.map((r) => {
              const [label, tone] = P_STATUS[r.status] || [r.status, null];
              return (
                <li key={r.doctor_id} className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-800 last:border-0">
                  <div className="min-w-0">
                    <div className="text-ink font-semibold">{r.doctor?.profiles?.full_name || "—"} <span className="tnum text-slate-300 font-normal">· {r.code}</span></div>
                    <div className="text-sm text-slate-400">{r.detail || `Joined ${fmtDate(r.created_at)}`}{r.status === "recorded" && r.fee != null ? ` · partner fee ${peso(r.fee)}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tone === "stamp" ? <Stamp>{label}</Stamp> : tone === "void" ? <Stamp tone="void">{label}</Stamp> : <span className="pending-mark">{label}</span>}
                    {r.status !== "recorded" && (
                      <>
                        <button onClick={() => report(r)} disabled={busy === r.doctor_id} className={btnGhostSm}><RefreshCw size={14} /> {busy === r.doctor_id ? "Sending…" : r.status === "pending" ? "Report to 4PP" : "Retry"}</button>
                        <button onClick={() => remove(r)} className={btnGhostSm} aria-label={`Remove ${r.code}`}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={panel}>
        <div className="font-display text-lg font-bold text-ink mb-1">Doctor referrals</div>
        <p className="text-sm text-slate-300 font-body mb-4">Practices that signed up with another doctor's 4MED code. The referrer earns credit when you record the new practice's first payment.</p>
        {doctorRefs.length === 0 ? <p className="text-sm text-slate-400 font-body">No doctor referrals yet.</p> : (
          <ul className="font-body">
            {doctorRefs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-800 last:border-0 text-sm">
                <span className="text-ink"><b>{r.referred_name}</b> <span className="text-slate-400">referred by</span> {r.referrer?.profiles?.full_name || "—"} <span className="tnum text-slate-400">· {r.code} · {fmtDate(r.created_at)}</span></span>
                {r.status === "rewarded" ? <span className="flex items-center gap-2"><span className="tnum">{peso(r.reward_amount)}</span><Stamp>Earned</Stamp></span>
                  : r.status === "voided" ? <Stamp tone="void">Void</Stamp> : <span className="pending-mark">Waiting for first payment</span>}
              </li>
            ))}
          </ul>
        )}
        {balances.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-800">
            <div className="field-label mb-2">Credit balances</div>
            <ul className="font-body text-sm">
              {balances.map((b) => <li key={b.name} className="flex justify-between py-1"><span className="text-ink">{b.name}</span><span className="tnum">{peso(b.amount)}</span></li>)}
            </ul>
          </div>
        )}
      </div>

      {cfg && (
        <div className={panel}>
          <div className="font-display text-lg font-bold text-ink mb-3">Referral settings</div>
          <label className="flex items-center gap-2 font-body text-ink mb-4">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} />
            Referrals are on (discounts and doctor credit)
          </label>
          <div className="grid sm:grid-cols-4 gap-4 max-w-3xl">
            {[["partner", "4PP code discount (%)"], ["doctor", "Doctor code discount (%)"], ["reward", "Referrer credit (%)"], ["cap", "Credit cap (₱, 0 = none)"]].map(([k, l]) => (
              <label key={k} className="block">
                <FieldLabel>{l}</FieldLabel>
                <input type="number" min="0" className={inputSm + " mt-1.5 tnum"} value={cfg[k]} onChange={(e) => setCfg((c) => ({ ...c, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 font-body mt-2">Discounts apply to a practice's first invoice. Credit is a share of that invoice before the discount, earned when it's paid.</p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={saveSettings} className={btnSm}>Save settings</button>
            {saved && <span className="text-sm text-ink font-body">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
