/* ------------------------------------------------------------------ */
/*  Profession types and their specialty lists.                        */
/*                                                                     */
/*  The live `specialties` table is the real source — admins add to it */
/*  without a code change. This registry is the offline fallback and   */
/*  drives the signup picker, the admin console, and the patient       */
/*  directory filter, so a new profession is one edit here instead of  */
/*  five scattered ternaries.                                          */
/* ------------------------------------------------------------------ */

export const PROFESSIONS = [
  {
    id: "doctor",
    label: "Doctor / Physician",
    defaultSpecialty: "Cardiology",
    specialties: ["Cardiology", "Pediatrics", "Dermatology", "Internal Medicine", "OB-GYN", "Neurology"],
  },
  {
    id: "dentist",
    label: "Dentist",
    defaultSpecialty: "Dentistry",
    specialties: ["Dentistry", "Orthodontics", "Oral Surgery"],
  },
  {
    id: "ophthalmologist",
    label: "Ophthalmologist",
    defaultSpecialty: "Ophthalmology",
    specialties: ["Ophthalmology", "Retina", "Glaucoma", "Cornea & External Disease", "Pediatric Ophthalmology", "Neuro-Ophthalmology", "Oculoplastics"],
  },
  {
    id: "psychiatrist",
    label: "Psychiatrist",
    defaultSpecialty: "General Adult Psychiatry",
    specialties: ["General Adult Psychiatry", "Child & Adolescent Psychiatry", "Geriatric Psychiatry", "Addiction Psychiatry", "Consultation-Liaison Psychiatry", "Forensic Psychiatry"],
  },
  {
    id: "psychologist",
    label: "Psychologist",
    defaultSpecialty: "Clinical Psychology",
    specialties: ["Clinical Psychology", "Counseling Psychology", "Child & Adolescent Psychology", "Neuropsychology", "Psychological Assessment / Psychometrics", "Family & Couples Therapy"],
  },
];

// Psychiatrists are physicians and prescribe; psychologists do not. Both get
// the mental health module, only the psychiatrist gets the prescription pad.
export const MENTAL_HEALTH_TYPES = ["psychiatrist", "psychologist"];

export const professionById = (id) => PROFESSIONS.find((p) => p.id === id) || PROFESSIONS[0];

// Every specialty across every profession, for the patient-facing filter.
export const ALL_SPECIALTIES = ["All", ...PROFESSIONS.flatMap((p) => p.specialties)];
