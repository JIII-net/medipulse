import React, { useState, useEffect } from "react";
import { MapPin, Video, Clock, BadgeCheck, Share2, Link2, Check } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/AuthContext";
import { useT } from "./lib/i18n";
import { DOCTOR_SELECT, toBookableDoctor, loadRatings, profileUrl } from "./lib/doctors";
import { Avatar, FieldLabel, Notice, btnLg, btnGhost, tintForProfession } from "./ui";
import { Stars } from "./PatientExtras";

/* ------------------------------------------------------------------ */
/*  Public doctor page at /dr/<slug>: what a doctor shares on Facebook */
/*  or Messenger. Anyone can read it; booking asks the visitor to log  */
/*  in first.                                                          */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const peso = (n) => "₱" + Number(n || 0).toLocaleString();
const h12 = (t) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${h >= 12 ? "PM" : "AM"}`;
};

export default function DoctorProfile({ slug, BookingModal, AuthGate, go }) {
  const t = useT();
  const { session, profile } = useAuth();
  const [doctor, setDoctor] = useState(undefined); // undefined loading, null not found
  const [hours, setHours] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [booking, setBooking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("doctors").select(DOCTOR_SELECT).eq("slug", slug).maybeSingle();
      if (!data) { setDoctor(null); return; }
      const ratings = await loadRatings(supabase);
      setDoctor(toBookableDoctor(data, ratings));
      document.title = `${data.profiles?.full_name || "Doctor"} · 4MED`;
      const [sc, rv] = await Promise.all([
        supabase.from("schedules").select("weekday, start_time, end_time, location_id").eq("resource_type", "doctor").eq("resource_id", data.id).order("weekday"),
        supabase.from("reviews").select("id, rating, comment, author_name, created_at").eq("doctor_id", data.id).eq("hidden", false).order("created_at", { ascending: false }).limit(20),
      ]);
      setHours(sc.data || []);
      setReviews(rv.data || []);
    })();
  }, [slug]);

  if (doctor === undefined) return <div className="max-w-4xl mx-auto px-6 py-24 text-center text-slate-400 font-body">{t("Loading…")}</div>;
  if (doctor === null) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center font-body">
        <h1 className="font-display text-3xl font-bold text-ink">{t("We couldn't find that doctor")}</h1>
        <p className="text-slate-300 mt-2">{t("The link may be old. Search the directory instead.")}</p>
        <button onClick={() => go("patient")} className={btnGhost + " mt-6"}>{t("Find a doctor")}</button>
      </div>
    );
  }

  const url = profileUrl(doctor.slug);
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: doctor.name, text: t("Book {name} on 4MED", { name: doctor.name }), url }); return; } catch { /* closed */ }
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank", "noopener,width=600,height=520");
  };
  const copy = () => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const byDay = WEEKDAYS.map((name, i) => ({ name, rules: hours.filter((h) => h.weekday === i) })).filter((d) => d.rules.length);
  const isDown = doctor.requirePrepayment && doctor.prepayAmount > 0 && doctor.prepayAmount < doctor.fee;
  const canBook = !(session && profile && profile.role !== "patient");

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-6 py-8 sm:py-12 fade-up">
      <article className="rounded-xl border border-ink/20 bg-white overflow-hidden">
        <header className={"px-6 sm:px-8 py-7 border-b border-ink/15 flex flex-col sm:flex-row gap-6 sm:items-center " + tintForProfession(doctor.professionType)}>
          {doctor.photoUrl ? (
            <img src={doctor.photoUrl} alt="" className="w-28 h-28 rounded-lg object-cover border border-ink/15 bg-white" />
          ) : (
            <Avatar name={doctor.name} tint="bg-white" size={112} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-ink leading-none">{doctor.name}</h1>
            <p className="font-body text-lg text-slate-200 mt-2">{doctor.specialties.join(" · ")}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm font-body text-ink">
              {doctor.verified && <span className="inline-flex items-center gap-1"><BadgeCheck size={16} /> {t("PRC license verified")}</span>}
              {doctor.reviews > 0 && <span className="inline-flex items-center gap-1.5"><Stars value={doctor.rating} /> {doctor.rating} <span className="text-slate-300">({doctor.reviews})</span></span>}
              {doctor.exp > 0 && <span>{t("{n} years in practice", { n: doctor.exp })}</span>}
              {doctor.telehealth && <span className="inline-flex items-center gap-1"><Video size={15} /> {t("Video visits")}</span>}
            </div>
          </div>
          <div className="flex sm:flex-col gap-2 shrink-0">
            {canBook && <button onClick={() => setBooking(true)} className={btnLg}>{t("Book a visit")}</button>}
            <div className="flex gap-2">
              <button onClick={share} className={btnGhost + " bg-white"}><Share2 size={16} /> {t("Share")}</button>
              <button onClick={copy} className={btnGhost + " bg-white"} aria-label={t("Copy link")}>{copied ? <Check size={16} /> : <Link2 size={16} />}</button>
            </div>
          </div>
        </header>

        <div className="grid md:grid-cols-[1.4fr_1fr]">
          <div className="px-6 sm:px-8 py-7 space-y-8 md:border-r border-slate-800">
            {doctor.bio && (
              <section>
                <h2 className="font-display text-xl font-bold text-ink mb-2">{t("About")}</h2>
                <p className="font-body text-slate-200 whitespace-pre-line">{doctor.bio}</p>
              </section>
            )}
            <section>
              <h2 className="font-display text-xl font-bold text-ink mb-3">{t("Reviews")}</h2>
              {reviews.length === 0 ? (
                <p className="font-body text-slate-300">{t("No reviews yet. Patients can review after their visit.")}</p>
              ) : (
                <ul className="space-y-4">
                  {reviews.map((r) => (
                    <li key={r.id} className="border-b border-slate-800 pb-4 last:border-0">
                      <div className="flex items-center gap-2"><Stars value={r.rating} /><span className="text-sm text-slate-400 font-body">{r.author_name} · {new Date(r.created_at).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}</span></div>
                      {r.comment && <p className="font-body text-ink mt-1.5">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="px-6 sm:px-8 py-7 space-y-7 bg-ground/50">
            <section>
              <FieldLabel>{t("Consultation")}</FieldLabel>
              <div className="queue-no text-4xl text-ink mt-1">{peso(doctor.fee)}</div>
              {doctor.requirePrepayment && (
                <p className="text-sm font-body text-slate-200 mt-1.5">
                  {isDown
                    ? t("{amount} downpayment to book; the rest at the clinic.", { amount: peso(doctor.prepayAmount) })
                    : t("Paid in advance to confirm your booking.")}
                </p>
              )}
            </section>
            {doctor.locations.length > 0 && (
              <section>
                <FieldLabel>{t("Clinics")}</FieldLabel>
                <ul className="mt-2 space-y-2 font-body">
                  {doctor.locations.map((l) => (
                    <li key={l.id} className="flex gap-2 text-ink"><MapPin size={16} className="mt-0.5 shrink-0" /><span><b>{l.name}</b>{l.address ? <span className="block text-sm text-slate-300">{l.address}</span> : null}</span></li>
                  ))}
                </ul>
              </section>
            )}
            {byDay.length > 0 && (
              <section>
                <FieldLabel>{t("Clinic hours")}</FieldLabel>
                <table className="mt-2 w-full text-sm font-body">
                  <tbody>
                    {byDay.map((d) => (
                      <tr key={d.name} className="border-b border-slate-800 last:border-0">
                        <td className="py-1.5 text-slate-300 pr-3">{t(d.name)}</td>
                        <td className="py-1.5 text-ink text-right tnum">{d.rules.map((r) => `${h12(r.start_time)}–${h12(r.end_time)}`).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            <p className="text-xs text-slate-400 font-body flex items-center gap-1.5"><Clock size={13} /> {t("Times are Philippine time.")}</p>
          </aside>
        </div>
      </article>

      {booking && (
        session && profile
          ? <BookingModal doctor={doctor} onClose={() => setBooking(false)} />
          : (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={() => setBooking(false)}>
              <div className="w-full max-w-md mt-10" onClick={(e) => e.stopPropagation()}>
                <AuthGate>{null}</AuthGate>
                <Notice tone="info" className="mt-3">{t("Log in or create your patient card to book. The booking opens right after.")}</Notice>
              </div>
            </div>
          )
      )}
    </div>
  );
}
