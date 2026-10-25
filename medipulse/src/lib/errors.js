/* ------------------------------------------------------------------ */
/*  Turns Supabase/Postgres errors into sentences a clinic can act on. */
/*  Unknown errors fall through with their original message.          */
/* ------------------------------------------------------------------ */

export function friendlyError(err) {
  const msg = String(err?.message || err || "");
  const details = `${msg} ${err?.details || ""}`;

  if (details.includes("doctors_prc_license_key")) {
    return "That PRC license number is already registered on 4MED. Check the number, or log in to the account that registered it.";
  }
  if (/user already registered/i.test(msg)) {
    return "An account with this email already exists. Log in instead, or use a different email.";
  }
  if (details.includes("patient_access_doctor_id_fkey")) {
    return "Your practitioner profile isn't finished yet, so patients can't be saved to it. Open Today in the Clinic App and finish setting up your practice first.";
  }
  if (/failed to fetch/i.test(msg)) {
    return "Couldn't reach 4MED. Check the internet connection and try again.";
  }
  return msg || "Something went wrong. Please try again.";
}

// True when a PRC license number is free to use. Doctors are publicly
// readable, so this works before the account exists.
export async function prcLicenseAvailable(supabase, license, exceptDoctorId = null) {
  const value = String(license || "").trim();
  if (!value) return true;
  let q = supabase.from("doctors").select("id").eq("prc_license", value).limit(1);
  if (exceptDoctorId) q = q.neq("id", exceptDoctorId);
  const { data, error } = await q;
  if (error) return true; // don't block signup on a lookup hiccup; the database still enforces it
  return !data || data.length === 0;
}
