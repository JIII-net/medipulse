import { supabase } from "./supabaseClient";
import { printDocument, esc } from "./print";

/* ------------------------------------------------------------------ */
/*  The printed medical certificate, one layout for the doctor's copy  */
/*  and the patient portal's.                                          */
/*                                                                     */
/*  The doctor's own letterhead on top, the certificate in the middle  */
/*  (centred on the page when it's short), PRC and PTR under the       */
/*  signature line, and the usual "not valid for medico-legal          */
/*  purposes" line at the foot.                                        */
/*                                                                     */
/*  Load the context before the user clicks Print: a print window      */
/*  opened after an await is blocked as a pop-up.                      */
/* ------------------------------------------------------------------ */

const TZ = "Asia/Manila";

// Today in Manila as YYYY-MM-DD, the value a date input expects.
export function manilaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

const isoDay = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }));
const addDays = (day, n) => {
  const [y, m, d] = isoDay(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const longDate = (day) => {
  const [y, m, d] = isoDay(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const ageOn = (birthdate, day) => {
  if (!birthdate) return null;
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [y, m, d] = isoDay(day).split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
};
const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? "" : "s"}`;

// Doctor, clinic and patient details for the certificate.
export async function loadCertContext({ doctorId, patientRecordId, appointmentId }) {
  const [doc, prof, pat, appt] = await Promise.all([
    supabase.from("doctors").select("*").eq("id", doctorId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", doctorId).maybeSingle(),
    supabase.from("patients").select("first_name, middle_name, last_name, suffix, birthdate, sex, address").eq("id", patientRecordId).maybeSingle(),
    appointmentId ? supabase.from("appointments").select("location_id").eq("id", appointmentId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // The clinic the visit was booked at, else the doctor's first one.
  let q = supabase.from("clinic_locations").select("name, address, phone").eq("doctor_id", doctorId);
  q = appt.data?.location_id ? q.eq("id", appt.data.location_id) : q.order("created_at").limit(1);
  const { data: clinics } = await q;
  const d = doc.data || {};
  const p = pat.data || {};
  return {
    doctor: { name: prof.data?.full_name || "", specialty: d.specialty || "", prc: d.prc_license || "", ptr: d.ptr_no || "" },
    clinic: clinics?.[0] || null,
    patient: {
      name: [p.first_name, p.middle_name, p.last_name, p.suffix].filter(Boolean).join(" "),
      birthdate: p.birthdate || null,
      sex: p.sex,
      address: [p.address?.line1, p.address?.barangay, p.address?.city, p.address?.province].filter((x) => x && String(x).trim()).join(", "),
    },
  };
}

// The recommendation paragraphs: rest, then work from home, then back on site.
export function certRecommendations(c, visitDay) {
  const start = isoDay(c.starts_on || visitDay);
  const rest = Number(c.rest_days) || 0;
  const wfh = Number(c.wfh_days) || 0;
  const span = (from, n) => (n === 1 ? `on ${longDate(from)}` : `from ${longDate(from)} to ${longDate(addDays(from, n - 1))}`);
  const out = [];
  if (rest > 0) out.push(`The patient is advised to rest at home for <strong>${plural(rest, "day")}</strong>, ${span(start, rest)}.`);
  if (wfh > 0) {
    const from = addDays(start, rest);
    out.push(`${rest > 0 ? "After that, the patient" : "The patient"} may <strong>work from home</strong> for <strong>${plural(wfh, "day")}</strong>, ${span(from, wfh)}.`);
  }
  if (rest + wfh > 0) out.push(`The patient may return to on-site work or school on <strong>${longDate(addDays(start, rest + wfh))}</strong>.`);
  else if (c.fit_to_work) out.push("The patient is <strong>fit to return to work or school</strong>.");
  return out;
}

export function printMedicalCertificate({ cert: c, visitAt, doctor, clinic, patient }) {
  const visitDay = isoDay(visitAt || c.issued_at);
  const age = ageOn(patient.birthdate, visitDay);
  const sexWord = { female: "female", male: "male" }[patient.sex] || "";
  const who = [age != null ? `${age}-year-old` : "", sexWord].filter(Boolean).join(" ");
  const clinicLine = clinic ? [clinic.name, clinic.address, clinic.phone].filter(Boolean).map(esc).join(" · ") : "";
  const purpose = c.purpose && c.purpose.trim() ? `for ${esc(c.purpose.trim())}` : "for whatever purpose it may serve";
  const certNo = "MC-" + String(c.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();

  printDocument("Medical Certificate", `
    <style>
      body { max-width: 720px; }
      .mc-page { min-height: 250mm; display: flex; flex-direction: column; }
      .mc-head { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #13305E; box-shadow: 0 3px 0 -2px #13305E; }
      .mc-head .dr { font-size: 21px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
      .mc-head .spec { font-size: 13px; color: #46597A; margin-top: 2px; }
      .mc-head .clinic { font-size: 12.5px; margin-top: 6px; }
      .mc-main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 22px 0; }
      .mc-title { text-align: center; font-size: 23px; font-weight: 800; letter-spacing: 0.22em; margin: 0; }
      .mc-date { text-align: right; margin: 22px 0 20px; font-size: 14px; }
      .mc-body p { text-align: justify; line-height: 1.8; margin: 0 0 12px; font-size: 14.5px; }
      .mc-dx { margin: 2px 0 16px 32px; padding-left: 12px; border-left: 3px solid #13305E; font-size: 15px; font-weight: 700; line-height: 1.5; }
      .mc-sig { margin-top: 64px; display: flex; justify-content: flex-end; }
      .mc-sig .box { text-align: center; min-width: 270px; }
      .mc-sig .name { border-top: 1.5px solid #13305E; padding-top: 6px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; }
      .mc-sig .meta { font-size: 12px; color: #46597A; line-height: 1.6; }
      .mc-foot { border-top: 1px dashed #C3CBD6; padding-top: 8px; font-size: 10.5px; color: #566884; display: flex; justify-content: space-between; gap: 16px; }
      @media print { body { max-width: none; } .mc-page { min-height: 255mm; } }
    </style>
    <div class="mc-page">
      <header class="mc-head">
        <div class="dr">${esc(doctor.name || "Attending physician")}</div>
        ${doctor.specialty ? `<div class="spec">${esc(doctor.specialty)}</div>` : ""}
        ${clinicLine ? `<div class="clinic">${clinicLine}</div>` : ""}
      </header>

      <main class="mc-main">
        <h1 class="mc-title">MEDICAL CERTIFICATE</h1>
        <div class="mc-date">Date: <strong>${esc(longDate(c.issued_at || visitDay))}</strong></div>
        <div class="mc-body">
          <p><strong>TO WHOM IT MAY CONCERN:</strong></p>
          <p>This is to certify that <strong>${esc(patient.name || "the patient")}</strong>${who ? `, ${esc(who)}` : ""}${patient.address ? `, of ${esc(patient.address)}` : ""}, was seen and examined at this clinic on <strong>${esc(longDate(visitDay))}</strong> and was found to have the following condition:</p>
          <div class="mc-dx">${esc(c.diagnosis)}</div>
          ${c.remarks ? `<p><strong>Remarks:</strong> ${esc(c.remarks)}</p>` : ""}
          ${certRecommendations(c, visitDay).map((r) => `<p>${r}</p>`).join("")}
          <p>This certification is issued upon the request of the patient ${purpose}, except for medico-legal purposes.</p>
        </div>
        <div class="mc-sig">
          <div class="box">
            <div class="name">${esc(doctor.name || "")}</div>
            <div class="meta">
              ${doctor.specialty ? `${esc(doctor.specialty)}<br/>` : ""}PRC License No. ${esc(doctor.prc || "______________")}
              ${doctor.ptr ? `<br/>PTR No. ${esc(doctor.ptr)}` : ""}
            </div>
          </div>
        </div>
      </main>

      <footer class="mc-foot">
        <span>Not valid for medico-legal purposes. Valid only with the physician's signature.</span>
        <span>${esc(certNo)} · issued through 4MED</span>
      </footer>
    </div>`);
}
