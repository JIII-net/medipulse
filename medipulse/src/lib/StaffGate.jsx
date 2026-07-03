import React, { useState } from "react";
import { Lock, AlertCircle } from "lucide-react";
import { useAuth } from "./AuthContext";

const inputCls = "w-full rounded-2xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400 text-sm";

export function StaffGate({ children }) {
  const { session, profile, loading, signIn, signOut } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="max-w-md mx-auto px-6 py-24 text-center text-slate-500 font-body">Loading…</div>;

  if (!session || !profile) {
    const submit = async (e) => {
      e.preventDefault();
      setBusy(true); setError(null);
      const { error } = await signIn(form);
      setBusy(false);
      if (error) setError(error.message);
    };
    return (
      <div className="max-w-md mx-auto px-6 py-20 fade-up">
        <h2 className="font-display text-2xl font-bold text-slate-50 mb-1">Staff login</h2>
        <p className="text-slate-400 font-body text-sm mb-6">This area is restricted to clinical staff.</p>
        <form onSubmit={submit} className="space-y-4">
          <input className={inputCls} placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          <input className={inputCls} placeholder="Password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 font-body">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          <button disabled={busy} className="w-full py-3 rounded-2xl bg-teal-400 text-slate-950 font-body font-semibold hover:bg-teal-300 transition-colors disabled:opacity-60">
            {busy ? "Please wait…" : "Log in"}
          </button>
        </form>
      </div>
    );
  }

  if (!["doctor", "admin", "secretary"].includes(profile.role)) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center fade-up">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
          <Lock size={22} className="text-rose-300" />
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-50">Staff only</h2>
        <p className="text-slate-400 font-body text-sm mt-2">
          This area can only be accessed by clinic staff (doctors, secretaries, administrators). This account has the role "{profile.role}".
        </p>
        <button onClick={signOut} className="mt-6 text-sm text-teal-300 font-body hover:underline">Log out and switch accounts</button>
      </div>
    );
  }

  return children;
}
