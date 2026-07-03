import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, Shield, Search, LogOut,
  Activity, Clock, ClipboardList, ChevronRight, X,
} from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { StaffGate } from "./lib/StaffGate";
import PatientRecords from "./PatientRecords";
import AppointmentsModule from "./AppointmentsModule";
import DoctorPortal from "./DoctorPortal";

/* ------------------------------------------------------------------ */
/*  StaffApp — the unified clinic application shell                    */
/*  Sidebar · global patient search (Ctrl/⌘+K) · dashboard home        */
/* ------------------------------------------------------------------ */

const todayStr = () => new Date().toISOString().slice(0, 10);

function GlobalSearch({ onOpenPatient }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const search = useCallback((term) => {
    clearTimeout(timer.current);
    if (!term.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const t = term.trim().replace(/[%,()]/g, "");
      const { data } = await supabase
        .from("patients")
        .select("id, mrn, first_name, last_name, birthdate, phone")
        .is("deleted_at", null)
        .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,mrn.ilike.%${t}%,phone.ilike.%${t}%`)
        .limit(6);
      setResults(data || []);
      setOpen(true);
    }, 250);
  }, []);

  return (
    <div className="relative flex-1 max-w-md">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
        onFocus={() => q && setOpen(true)}
        placeholder="Search patients…  (Ctrl+K)"
        className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-9 py-2 text-sm text-slate-100 font-body placeholder-slate-500 focus:outline-none focus:border-teal-400"
      />
      {q && (
        <button onClick={() => { setQ(""); setResults([]); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
          <X size={14} />
        </button>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 shadow-xl shadow-slate-950/60 overflow-hidden z-50">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { onOpenPatient(p.id); setQ(""); setResults([]); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-800/60 transition-colors border-b border-slate-800/60 last:border-0"
            >
              <span className="text-sm text-slate-100 font-body truncate">{p.first_name} {p.last_name}</span>
              <span className="font-mono2 text-xs text-teal-300 shrink-0 ml-3">{p.mrn}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardHome({ go }) {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ patients: null, appts: null, waiting: null, open: null });

  useEffect(() => {
    (async () => {
      const from = todayStr() + "T00:00:00";
      const [p, a, w, o] = await Promise.all([
        supabase.from("patients").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("appointments").select("id", { count: "exact", head: true }).gte("starts_at", from).lt("starts_at", todayStr() + "T23:59:59"),
        supabase.from("queue_tickets").select("id", { count: "exact", head: true }).gte("created_at", from).in("status", ["waiting", "called"]),
        supabase.from("encounters").select("id", { count: "exact", head: true }).is("ended_at", null),
      ]);
      setStats({ patients: p.count ?? 0, appts: a.count ?? 0, waiting: w.count ?? 0, open: o.count ?? 0 });
    })();
  }, []);

  const cards = [
    { label: "Registered patients", value: stats.patients, icon: Users, mod: "patients" },
    { label: "Appointments today", value: stats.appts, icon: Clock, mod: "appointments" },
    { label: "Waiting in queue", value: stats.waiting, icon: Activity, mod: "appointments" },
    { label: "Open consultations", value: stats.open, icon: ClipboardList, mod: "doctor" },
  ];

  const shortcuts = [
    { label: "Register a new patient", desc: "Search-first registration with duplicate detection", mod: "patients", icon: Users },
    { label: "Book an appointment", desc: "Calendar with day and week views", mod: "appointments", icon: Calendar },
    { label: "Start a consultation", desc: "SOAP notes, e-Rx, med certs", mod: "doctor", icon: Stethoscope },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="fade-up">
      <div className="mb-8">
        <div className="font-mono2 text-xs text-teal-300 mb-1">
          {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
        </div>
        <h2 className="font-display text-3xl font-bold text-slate-50">{greeting}, {profile?.full_name?.split(" ")[0]}.</h2>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, mod }) => (
          <button key={label} onClick={() => go(mod)} className="rounded-3xl border border-slate-800 bg-slate-900 p-5 text-left hover:border-teal-500/50 transition-colors">
            <Icon size={18} className="text-teal-300 mb-3" />
            <div className="font-display text-3xl font-bold text-slate-50">{value === null ? "—" : value}</div>
            <div className="text-xs text-slate-500 font-body mt-1">{label}</div>
          </button>
        ))}
      </div>

      <div className="font-display font-semibold text-slate-100 mb-3">Quick actions</div>
      <div className="grid md:grid-cols-3 gap-4">
        {shortcuts.map(({ label, desc, mod, icon: Icon }) => (
          <button key={label} onClick={() => go(mod)} className="rounded-3xl border border-slate-800 bg-slate-900 p-5 text-left hover:border-teal-500/50 transition-colors group">
            <div className="flex items-start justify-between">
              <Icon size={18} className="text-teal-300 mb-3" />
              <ChevronRight size={16} className="text-slate-600 group-hover:text-teal-300 transition-colors" />
            </div>
            <div className="font-body text-sm text-slate-100 font-semibold">{label}</div>
            <div className="text-xs text-slate-500 font-body mt-0.5">{desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StaffAppInner({ AdminPortal, onExitToSite }) {
  const { profile, signOut } = useAuth();
  const [mod, setMod] = useState("home");
  const [openPatientId, setOpenPatientId] = useState(null);

  const openPatient = (id) => {
    setOpenPatientId(id);
    setMod("patients");
  };

  const items = [
    { id: "home", label: "Dashboard", icon: LayoutDashboard },
    { id: "patients", label: "Patients", icon: Users },
    { id: "appointments", label: "Appointments", icon: Calendar },
    { id: "doctor", label: "Doctor Portal", icon: Stethoscope },
    ...(profile?.role === "admin" ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* sidebar */}
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col sticky top-0 h-screen">
        <button onClick={onExitToSite} className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800">
          <div className="w-8 h-8 rounded-xl bg-teal-400 flex items-center justify-center">
            <Activity size={17} className="text-slate-950" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-slate-50">MediPulse</span>
        </button>
        <nav className="flex-1 p-3 space-y-1">
          {items.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setMod(id); if (id !== "patients") setOpenPatientId(null); }}
              className={
                "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-body transition-colors " +
                (mod === id ? "bg-teal-400/10 text-teal-300 border border-teal-400/30" : "text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent")
              }
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <div className="px-3.5 py-2 mb-1">
            <div className="text-sm text-slate-100 font-body truncate">{profile?.full_name}</div>
            <div className="font-mono2 text-xs text-slate-500 capitalize">{profile?.role}</div>
          </div>
          <button onClick={signOut} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-body text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-40 flex items-center gap-4 px-6">
          <GlobalSearch onOpenPatient={openPatient} />
        </header>
        <main className="flex-1">
          {mod === "home" && <div className="max-w-6xl mx-auto px-6 py-10"><DashboardHome go={setMod} /></div>}
          {mod === "patients" && <PatientRecords openPatientId={openPatientId} />}
          {mod === "appointments" && <AppointmentsModule />}
          {mod === "doctor" && <DoctorPortal />}
          {mod === "admin" && AdminPortal && <AdminPortal />}
        </main>
      </div>
    </div>
  );
}

export default function StaffApp({ AdminPortal, onExitToSite }) {
  return (
    <StaffGate>
      <StaffAppInner AdminPortal={AdminPortal} onExitToSite={onExitToSite} />
    </StaffGate>
  );
}
