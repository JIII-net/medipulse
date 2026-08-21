import React, { useState, useEffect, useRef } from "react";
import { X, Check, FileText, AlertCircle, PenLine } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import SignaturePad from "./SignaturePad";
import { BUCKET_SIGNATURES, uploadDataUrl, signedUrl } from "./lib/uploads";
import { printDocument, esc, letterhead } from "./lib/print";

/* ------------------------------------------------------------------ */
/*  Consent forms — the patient reads a document, signs it, and the    */
/*  signature is stored against their record. Signing works both in    */
/*  the patient portal and on a clinic tablet handed over at the desk. */
/* ------------------------------------------------------------------ */

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";
const btnPrimary = "px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-sm font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60";
const btnGhost = "px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-body hover:border-slate-500 transition-colors";

export async function fetchConsentState(patientRecordId) {
  const [docs, sigs] = await Promise.all([
    supabase.from("consent_documents").select("*").eq("active", true).order("title"),
    supabase.from("consent_signatures").select("document_id, document_version, signed_at, signed_name")
      .eq("patient_record_id", patientRecordId),
  ]);
  const signed = sigs.data || [];
  const all = docs.data || [];
  // A document counts as signed only if the version they signed is the
  // one that's live now — editing a form bumps its version and asks again.
  const outstanding = all.filter(
    (d) => d.required_before_consult && !signed.some((s) => s.document_id === d.id && s.document_version === d.version)
  );
  return { documents: all, signatures: signed, outstanding };
}

/* --------------------------- sign one doc -------------------------- */

export function SignConsentModal({ doc, patientRecordId, userId, appointmentId, encounterId, onClose, onSigned }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sig, setSig] = useState(null);
  const [readToEnd, setReadToEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bodyRef = useRef(null);

  // "I have read this" should mean something, so the button stays locked
  // until they've actually scrolled to the bottom of the text.
  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
  };
  useEffect(() => {
    const el = bodyRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) setReadToEnd(true);
  }, [doc]);

  const canSign = readToEnd && agreed && !!sig && name.trim().length > 1;

  const sign = async () => {
    if (!canSign) return;
    setBusy(true); setError(null);
    const { path, error: upErr } = await uploadDataUrl(BUCKET_SIGNATURES, userId, doc.id, sig, "signature.png");
    if (upErr) { setError("Couldn't save the signature: " + upErr); setBusy(false); return; }

    const { error: rpcErr } = await supabase.rpc("sign_consent_document", {
      p_document_id: doc.id,
      p_patient_record_id: patientRecordId,
      p_signed_name: name.trim(),
      p_signature_path: path,
      p_appointment_id: appointmentId || null,
      p_encounter_id: encounterId || null,
      p_user_agent: navigator.userAgent.slice(0, 300),
    });
    setBusy(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    onSigned();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-700 bg-slate-900 p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-50">{doc.title}</h3>
            <div className="font-mono2 text-xs text-slate-500">Version {doc.version}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <div
          ref={bodyRef}
          onScroll={onScroll}
          className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300 font-body whitespace-pre-wrap leading-relaxed"
        >
          {doc.body}
        </div>
        {!readToEnd && (
          <p className="text-xs text-amber-300 font-body mt-2">Scroll to the end to continue.</p>
        )}

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono2 text-slate-500 mb-1 block">FULL NAME</label>
            <input className={inputCls} placeholder="Type your full name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-teal-400" />
              <span className="text-sm text-slate-300 font-body">I have read and understood this document, and I agree to it.</span>
            </label>
          </div>
          <div>
            <label className="text-xs font-mono2 text-slate-500 mb-1 block">SIGNATURE</label>
            <SignaturePad onChange={setSig} />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className={btnGhost + " flex-1"}>Cancel</button>
          <button onClick={sign} disabled={!canSign || busy} className={btnPrimary + " flex-1 flex items-center justify-center gap-1.5"}>
            <PenLine size={14} /> {busy ? "Signing…" : "Sign document"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- patient portal: my forms ------------------- */

export function ConsentFormsPanel({ patientRecordId, userId, appointmentId }) {
  const [state, setState] = useState({ documents: [], signatures: [], outstanding: [] });
  const [openDoc, setOpenDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!patientRecordId) { setLoading(false); return; }
    setLoading(true);
    setState(await fetchConsentState(patientRecordId));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patientRecordId]);

  if (loading) return <div className="text-center py-10 text-slate-500 font-body text-sm">Loading your forms…</div>;
  if (!patientRecordId) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center font-body text-sm text-slate-400">
        Book an appointment first — your forms appear here once you have a record with the clinic.
      </div>
    );
  }

  const signedFor = (d) => state.signatures.find((s) => s.document_id === d.id && s.document_version === d.version);

  return (
    <div className="fade-up">
      {openDoc && (
        <SignConsentModal
          doc={openDoc}
          patientRecordId={patientRecordId}
          userId={userId}
          appointmentId={appointmentId}
          onClose={() => setOpenDoc(null)}
          onSigned={() => { setOpenDoc(null); load(); }}
        />
      )}

      {state.outstanding.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 font-body">
          You have {state.outstanding.length} form{state.outstanding.length > 1 ? "s" : ""} to read and sign before your consultation.
        </div>
      )}

      <div className="rounded-3xl border border-slate-800 bg-slate-900 px-5">
        {state.documents.length === 0 ? (
          <div className="py-8 text-sm text-slate-500 font-body text-center">No forms to sign right now.</div>
        ) : state.documents.map((d) => {
          const sig = signedFor(d);
          return (
            <div key={d.id} className="flex items-center justify-between gap-4 py-3.5 border-b border-slate-800/60 last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-slate-100 font-body flex items-center gap-2">
                  <FileText size={14} className="text-teal-300 shrink-0" /> {d.title}
                </div>
                <div className="font-mono2 text-xs text-slate-500 mt-0.5">
                  {sig
                    ? `Signed ${new Date(sig.signed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
                    : d.required_before_consult ? "Required before your visit" : "Optional"}
                </div>
              </div>
              {sig ? (
                <span className="px-2.5 py-0.5 rounded-full border border-teal-400/40 bg-teal-400/10 text-teal-300 text-xs font-body flex items-center gap-1">
                  <Check size={12} /> signed
                </span>
              ) : (
                <button onClick={() => setOpenDoc(d)} className="text-xs text-teal-300 hover:underline shrink-0">Read & sign</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------- staff: signed forms on record --------------- */

export function PatientConsentTab({ patient, me }) {
  const [state, setState] = useState({ documents: [], signatures: [], outstanding: [] });
  const [rows, setRows] = useState([]);
  const [openDoc, setOpenDoc] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setState(await fetchConsentState(patient.id));
    const { data, error } = await supabase
      .from("consent_signatures")
      .select("*, doc:document_id(title)")
      .eq("patient_record_id", patient.id)
      .order("signed_at", { ascending: false });
    if (error) { setError(error.message); return; }
    setRows(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patient.id]);

  const print = async (row) => {
    const doc = state.documents.find((d) => d.id === row.document_id);
    const img = await signedUrl(BUCKET_SIGNATURES, row.signature_path, 300);
    printDocument(row.doc?.title || "Consent", `
      ${letterhead(row.doc?.title || "Consent form")}
      <table><tr><td class="label">Patient</td><td>${esc(patient.first_name)} ${esc(patient.last_name)}</td></tr>
      <tr><td class="label">MRN</td><td>${esc(patient.mrn)}</td></tr>
      <tr><td class="label">Signed</td><td>${esc(new Date(row.signed_at).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" }))}</td></tr>
      <tr><td class="label">Version</td><td>${esc(row.document_version)}</td></tr></table>
      <div class="rule"></div>
      <div style="white-space:pre-wrap">${esc(doc?.body || "(document text unavailable)")}</div>
      <div class="sig">
        ${img ? `<img src="${esc(img)}" style="max-height:90px" /><br/>` : ""}
        <div class="line">${esc(row.signed_name)}</div>
      </div>
      <div class="muted">Signed electronically via 4MED.</div>`);
  };

  return (
    <div>
      {error && <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">{error}</div>}

      {openDoc && (
        <SignConsentModal
          doc={openDoc}
          patientRecordId={patient.id}
          userId={me}
          onClose={() => setOpenDoc(null)}
          onSigned={() => { setOpenDoc(null); load(); }}
        />
      )}

      {state.outstanding.length > 0 && (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5 mb-5">
          <div className="font-display font-semibold text-amber-200 mb-1">Not yet signed</div>
          <p className="text-sm text-amber-200/80 font-body mb-3">
            Hand the patient a tablet, or open the form here and let them sign.
          </p>
          {state.outstanding.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 border-b border-amber-500/20 last:border-0">
              <span className="text-sm text-slate-100 font-body">{d.title}</span>
              <button onClick={() => setOpenDoc(d)} className="text-xs text-teal-300 hover:underline">Sign now</button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <div className="font-display font-semibold text-slate-100 mb-3">Signed documents</div>
        {rows.length === 0 ? (
          <div className="text-sm text-slate-500 font-body">Nothing signed yet.</div>
        ) : rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
            <div className="min-w-0">
              <div className="text-sm text-slate-200 font-body truncate">{r.doc?.title || "Document"} <span className="text-slate-600 font-mono2 text-xs">v{r.document_version}</span></div>
              <div className="font-mono2 text-xs text-slate-500">
                {r.signed_name} · {new Date(r.signed_at).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
            <button onClick={() => print(r)} className="text-xs text-teal-300 hover:underline shrink-0">Print</button>
          </div>
        ))}
      </div>
    </div>
  );
}
