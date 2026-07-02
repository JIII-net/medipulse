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

  // Sign up a new user and create their profile row (+ doctor row if role === 'doctor')
  const signUp = async ({ email, password, fullName, role, doctorDetails }) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };

    const userId = data.user?.id;
    if (!userId) return { error: { message: "Sign up succeeded but no user id was returned. Check if email confirmation is required." } };

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: userId, full_name: fullName, role });
    if (profileError) return { error: profileError };

    if (role === "doctor" && doctorDetails) {
      const { error: doctorError } = await supabase.from("doctors").insert({
        id: userId,
        specialty: doctorDetails.specialty,
        prc_license: doctorDetails.license,
        consult_fee: doctorDetails.fee ?? 0,
        telehealth_enabled: doctorDetails.telehealth ?? false,
      });
      if (doctorError) return { error: doctorError };

      const { error: subError } = await supabase.from("subscriptions").insert({
        doctor_id: userId,
        plan_id: doctorDetails.planId,
        billing_cycle: doctorDetails.billingCycle,
        status: "trialing",
      });
      if (subError) return { error: subError };
    }

    await loadProfile(userId);
    return { data };
  };

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
