import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // row from `profiles` (has .role)
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) {
      console.error("Failed to load profile:", error.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
  }, []);

  useEffect(() => {
    // Dev-only preview: `?demo=patient|doctor|secretary|admin` signs in a
    // fake account so the signed-in screens can be looked at without a
    // Supabase project. Vite strips this branch from production builds.
    if (import.meta.env.DEV) {
      const role = new URLSearchParams(window.location.search).get("demo");
      if (role) {
        const names = { patient: "Maria Lourdes Santos", doctor: "Dra. Celia Reyes", secretary: "Joy Mendoza", admin: "4MED Admin" };
        setSession({ user: { id: "demo-" + role } });
        setProfile({ id: "demo-" + role, full_name: names[role] || "Demo user", role });
        setLoading(false);
        return;
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      loadProfile(session?.user?.id).finally(() => setLoading(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      loadProfile(session?.user?.id);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  // Where the confirmation email's link lands (must be an allowed redirect
  // URL in Supabase Auth → URL Configuration).
  const confirmRedirect = () => `${window.location.origin}/?confirmed=1`;

  // Sign up a new user. The database builds the account from these details
  // when the login is created (handle_new_user, medipulse-email-confirmation.sql):
  // profile, practitioner record and trial, invite and referral codes.
  // With "Confirm email" on there's no session yet: { needsConfirmation: true }.
  const signUp = async ({ email, password, fullName, role, doctorDetails, adminInviteCode, referralCode, practiceInviteCode }) => {
    const meta = { role, full_name: fullName };
    if (role === "doctor" && doctorDetails) {
      meta.doctor = {
        specialties: doctorDetails.specialties || (doctorDetails.specialty ? [doctorDetails.specialty] : []),
        profession_type: doctorDetails.professionType || "doctor",
        prc_license: doctorDetails.license,
        plan_id: doctorDetails.planId,
        billing_cycle: doctorDetails.billingCycle,
        telehealth: doctorDetails.telehealth ?? true,
      };
    }
    if (adminInviteCode) meta.admin_invite_code = adminInviteCode;
    if (referralCode) meta.referral_code = referralCode;
    if (practiceInviteCode) meta.practice_invite_code = practiceInviteCode;

    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: confirmRedirect() } });
    if (error) return { error };
    // With confirmation on, Supabase answers an already-registered email
    // with a user that has no identities (and sends nothing).
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: { message: "User already registered" } };
    }
    if (!data.session) return { data, needsConfirmation: true };
    await loadProfile(data.user.id);
    return { data };
  };

  const resendConfirmation = (email) =>
    supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmRedirect() } });

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signUp, signIn, signOut, resendConfirmation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
