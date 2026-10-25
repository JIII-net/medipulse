/* ------------------------------------------------------------------ */
/*  One shape for a bookable doctor, shared by the directory, the      */
/*  booking modal and the public profile page.                         */
/* ------------------------------------------------------------------ */

export const DOCTOR_SELECT =
  "id, slug, photo_url, bio, specialty, specialties, profession_type, consult_fee, telehealth_enabled, is_online, hospital, years_experience, license_verified, require_prepayment, prepayment_amount, payment_instructions, prepayment_hold_minutes, profiles(full_name), locations:clinic_locations(id, name, address)";

export function toBookableDoctor(d, ratings = {}) {
  const r = ratings[d.id];
  return {
    id: d.id,
    slug: d.slug,
    photoUrl: d.photo_url || null,
    bio: d.bio || "",
    name: d.profiles?.full_name || "Unnamed doctor",
    specialty: d.specialty,
    specialties: d.specialties?.length ? d.specialties : (d.specialty ? [d.specialty] : []),
    professionType: d.profession_type || "doctor",
    rating: r ? Number(r.avg_rating) : null,
    reviews: r ? Number(r.review_count) : 0,
    fee: d.consult_fee,
    online: d.is_online,
    telehealth: d.telehealth_enabled,
    nextSlot: null,
    hospital: d.locations?.[0]?.name || d.hospital || "",
    locations: d.locations || [],
    exp: d.years_experience || 0,
    verified: !!d.license_verified,
    requirePrepayment: !!d.require_prepayment,
    prepayAmount: d.prepayment_amount ?? d.consult_fee,
    paymentInstructions: d.payment_instructions || "",
    holdMinutes: d.prepayment_hold_minutes || 1440,
  };
}

// doctor_ratings() rows keyed by doctor id.
export async function loadRatings(supabase) {
  const { data } = await supabase.rpc("doctor_ratings");
  return Object.fromEntries((data || []).map((r) => [r.doctor_id, r]));
}

export const profileUrl = (slug) => `${window.location.origin}/dr/${slug}`;

export const slugify = (name, id = "") =>
  `${String(name || "doctor").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}${id ? "-" + id.replace(/-/g, "").slice(0, 4) : ""}`;
