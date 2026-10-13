'use client';

import { useState } from 'react';
import { Atom, Activity, Boxes, BookOpen, Info, Orbit, Users, GraduationCap, Layers } from 'lucide-react';
import Overview from '@/components/qec/Overview';
import SimulatorLab from '@/components/qec/SimulatorLab';
import PerformanceLab from '@/components/qec/PerformanceLab';
import QuantumLab3D from '@/components/qec/QuantumLab3D';
import Learn from '@/components/qec/Learn';
import { CodeGallery, NoiseGallery, Literature, About } from '@/components/qec/Galleries';
import { GuideModeProvider } from '@/components/qec/Guide';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Boxes },
  { id: 'simulator', label: 'Simulator Lab', icon: Atom },
  { id: 'lab3d', label: '3D Quantum Lab', icon: Orbit },
  { id: 'performance', label: 'Performance Lab', icon: Activity },
  { id: 'learn', label: 'Learn', icon: GraduationCap },
  { id: 'reference', label: 'Reference', icon: Layers },
  { id: 'about', label: 'About', icon: Info },
];

/* Legacy tab ids (from links inside Overview/Learn) map into the Reference tab */
const REFERENCE_SUBS = ['codes', 'noise', 'literature'] as const;
type ReferenceSub = (typeof REFERENCE_SUBS)[number];

const TEAM = 'K. Devendra Reddy · Shaik Muzzammil · D. Guna Samhith';

/* ------------------------------------------------------------------ */
/* Reference tab — QEC Codes + Noise Models + Literature in ONE place   */
/* ------------------------------------------------------------------ */
function Reference({ sub, setSub }: { sub: ReferenceSub; setSub: (s: ReferenceSub) => void }) {
  const chips: { id: ReferenceSub; label: string }[] = [
    { id: 'codes', label: 'QEC Codes' },
    { id: 'noise', label: 'Noise Models' },
    { id: 'literature', label: 'Literature' },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-xl font-semibold text-slate-100">Reference</h2>
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setSub(c.id)}
            className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition-all ${
              sub === c.id
                ? 'border-cyan-400/60 bg-cyan-600/20 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.18)]'
                : 'border-violet-500/20 bg-[#141126] text-slate-400 hover:border-violet-500/40 hover:text-slate-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {sub === 'codes' && <CodeGallery />}
      {sub === 'noise' && <NoiseGallery />}
      {sub === 'literature' && <Literature />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Static ambient background — pure CSS, zero animation loops           */
/* (v4: the old drifting-particle canvas ran an endless rAF loop; this   */
/*  static glow is silent, cheaper and keeps the focus on simulations)   */
/* ------------------------------------------------------------------ */
function StaticBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[#0b0916]" />
      <div className="absolute -top-32 right-[8%] h-[420px] w-[420px] rounded-full bg-violet-700/12 blur-[130px]" />
      <div className="absolute bottom-[-160px] left-[4%] h-[380px] w-[380px] rounded-full bg-cyan-600/10 blur-[130px]" />
      <div className="absolute left-[38%] top-[30%] h-[300px] w-[300px] rounded-full bg-fuchsia-700/8 blur-[120px]" />
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState('overview');
  const [refSub, setRefSub] = useState<ReferenceSub>('codes');

  // Single navigation entry point: legacy ids ('codes' | 'noise' | 'literature')
  // land on the Reference tab with the right chip pre-selected.
  const navigate = (id: string) => {
    if (REFERENCE_SUBS.includes(id as ReferenceSub)) {
      setRefSub(id as ReferenceSub);
      setTab('reference');
      return;
    }
    setTab(id);
  };

  return (
    <GuideModeProvider>
    <div className="relative flex min-h-screen flex-col bg-[#0b0916] text-slate-200">
      <StaticBackdrop />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-violet-500/20 bg-[#0b0916]/85 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 shadow-[0_0_24px_rgba(139,92,246,0.45)]">
            <Atom className="h-5.5 w-5.5 text-white" />
          </div>
          <div className="mr-auto">
            <div className="bg-gradient-to-r from-slate-50 to-slate-300 bg-clip-text text-base font-bold leading-tight text-transparent">
              QEC Simulator
            </div>
            <div className="text-[10px] leading-tight text-slate-500">
              Interactive Quantum Error Correction · Phase 2 Prototype · Amrita Vishwa Vidyapeetham
            </div>
          </div>
          <span className="hidden rounded-full border border-cyan-500/30 bg-cyan-500/5 px-3 py-1 text-[10px] font-medium text-cyan-300 md:block">
            Live · 100% in-browser engine
          </span>
        </div>
        {/* Tabs */}
        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 pb-2" aria-label="Sections">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    active
                      ? 'bg-violet-600/25 text-violet-200 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.4)]'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {tab === 'overview' && <Overview onNavigate={navigate} />}
        {tab === 'simulator' && <SimulatorLab onNavigate={navigate} />}
        {tab === 'lab3d' && <QuantumLab3D />}
        {tab === 'performance' && <PerformanceLab onNavigate={navigate} />}
        {tab === 'learn' && <Learn onNavigate={navigate} />}
        {tab === 'reference' && <Reference sub={refSub} setSub={setRefSub} />}
        {tab === 'about' && <About />}
      </main>

      {/* Footer — project authors */}
      <footer className="border-t border-violet-500/15 bg-[#0d0b1a]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-[11px] text-slate-500">
          <span>An Interactive Quantum Error Correction Simulator — Phase 2 prototype, Amrita Vishwa Vidyapeetham. All simulations run locally in your browser.</span>
          <span className="flex items-center gap-1.5 font-medium text-slate-400">
            <Users className="h-3.5 w-3.5 text-violet-400" />
            {TEAM}
          </span>
        </div>
      </footer>
    </div>
    </GuideModeProvider>
  );
}
