import React, { useState, useEffect } from "react";
import { X, Upload, Check, AlertCircle, Image as ImageIcon } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { BUCKET_PAYMENT_PROOFS, validateUpload, uploadPrivate, signedUrl } from "./lib/uploads";

/* ------------------------------------------------------------------ */
/*  Proof of payment — patient uploads a GCash/bank screenshot against */
/*  an appointment that's being held pending payment; staff review it  */
/*  and confirm or reject.                                             */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";

export const METHODS = ["gcash", "maya", "bank", "card", "cash"];

const peso = (n) => "₱" + Number(n || 0).toLocaleString();

export function paymentLabel(status) {
  return {
    awaiting_payment: "awaiting payment",
    proof_submitted: "checking payment",
    verified: "paid",
    rejected: "payment rejected",
  }[status] || null;
}

export const paymentStyle = {
  awaiting_payment: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  proof_submitted: "text-violet-300 border-violet-500/40 bg-violet-500/10",
  verified: "text-teal-300 border-teal-400/40 bg-teal-400/10",
  rejected: "text-rose-300 border-rose-500/30 bg-rose-500/10",
};

/* -------------------------- upload (patient) ----------------------- */

export function PaymentProofModal({ appointment, userId, amount, instructions, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [f, setF] = useState({ amount: amount || "", method: "gcash", reference_no: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e) => {
    const picked = e.target.files?.[0] || null;
    const err = validateUpload(picked);
    if (err) { setError(err); setFile(null); return; }
    setError(null);
    setFile(picked);
  };

  const submit = async () => {
    const err = validateUpload(file);
    if (err) { setError(err); return; }
    if (!Number(f.amount)) { setError("Enter the amount you sent."); return; }
    setBusy(true); setError(null);

    const { path, error: upErr } = await uploadPrivate(BUCKET_PAYMENT_PROOFS, userId, appointment.id, file);
    if (upErr) { setError("Upload failed: " + upErr); setBusy(false); return; }

    const { error: rpcErr } = await supabase.rpc("submit_payment_proof", {
      p_appointment_id: appointment.id,
      p_storage_path: path,
      p_amount: Number(f.amount),
      p_method: f.method,
      p_reference_no: f.reference_no.trim() || null,
      p_note: f.note.trim() || null,
    });
    setBusy(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-slate-50">Send proof of payment</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>

        {instructions && (
          <div className="mb-4 rounded-2xl border border-teal-400/30 bg-teal-400/5 px-4 py-3">
            <div className="text-xs font-mono2 text-teal-300 mb-1">HOW TO PAY</div>
            <p className="text-sm text-slate-200 font-body whitespace-pre-wrap">{instructions}</p>
            {amount ? <p className="text-sm text-slate-300 font-body mt-2">Amount due: <strong>{peso(amount)}</strong></p> : null}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <label className="block mb-3 cursor-pointer">
          <div className="rounded-2xl border border-dashed border-slate-600 hover:border-teal-400 transition-colors px-4 py-6 text-center">
            {preview ? (
              <img src={preview} alt="Your payment screenshot" className="max-h-48 mx-auto rounded-xl" />
            ) : file ? (
              <div className="text-sm text-slate-200 font-body flex items-center justify-center gap-2"><ImageIcon size={16} /> {file.name}</div>
            ) : (
              <div className="text-sm text-slate-400 font-body flex flex-col items-center gap-1.5">
                <Upload size={20} className="text-slate-500" />
                Tap to attach your screenshot or receipt
                <span className="text-xs text-slate-600">JPG, PNG or PDF · up to 5 MB</span>
              </div>
            )}
          </div>
          <input type="file" accept="image/*,application/pdf" onChange={pick} className="hidden" />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <input className={inputCls} type="number" step="0.01" placeholder="Amount sent" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} />
          <select className={inputCls} value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value }))}>
            {METHODS.map((m) => <option key={m} value={m}>{m === "bank" ? "Bank transfer" : m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        <input className={inputCls + " mb-3"} placeholder="Reference number (from your receipt)" value={f.reference_no} onChange={(e) => setF((x) => ({ ...x, reference_no: e.target.value }))} />
        <input className={inputCls + " mb-4"} placeholder="Note for the clinic (optional)" value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />

        <div className="flex gap-2">
          <button onClick={onClose} className={btnGhost + " flex-1"}>Cancel</button>
          <button onClick={submit} disabled={busy} className={btnPrimary + " flex-1"}>{busy ? "Sending…" : "Send proof"}</button>
        </div>
        <p className="text-xs text-slate-500 font-body mt-3">
          The clinic checks your payment and confirms your slot. You'll see the status here.
        </p>
      </div>
    </div>
  );
}

/* ------------------------- review (staff) -------------------------- */

export function PaymentProofReview({ appointmentId, onClose, onReviewed }) {
  const [proofs, setProofs] = useState([]);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("payment_proofs")
      .select("*, submitter:submitted_by(full_name)")
      .eq("appointment_id", appointmentId)
      .order("submitted_at", { ascending: false });
    if (error) { setError(error.message); return; }
    setProofs(data || []);
    const next = {};
    for (const p of data || []) {
      next[p.id] = await signedUrl(BUCKET_PAYMENT_PROOFS, p.storage_path, 600);
    }
    setUrls(next);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [appointmentId]);

  const review = async (proofId, approve) => {
    if (!approve && !rejectNote.trim()) { setError("Give a reason so the patient knows what to fix."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("review_payment_proof", {
      p_proof_id: proofId,
      p_approve: approve,
      p_note: approve ? null : rejectNote.trim(),
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onReviewed();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-slate-50">Payment proof</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">{error}</div>
        )}

        {proofs.length === 0 ? (
          <div className="text-sm text-slate-500 font-body py-6 text-center">Nothing submitted yet.</div>
        ) : proofs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-800 p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-sm text-slate-100 font-body">
                {peso(p.amount)} · {p.method} {p.reference_no ? <span className="font-mono2 text-xs text-slate-400">· {p.reference_no}</span> : null}
              </span>
              <span className={"px-2.5 py-0.5 rounded-full border text-xs font-body " + (paymentStyle[p.status === "pending" ? "proof_submitted" : p.status === "verified" ? "verified" : "rejected"])}>
                {p.status}
              </span>
            </div>
            {urls[p.id] ? (
              <a href={urls[p.id]} target="_blank" rel="noreferrer">
                <img src={urls[p.id]} alt="Payment proof" className="w-full rounded-xl border border-slate-800" />
              </a>
            ) : (
              <div className="text-xs text-slate-500 font-body">Preparing preview…</div>
            )}
            {p.note && <p className="text-sm text-slate-400 font-body mt-2">"{p.note}"</p>}
            <div className="font-mono2 text-xs text-slate-600 mt-2">
              Sent {new Date(p.submitted_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {p.review_note ? ` · rejected: ${p.review_note}` : ""}
            </div>

            {p.status === "pending" && (
              <div className="mt-3 space-y-2">
                <input className={inputCls} placeholder="Reason, if rejecting" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => review(p.id, false)} disabled={busy} className={btnGhost + " flex-1"}>Reject</button>
                  <button onClick={() => review(p.id, true)} disabled={busy} className={btnPrimary + " flex-1 flex items-center justify-center gap-1.5"}>
                    <Check size={14} /> {busy ? "Working…" : "Verify & confirm"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
