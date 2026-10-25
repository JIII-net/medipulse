import React, { useState, useEffect } from "react";
import { LogOut, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/AuthContext";
import { friendlyError } from "./lib/errors";
import { panel, btnSm, btnGhostSm, inputSm, FieldLabel, Notice, Stamp, tintForProfession } from "./ui";

/* ------------------------------------------------------------------ */
/*  Doctors wait for a 4MED admin to check their PRC license.          */
/*                                                                     */
/*  The database is what enforces it (medipulse-doctor-approval.sql):  */
/*  until approval a practitioner and their secretaries have no staff  */
/*  access and patients can't book them. These screens explain that    */
/*  to the doctor and give the admin a place to decide.                */
/* ------------------------------------------------------------------ */

const PRC_VERIFY_URL = "https://online.prc.gov.ph/Verification";
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

// Where the signed-in staff member's practice stands:
//   loading · approved · pending · rejected · missing (a doctor whose
//   practitioner record never saved; see FinishPracticeSetup).
// Admins are always approved; a secretary follows their doctor.
export function usePracticeApproval(refreshKey) {
  const { profile } = useAuth();
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const done = (s) => { if (!cancelled) setState(s); };
    (async () => {
      // Dev-only preview, alongside ?demo=: ?approval=pending|rejected|missing
      const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("approval");
      if (preview) {
        return done({
          status: preview,
          doctor: { prc_license: "0123456", created_at: new Date().toISOString(), profession_type: "doctor", profiles: { full_name: "Dr. Demo" } },
          review: preview === "rejected" ? { reason: "The PRC number doesn't match your name on the PRC register.", rejected_at: new Date().toISOString() } : null,
        });
      }
      if (profile.role === "admin") return done({ status: "approved" });
      let doctorId = profile.role === "doctor" ? profile.id : null;
      if (profile.role === "secretary") {
        const { data } = await supabase.from("staff_assignments").select("doctor_id").eq("secretary_id", profile.id).limit(1);
        doctorId = data?.[0]?.doctor_id || null;
      }
      if (!doctorId) return done({ status: "approved" });
      const { data: doctor, error } = await supabase.from("doctors")
        .select("id, profession_type, prc_license, license_verified, created_at, profiles(full_name)")
        .eq("id", doctorId).maybeSingle();
      // The database holds the line either way; don't lock someone out
      // of the app over a failed read.
      if (error) return done({ status: "approved" });
      if (!doctor) return done({ status: profile.role === "doctor" ? "missing" : "approved" });
      if (doctor.license_verified) return done({ status: "approved", doctor });
      let review = null;
      if (profile.role === "doctor") {
        const { data } = await supabase.from("doctor_license_reviews").select("reason, rejected_at").eq("doctor_id", doctorId).maybeSingle();
        review = data || null;
      }
      done({ status: review ? "rejected" : "pending", doctor, review });
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.role, refreshKey]);

  return state;
}

// Replaces the Clinic App until the practice is approved.
export function PendingApproval({ approval, onChanged }) {
  const { profile, signOut } = useAuth();
  const isDoctor = profile?.role === "doctor";
  const rejected = approval.status === "rejected";
  const doctor = approval.doctor || {};
  const [prc, setPrc] = useState(doctor.prc_license || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const resubmit = async () => {
    if (!prc.trim()) { setError("Enter your PRC license number."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("resubmit_license", { p_prc_license: prc.trim() });
    setBusy(false);
    if (error) { setError(friendlyError(error)); return; }
    onChanged();
  };

  const title = !isDoctor
    ? "This practice is waiting for approval"
    : rejected ? "We couldn't verify your license yet" : "We're checking your PRC license";

  return (
    <div className="max-w-xl mx-auto px-5 py-14">
      <div className={"rounded-xl border bg-white overflow-hidden " + (rejected ? "border-rose-500/40" : "border-ink/20")}>
        <div className={"px-6 py-5 border-b flex items-start justify-between gap-4 " + (rejected ? "bg-blush border-rose-500/30" : "border-ink/15 " + tintForProfession(doctor.profession_type))}>
          <div>
            <FieldLabel>Practitioner card</FieldLabel>
            <h1 className="font-display text-3xl font-bold text-ink mt-1">{title}</h1>
          </div>
          {rejected ? <Stamp tone="void" size="lg">Not approved</Stamp> : <span className="pending-mark shrink-0">In review</span>}
        </div>

        <div className="px-6 py-6 font-body space-y-4">
          {!isDoctor ? (
            <p className="text-slate-200">
              {doctor.profiles?.full_name || "Your doctor"}'s PRC license hasn't been approved by 4MED yet. The Clinic App opens for you as soon as it is.
            </p>
          ) : rejected ? (
            <>
              <Notice tone="error">{approval.review.reason}</Notice>
              <p className="text-slate-200">Fix your PRC license number if it's wrong, then send it for review again. If it's already right, send it as it is and we'll take another look.</p>
              <label className="block">
                <FieldLabel>PRC license number</FieldLabel>
                <input className={inputSm + " mt-1.5 tnum max-w-xs"} value={prc} onChange={(e) => setPrc(e.target.value)} placeholder="7 digits" />
              </label>
              {error && <Notice tone="error">{error}</Notice>}
              <button onClick={resubmit} disabled={busy} className={btnSm}>{busy ? "Sending…" : "Send for review again"}</button>
            </>
          ) : (
            <>
              <p className="text-slate-200">
                A 4MED administrator checks every practitioner against the PRC register before they can see patients or take bookings. Your Clinic App opens here as soon as yours is approved, and your 14-day trial starts that day.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>PRC license</FieldLabel><div className="write-in text-ink mt-1 tnum">{doctor.prc_license || "—"}</div></div>
                <div><FieldLabel>Sent</FieldLabel><div className="write-in text-ink mt-1">{doctor.created_at ? fmtDate(doctor.created_at) : "—"}</div></div>
              </div>
              <p className="text-sm text-slate-400">Nothing is charged while you wait.</p>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-800 flex flex-wrap gap-2">
          <button onClick={onChanged} className={btnGhostSm}><RefreshCw size={14} /> Check again</button>
          <button onClick={signOut} className={btnGhostSm}><LogOut size={14} /> Log out</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ admin ------------------------------ */

// Shown only in the dev-only ?demo= preview, which has no database.
const SAMPLE_APPLICATIONS = [
  { id: "s1", full_name: "Dr. Maria Santos", email: "maria.santos@example.com", phone: "0917 555 0101", profession_type: "doctor", specialties: ["Pediatrics"], prc_license: "0098765", signed_up: "2026-10-24T02:00:00Z", license_verified: false },
  { id: "s2", full_name: "Dr. Paolo Reyes", email: "paolo.reyes@example.com", phone: null, profession_type: "dentist", specialties: ["General Dentistry", "Orthodontics"], prc_license: "0045123", signed_up: "2026-10-25T05:30:00Z", license_verified: false },
  { id: "s3", full_name: "Dr. Ana Cruz", email: "ana.cruz@example.com", profession_type: "doctor", specialties: ["Cardiology"], prc_license: "0123000", signed_up: "2026-10-20T01:00:00Z", license_verified: false, rejected_at: "2026-10-22T03:00:00Z", rejection_reason: "The PRC number doesn't match your name on the PRC register." },
  { id: "s4", full_name: "Dr. Jose Lim", email: "jose.lim@example.com", profession_type: "doctor", specialties: ["Internal Medicine"], prc_license: "0077001", signed_up: "2026-10-10T01:00:00Z", license_verified: true, verified_at: "2026-10-11T01:00:00Z" },
];

export function DoctorApprovalsTab({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("waiting");
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null); // doctor id whose reason box is open
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.rpc("admin_doctor_applications");
    if (error && import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo")) { setRows(SAMPLE_APPLICATIONS); return; }
    if (error) { setError(friendlyError(error)); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const stateOf = (r) => (r.license_verified ? "approved" : r.rejected_at ? "rejected" : "waiting");
  const counts = (rows || []).reduce((c, r) => ({ ...c, [stateOf(r)]: (c[stateOf(r)] || 0) + 1 }), {});
  const shown = (rows || []).filter((r) => stateOf(r) === filter);

  const decide = async (r, approve) => {
    setBusy(r.id); setError(null);
    const { error } = approve
      ? await supabase.rpc("approve_doctor", { p_doctor_id: r.id })
      : await supabase.rpc("reject_doctor", { p_doctor_id: r.id, p_reason: reason });
    setBusy(null);
    if (error) { setError(friendlyError(error)); return; }
    setRejecting(null); setReason("");
    await load();
    onChanged?.();
  };

  return (
    <div className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="font-display text-lg font-bold text-ink">Practitioners to approve</div>
        <a href={PRC_VERIFY_URL} target="_blank" rel="noopener noreferrer" className={btnGhostSm}>
          PRC license verification <ExternalLink size={14} />
        </a>
      </div>
      <p className="text-sm text-slate-300 font-body mb-4 max-w-3xl">
        Check each license on the PRC site before approving. Until you approve, a practitioner can't open the Clinic App and patients can't find or book them. Their 14-day trial starts the day you approve.
      </p>
      {error && <Notice tone="error" className="mb-4">{error}</Notice>}

      <div className="inline-flex gap-1 rounded-lg border border-slate-700 bg-white p-1 text-sm mb-4">
        {[["waiting", "Waiting"], ["rejected", "Not approved"], ["approved", "Approved"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
            className={"px-3 py-1.5 rounded-md font-body " + (filter === v ? "bg-ink text-white font-semibold" : "text-slate-300 hover:text-ink")}>
            {l}{counts[v] ? <span className="tnum"> · {counts[v]}</span> : null}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="py-10 text-center text-slate-400 font-body">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="py-10 text-center text-slate-300 font-body">
          {filter === "waiting" ? "No one is waiting. New signups appear here." : filter === "rejected" ? "No licenses turned down." : "No approved practitioners yet."}
        </div>
      ) : (
        <ul className="font-body">
          {shown.map((r) => (
            <li key={r.id} className="py-4 border-b border-slate-800 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-ink font-semibold">{r.full_name || "—"}</div>
                  <div className="text-sm text-slate-300 capitalize">{r.profession_type || "doctor"}{r.specialties?.length ? " · " + r.specialties.join(", ") : ""}</div>
                  <div className="text-sm text-slate-400 break-all">{[r.email, r.phone].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="text-right shrink-0">
                  <FieldLabel>PRC license</FieldLabel>
                  <div className="text-xl text-ink tnum font-semibold">{r.prc_license || "—"}</div>
                  <div className="text-xs text-slate-400">Signed up {fmtDate(r.signed_up)}</div>
                </div>
              </div>

              {r.rejected_at && !r.license_verified && (
                <div className="mt-2 text-sm text-slate-200"><span className="field-label">Reason · {fmtDate(r.rejected_at)}</span> {r.rejection_reason}</div>
              )}
              {r.license_verified && (
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-300"><Stamp>Approved</Stamp>{r.verified_at && <span>{fmtDate(r.verified_at)}</span>}</div>
              )}

              {!r.license_verified && (
                rejecting === r.id ? (
                  <div className="mt-3 space-y-2 max-w-xl">
                    <label className="block">
                      <FieldLabel>Why not? The practitioner sees this.</FieldLabel>
                      <textarea className={inputSm + " mt-1.5 min-h-20 resize-y"} value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="The PRC number doesn't match your name on the PRC register." autoFocus />
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => decide(r, false)} disabled={busy === r.id || !reason.trim()} className={btnSm}>{busy === r.id ? "Saving…" : "Send"}</button>
                      <button onClick={() => { setRejecting(null); setReason(""); }} className={btnGhostSm}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => decide(r, true)} disabled={busy === r.id} className={btnSm}>{busy === r.id ? "Approving…" : "Approve"}</button>
                    <button onClick={() => { setRejecting(r.id); setReason(r.rejection_reason || ""); }} className={btnGhostSm}>Not approved…</button>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
