import React, { useState } from "react";
import { Mail, Check } from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { friendlyError } from "./lib/errors";
import { btnGhostSm, btnQuiet, Notice } from "./ui";

/* ------------------------------------------------------------------ */
/*  Email confirmation: after sign-up the account waits until the      */
/*  person opens the link 4MED emails them (Supabase Auth, sent over   */
/*  the project's SMTP). These pieces tell them so and let them ask    */
/*  for the link again.                                                */
/* ------------------------------------------------------------------ */

export const isUnconfirmedEmail = (err) => /email not confirmed/i.test(String(err?.message || err || ""));

// English with {placeholders} filled, for the staff side (no language switch).
const plain = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ""));

// "Send the link again". Supabase limits how often; its error says so.
export function ResendLink({ email, t = plain, className = "" }) {
  const { resendConfirmation } = useAuth();
  const [state, setState] = useState(null); // null | "sending" | "sent" | error text
  const send = async () => {
    setState("sending");
    const { error } = await resendConfirmation(email);
    setState(error ? t(friendlyError(error)) : "sent");
  };
  return (
    <div className={className}>
      {state === "sent" ? (
        <p className="text-sm text-ink font-body flex items-center gap-1.5"><Check size={14} /> {t("Sent. Check your inbox and spam folder.")}</p>
      ) : (
        <button type="button" onClick={send} disabled={!email || state === "sending"} className={btnQuiet}>
          {state === "sending" ? t("Sending…") : t("Send the link again")}
        </button>
      )}
      {state && state !== "sent" && state !== "sending" && <Notice tone="error" className="mt-2">{state}</Notice>}
    </div>
  );
}

// Shown in place of a sign-up form once the account is created.
export function CheckYourEmail({ email, after, onBack, t = plain }) {
  return (
    <div className="font-body space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-sky border border-ink/15 flex items-center justify-center shrink-0"><Mail size={18} className="text-ink" /></span>
        <div>
          <p className="text-ink font-semibold">{t("Check your email")}</p>
          <p className="text-slate-200 mt-0.5">{t("We sent a link to {email}. Open it to confirm your account.", { email })} {after}</p>
        </div>
      </div>
      <p className="text-sm text-slate-400">{t("It can take a minute. Check your spam folder too.")}</p>
      <div className="flex flex-wrap items-center gap-4">
        <ResendLink email={email} t={t} />
        {onBack && <button type="button" onClick={onBack} className={btnGhostSm}>{t("Back to log in")}</button>}
      </div>
    </div>
  );
}
