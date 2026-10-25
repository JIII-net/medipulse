import React, { createContext, useContext, useState, useCallback } from "react";
import { FIL } from "./i18n-fil";

/* ------------------------------------------------------------------ */
/*  English / Filipino for the patient side.                           */
/*                                                                     */
/*  Strings are written in English in the components and looked up in  */
/*  the Filipino dictionary (i18n-fil.js) by their exact English text. */
/*  A string with no translation falls back to English, so a missing   */
/*  entry never shows a blank. Placeholders use {name}:                */
/*    t("Hi, {name}", { name })                                        */
/* ------------------------------------------------------------------ */

const LangContext = createContext({ lang: "en", setLang: () => {}, t: (s) => s });
const STORAGE_KEY = "4med-lang";

const readLang = () => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "fil" || saved === "en") return saved;
  } catch { /* private mode or blocked storage: fall back below */ }
  return "en";
};

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readLang);
  const setLang = useCallback((l) => {
    setLangState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* not persisted; fine */ }
    document.documentElement.lang = l === "fil" ? "fil" : "en";
  }, []);
  const t = useCallback((s, vars) => fill(lang === "fil" ? FIL[s] ?? s : s, vars), [lang]);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useT = () => useContext(LangContext).t;

// The EN / FIL switch in the site header.
export function LangSwitch({ className = "" }) {
  const { lang, setLang } = useLang();
  return (
    <div className={"inline-flex rounded-md border border-slate-700 bg-white p-0.5 text-xs font-body font-semibold " + className} role="group" aria-label="Language">
      {[["en", "EN"], ["fil", "FIL"]].map(([v, l]) => (
        <button
          key={v}
          onClick={() => setLang(v)}
          aria-pressed={lang === v}
          className={"px-2 py-1 rounded transition-colors " + (lang === v ? "bg-ink text-white" : "text-slate-300 hover:text-ink")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
