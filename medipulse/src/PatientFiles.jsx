import React, { useState, useEffect } from "react";
import { Upload, FileText, Download, Trash2, Eye, EyeOff, Printer, Pill, ClipboardList } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/AuthContext";
import { validateUpload, signedUrl } from "./lib/uploads";
import { printDocument, letterhead, esc } from "./lib/print";
import { friendlyError } from "./lib/errors";
import { inputSm, btnSm, btnGhostSm, panel, FieldLabel, Notice } from "./ui";

/* ------------------------------------------------------------------ */
/*  Patient files: lab results, imaging, referrals and other documents */
/*  the clinic shares with a patient, plus (on the patient side) the   */
/*  prescriptions and certificates from their visits.                  */
/*                                                                     */
/*  Files live in the private "patient-files" bucket under a folder    */
/*  named for the patient record, which the storage policies use to    */
/*  scope access.                                                      */
/* ------------------------------------------------------------------ */

export const BUCKET_PATIENT_FILES = "patient-files";

export const FILE_KINDS = [
  ["lab_result", "Lab result"],
  ["imaging", "Imaging"],
  ["prescription", "Prescription"],
  ["certificate", "Certificate"],
  ["referral", "Referral"],
  ["other", "Other"],
];
const kindLabel = (k) => (FILE_KINDS.find(([v]) => v === k) || [k, k])[1];

const safeName = (name) => (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

async function openFile(path) {
  const url = await signedUrl(BUCKET_PATIENT_FILES, path, 300);
  if (url) window.open(url, "_blank", "noopener");
}

/* ------------------------------ staff ------------------------------ */

export function StaffFilesPanel({ patient }) {
  const { session } = useAuth();
  const [files, setFiles] = useState([]);
  const [f, setF] = useState({ kind: "lab_result", title: "", note: "", visible: true });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from("patient_files").select("*").eq("patient_record_id", patient.id).order("created_at", { ascending: false });
    if (error) { setError(friendlyError(error)); return; }
    setFiles(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patient.id]);

  const upload = async () => {
    const bad = validateUpload(file);
    if (bad) { setError(bad); return; }
    if (!f.title.trim()) { setError("Give the file a title, e.g. CBC — 25 Oct."); return; }
    setBusy(true); setError(null);
    const path = `${patient.id}/${Date.now()}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET_PATIENT_FILES).upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) { setBusy(false); setError("Upload failed: " + upErr.message); return; }
    const { error: dbErr } = await supabase.from("patient_files").insert({
      patient_record_id: patient.id, kind: f.kind, title: f.title.trim(), note: f.note.trim() || null,
      storage_path: path, visible_to_patient: f.visible, uploaded_by: session?.user?.id,
    });
    setBusy(false);
    if (dbErr) { setError(friendlyError(dbErr)); return; }
    setF({ kind: "lab_result", title: "", note: "", visible: true });
    setFile(null);
    load();
  };

  const toggleVisible = async (row) => {
    await supabase.from("patient_files").update({ visible_to_patient: !row.visible_to_patient }).eq("id", row.id);
    load();
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.title}"? The patient will no longer see it.`)) return;
    await supabase.storage.from(BUCKET_PATIENT_FILES).remove([row.storage_path]);
    await supabase.from("patient_files").delete().eq("id", row.id);
    load();
  };

  return (
    <div className={panel}>
      <div className="font-display text-lg font-bold text-ink mb-1">Results and files</div>
      <p className="text-sm text-slate-300 font-body mb-4">Lab results, imaging and other documents. Files marked "Patient can see" appear in the patient's portal.</p>

      <div className="grid sm:grid-cols-[10rem_1fr] gap-2 mb-2">
        <select className={inputSm} value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))} aria-label="File type">
          {FILE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className={inputSm} placeholder="Title, e.g. CBC — 25 Oct" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />
      </div>
      <input className={inputSm + " mb-2"} placeholder="Note for the patient (optional)" value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
      <div className="flex flex-wrap items-center gap-3">
        <label className={btnGhostSm + " cursor-pointer"}>
          <Upload size={15} /> {file ? file.name.slice(0, 28) : "Choose file"}
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }} />
        </label>
        <label className="flex items-center gap-2 text-sm font-body text-slate-200">
          <input type="checkbox" checked={f.visible} onChange={(e) => setF((x) => ({ ...x, visible: e.target.checked }))} /> Patient can see
        </label>
        <button onClick={upload} disabled={busy || !file} className={btnSm}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
      {error && <Notice tone="error" className="mt-3">{error}</Notice>}

      <ul className="mt-5">
        {files.length === 0 && <li className="text-sm text-slate-400 font-body">No files yet.</li>}
        {files.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-800 last:border-0">
            <button onClick={() => openFile(row.storage_path)} className="min-w-0 text-left group">
              <div className="text-sm text-ink font-semibold font-body truncate group-hover:underline underline-offset-4">{row.title}</div>
              <div className="text-xs text-slate-400 font-body">{kindLabel(row.kind)} · {fmtDate(row.created_at)}{row.visible_to_patient ? "" : " · staff only"}</div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggleVisible(row)} className="p-2 rounded-md text-slate-400 hover:text-ink" title={row.visible_to_patient ? "Hide from patient" : "Show to patient"} aria-label={row.visible_to_patient ? "Hide from patient" : "Show to patient"}>
                {row.visible_to_patient ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              <button onClick={() => remove(row)} className="p-2 rounded-md text-slate-400 hover:text-rose-300" aria-label="Delete file"><Trash2 size={16} /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------- patient ----------------------------- */

// Everything the patient can keep from their visits, for one person
// (themselves or a dependent).
export function PatientRecordsPanel({ recordId, personName, t = (s) => s }) {
  const [files, setFiles] = useState([]);
  const [rx, setRx] = useState([]);
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!recordId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [fl, en] = await Promise.all([
        supabase.from("patient_files").select("*").eq("patient_record_id", recordId).order("created_at", { ascending: false }),
        supabase.from("encounters")
          .select("id, started_at, doctor_id, doctor:doctor_id(profiles(full_name), prc_license), prescriptions(id, created_at, items:prescription_items(*)), med_certificates(*)")
          .eq("patient_record_id", recordId).order("started_at", { ascending: false }),
      ]);
      setLoading(false);
      if (fl.error || en.error) { setError(friendlyError(fl.error || en.error)); return; }
      setFiles(fl.data || []);
      const visits = en.data || [];
      setRx(visits.flatMap((v) => (v.prescriptions || []).filter((p) => p.items?.length).map((p) => ({ ...p, visit: v }))));
      setCerts(visits.flatMap((v) => (v.med_certificates || []).map((c) => ({ ...c, visit: v }))));
    })();
  }, [recordId]);

  const printRx = (p) => {
    const doctor = p.visit.doctor?.profiles?.full_name || "Doctor";
    printDocument("Prescription", `
      ${letterhead("PRESCRIPTION")}
      <table><tr><td class="label">Patient</td><td>${esc(personName)}</td></tr>
      <tr><td class="label">Date</td><td>${esc(fmtDate(p.created_at))}</td></tr></table>
      <div class="rule"></div>
      ${p.items.map((i) => `<div class="rx-item"><b>${esc(i.drug_name)}</b> ${esc(i.dose || "")}<br/>${esc([i.route, i.frequency, i.duration].filter(Boolean).join(" · "))}${i.quantity ? ` · #${esc(i.quantity)}` : ""}${i.instructions ? `<br/><i>${esc(i.instructions)}</i>` : ""}</div>`).join("")}
      <div class="sig"><div class="line">${esc(doctor)}${p.visit.doctor?.prc_license ? `<br/>PRC ${esc(p.visit.doctor.prc_license)}` : ""}</div></div>
      <div class="muted">Copy from the 4MED patient portal.</div>`);
  };

  const printCert = (c) => {
    const doctor = c.visit.doctor?.profiles?.full_name || "Doctor";
    printDocument("Medical certificate", `
      ${letterhead("MEDICAL CERTIFICATE")}
      <table><tr><td class="label">Patient</td><td>${esc(personName)}</td></tr>
      <tr><td class="label">Date issued</td><td>${esc(fmtDate(c.issued_at))}</td></tr>
      <tr><td class="label">Seen on</td><td>${esc(fmtDate(c.visit.started_at || c.issued_at))}</td></tr></table>
      <div class="rule"></div>
      <p>This is to certify that <b>${esc(personName)}</b> was seen and examined on ${esc(fmtDate(c.visit.started_at || c.issued_at))}.</p>
      <table><tr><td class="label">Diagnosis</td><td>${esc(c.diagnosis || "")}</td></tr>
      ${c.rest_days ? `<tr><td class="label">Rest</td><td>${esc(c.rest_days)} day${Number(c.rest_days) === 1 ? "" : "s"}</td></tr>` : ""}
      ${c.remarks ? `<tr><td class="label">Remarks</td><td>${esc(c.remarks)}</td></tr>` : ""}</table>
      <div class="sig"><div class="line">${esc(doctor)}${c.visit.doctor?.prc_license ? `<br/>PRC ${esc(c.visit.doctor.prc_license)}` : ""}</div></div>
      <div class="muted">Copy from the 4MED patient portal. For work, school or travel, ask the clinic for a copy with the doctor's signature.</div>`);
  };

  if (!recordId) return <p className="font-body text-slate-300">{t("Records appear here after the first visit.")}</p>;
  if (loading) return <p className="font-body text-slate-400">{t("Loading records…")}</p>;

  const Section = ({ icon: Icon, title, children, empty }) => (
    <section className="rounded-xl border border-slate-700 bg-white">
      <h3 className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 font-display text-lg font-bold text-ink"><Icon size={18} /> {title}</h3>
      {children.length === 0 ? <p className="px-5 py-4 text-sm text-slate-400 font-body">{empty}</p> : <ul>{children}</ul>}
    </section>
  );

  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <Section icon={FileText} title={t("Results and files")} empty={t("No results shared yet. Your clinic adds lab results and documents here.")}>
        {files.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 last:border-0 font-body">
            <div className="min-w-0">
              <div className="text-ink font-semibold truncate">{row.title}</div>
              <div className="text-sm text-slate-400">{t(kindLabel(row.kind))} · {fmtDate(row.created_at)}</div>
              {row.note && <div className="text-sm text-slate-200 mt-0.5">{row.note}</div>}
            </div>
            <button onClick={() => openFile(row.storage_path)} className={btnGhostSm + " shrink-0"}><Download size={15} /> {t("Open")}</button>
          </li>
        ))}
      </Section>
      <Section icon={Pill} title={t("Prescriptions")} empty={t("No prescriptions yet.")}>
        {rx.map((p) => (
          <li key={p.id} className="px-5 py-3 border-b border-slate-800 last:border-0 font-body">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-400">{fmtDate(p.created_at)} · {p.visit.doctor?.profiles?.full_name || "Doctor"}</div>
                <ul className="mt-1 space-y-0.5">
                  {p.items.map((i) => <li key={i.id} className="text-ink"><b>{i.drug_name}</b> {i.dose} <span className="text-slate-300">{[i.frequency, i.duration].filter(Boolean).join(" · ")}</span></li>)}
                </ul>
              </div>
              <button onClick={() => printRx(p)} className={btnGhostSm + " shrink-0"}><Printer size={15} /> {t("Print")}</button>
            </div>
          </li>
        ))}
      </Section>
      <Section icon={ClipboardList} title={t("Medical certificates")} empty={t("No certificates yet.")}>
        {certs.map((c) => (
          <li key={c.id} className="px-5 py-3 border-b border-slate-800 last:border-0 font-body">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-400">{fmtDate(c.issued_at)} · {c.visit.doctor?.profiles?.full_name || "Doctor"}</div>
                <div className="text-ink">{c.diagnosis}{c.rest_days ? ` · ${c.rest_days} ${t("days rest")}` : ""}</div>
                {c.remarks && <div className="text-sm text-slate-300">{c.remarks}</div>}
              </div>
              <button onClick={() => printCert(c)} className={btnGhostSm + " shrink-0"}><Printer size={15} /> {t("Print")}</button>
            </div>
          </li>
        ))}
      </Section>
      <FieldLabel className="block">{t("Printed copies come from the portal. Ask the clinic for a signed copy if you need one for work or school.")}</FieldLabel>
    </div>
  );
}
