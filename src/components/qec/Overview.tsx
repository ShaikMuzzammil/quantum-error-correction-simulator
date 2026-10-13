'use client';

/**
 * Overview: hero, objectives from Phase-1, and the interactive worked example
 * (3-qubit bit-flip code, bit-flip noise 10%) straight from the PPT architecture slide.
 */

import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, ShieldCheck, Gauge, SlidersHorizontal, Atom, Cpu, Activity, Orbit, GraduationCap } from 'lucide-react';
import { runTrace } from '@/lib/qec/pipeline';
import { CODE_3BITFLIP } from '@/lib/qec/codes';
import { makeRng } from '@/lib/qec/engine';

const TEAM = [
  { name: 'K. Devendra Reddy', id: 'CH.SC.U4CSE24021' },
  { name: 'Shaik Muzzammil', id: 'CH.SC.U4CSE24041' },
  { name: 'D. Guna Samhith', id: 'CH.SC.U4CSE24016' },
];

export default function Overview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-[#191233] via-[#120e24] to-[#0c1120] p-8 md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <Badge className="mb-4 bg-violet-600/25 text-violet-200 hover:bg-violet-600/25">Phase 2 Prototype · Interactive Simulator · Amrita Vishwa Vidyapeetham</Badge>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight text-slate-50 md:text-4xl">
            An Interactive <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">Quantum Error Correction</span> Simulator
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
            Configure a code, pick a noise model, and watch error correction work — every objective from our
            Phase-1 proposal running live in your browser. Press Run once: each simulation plays through and stops.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              '2 QEC codes (bit-flip · phase-flip)', '3 noise channels (X · Z · depolarizing)',
              'Exact Python-file circuits', 'Monte Carlo engine', 'One-shot 3D/4D runs',
              'PDF reports with circuit diagrams', '25,000-shot runs', 'Always-on input guides',
            ].map((f) => (
              <span key={f} className="rounded-full border border-cyan-500/25 bg-cyan-500/5 px-3 py-1 text-xs text-cyan-300">{f}</span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => onNavigate('simulator')} className="bg-violet-600 hover:bg-violet-500">
              <Atom className="mr-1.5 h-4 w-4" /> Open Simulator
            </Button>
            <Button onClick={() => onNavigate('lab3d')} className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500">
              <Orbit className="mr-1.5 h-4 w-4" /> 3D Quantum Lab
            </Button>
            <Button onClick={() => onNavigate('performance')} variant="outline" className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
              <Activity className="mr-1.5 h-4 w-4" /> Performance Lab
            </Button>
            <Button onClick={() => onNavigate('learn')} variant="outline" className="border-amber-400/40 text-amber-300 hover:bg-amber-500/10">
              <GraduationCap className="mr-1.5 h-4 w-4" /> Learn the basics
            </Button>
          </div>
        </div>
      </div>

      {/* Objectives -> features mapping */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Phase-1 Objectives → Implemented Features</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: SlidersHorizontal,
              title: '1 · Multi-model noise simulation',
              body: 'The three noise channels of all_with_noise_prob.py — bit-flip (X), phase-flip (Z) and depolarizing — each with a configurable probability, applied through exact quantum-trajectory sampling on every shot.',
              tab: 'noise',
              cta: 'Browse noise models',
            },
            {
              icon: Gauge,
              title: '2 · Before/after comparison',
              body: 'Every experiment evaluates the SAME noise on a bare qubit and on the encoded logical qubit: fidelities, error rates, improvement factors, detection statistics, plus full probability sweeps that expose each code\u2019s pseudo-threshold.',
              tab: 'performance',
              cta: 'Run performance analysis',
            },
            {
              icon: ShieldCheck,
              title: '3 · Configurable QEC experimentation',
              body: 'Both QEC codes of the Python reference — 3-Qubit Bit-Flip [[3,1,3]] and 3-Qubit Phase-Flip [[3,1,3]] — combinable with any compatible noise channel, plus input-state presets, manual error injection on any qubit and a seeded RNG for reproducibility.',
              tab: 'simulator',
              cta: 'Configure an experiment',
            },
          ].map((o) => (
            <Card key={o.title} className="border-violet-500/20 bg-[#141126] transition-colors hover:border-violet-500/40">
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20">
                  <o.icon className="h-5 w-5 text-violet-300" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100">{o.title}</h3>
                <p className="text-xs leading-relaxed text-slate-400">{o.body}</p>
                <Button size="sm" variant="ghost" className="mt-auto justify-start px-2 text-cyan-400 hover:bg-cyan-500/10" onClick={() => onNavigate(o.tab)}>
                  {o.cta} →
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <WorkedExample />

      {/* Pipeline architecture */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-100">Simulation Pipeline Architecture</h2>
        <Card className="border-violet-500/20 bg-[#141126]">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs md:gap-3">
              {['User Input', 'Encoding', 'Noise Model', 'Syndrome', 'Correction', 'Decoding', 'Measurement', 'Performance'].map((s, i, arr) => (
                <span key={s} className="flex items-center gap-2 md:gap-3">
                  <span className={`rounded-lg border px-3 py-2 font-medium ${i === 0 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : i === arr.length - 1 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-violet-500/40 bg-violet-500/10 text-violet-300'}`}>
                    {s}
                  </span>
                  {i < arr.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
                </span>
              ))}
            </div>
            <p className="mx-auto mt-4 max-w-3xl text-center text-xs leading-relaxed text-slate-500">
              Every run follows the exact pipeline of all_with_noise_prob.py. The engine is a from-scratch quantum
              simulator: a full state-vector backend with real complex amplitudes, quantum-trajectory noise sampling
              and projective stabilizer measurements — the ancilla-free equivalent of the Python circuit&apos;s q3/q4
              syndrome ancillas and conditional corrections.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Team */}
      <div className="grid gap-4 md:grid-cols-3">
        {TEAM.map((t) => (
          <Card key={t.id} className="border-violet-500/15 bg-[#141126]">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 font-semibold text-white">
                {t.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-200">{t.name}</div>
                <div className="font-mono text-[11px] text-slate-500">{t.id}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive worked example (PPT slide 7)                            */
/* ------------------------------------------------------------------ */

function WorkedExample() {
  const [stepIdx, setStepIdx] = useState(0);
  const [auto, setAuto] = useState(false);

  // Run the REAL engine with the PPT scenario: bit-flip code, X error on qubit 1
  const trace = useMemo(
    () => runTrace(CODE_3BITFLIP, 'bitflip', { p: 0.1 }, 0, 0, 42, [{ qubit: 1, x: true, z: false }]),
    []
  );

  const steps = useMemo(() => [
    {
      title: 'User Input',
      icon: Cpu,
      body: (
        <>
          <p>3-qubit Bit-Flip QEC + Bit-Flip noise + 10% probability, input state |ψ⟩ = |0⟩.</p>
          <p className="mt-2 text-slate-500">This is the exact configuration from our Phase-1 architecture slide — now executed by the real simulator engine.</p>
        </>
      ),
    },
    {
      title: 'Quantum Circuit — Encoding',
      icon: Atom,
      body: (
        <>
          <p>Start with one qubit: |ψ⟩ = |0⟩. The encoder applies CNOT(q0→q1), CNOT(q0→q2).</p>
          <p className="mt-2 font-mono text-cyan-300">|0⟩ → |000⟩ — three physical qubits now protect the information.</p>
          <p className="mt-2 text-slate-500">Encoded state: α|000⟩ + β|111⟩ with α = 1, β = 0 here.</p>
        </>
      ),
    },
    {
      title: 'Noise Model',
      icon: Activity,
      body: (
        <>
          <p>A bit flip hits the 2nd qubit:</p>
          <p className="mt-2 font-mono text-rose-300">|000⟩ → |010⟩</p>
          <p className="mt-2 text-slate-500">Each qubit independently suffers an X error with probability p = 10% per shot. Here the sampled error lands on qubit 1 (0-indexed), exactly as in the slide.</p>
        </>
      ),
    },
    {
      title: 'Error Detection / Syndrome',
      icon: Gauge,
      body: (
        <>
          <p>Parity checks Z₀Z₁ and Z₁Z₂ are measured:</p>
          <div className="mt-2 flex gap-2">
            {trace.syndrome.map((s) => (
              <span key={s.label} className={`rounded-md border px-2 py-1 font-mono text-xs ${s.bit ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-slate-600/40 text-slate-400'}`}>
                {s.label} = {s.bit}
              </span>
            ))}
          </div>
          <p className="mt-2 text-slate-500">The qubits are not all equal; the syndrome (1, 1) points to the 2nd qubit.</p>
        </>
      ),
    },
    {
      title: 'Error Correction',
      icon: ShieldCheck,
      body: (
        <>
          <p>The decoder maps syndrome (1,1) → X error on qubit 1. Apply an X gate:</p>
          <p className="mt-2 font-mono text-emerald-300">|010⟩ → |000⟩</p>
          <p className="mt-2 text-slate-500">Correction applied by the engine: X on q{trace.correction.x[0] ?? 1}.</p>
        </>
      ),
    },
    {
      title: 'Decoding',
      icon: Atom,
      body: (
        <>
          <p>The inverse circuit un-encodes:</p>
          <p className="mt-2 font-mono text-cyan-300">|000⟩ → |0⟩</p>
          <p className="mt-2 text-slate-500">Back to a single physical qubit holding the (protected) information.</p>
        </>
      ),
    },
    {
      title: 'Measurement',
      icon: CircleCheckDot,
      body: (
        <>
          <p>Result = <span className="font-mono text-emerald-300">{trace.measuredOutcome}</span> — the original information is recovered.</p>
          <p className="mt-2 text-slate-500">Decoded state fidelity with |0⟩: {(trace.fidelity * 100).toFixed(2)}%.</p>
        </>
      ),
    },
    {
      title: 'Performance Analysis',
      icon: Gauge,
      body: (
        <>
          <p>Compare with and without QEC under the same noise:</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2 text-center">
              <div className="text-[10px] uppercase text-slate-500">With QEC</div>
              <div className="font-mono text-lg text-emerald-300">{(trace.fidelity * 100).toFixed(2)}%</div>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-center">
              <div className="text-[10px] uppercase text-slate-500">Bare qubit</div>
              <div className="font-mono text-lg text-rose-300">{(trace.fidelityBefore * 100).toFixed(2)}%</div>
            </div>
          </div>
          <p className="mt-2 text-slate-500">Open the Performance Lab to sweep p from 0 → 50% and see the full before/after curves.</p>
        </>
      ),
    },
  ], [trace]);

  useEffect(() => {
    if (!auto) return;
    // one-shot tour: plays through once and stops at the last step
    const t = setInterval(() => {
      setStepIdx((s) => {
        if (s + 1 >= steps.length) {
          setAuto(false);
          return s;
        }
        return s + 1;
      });
    }, 2600);
    return () => clearInterval(t);
  }, [auto, steps.length]);

  const step = steps[Math.min(stepIdx, steps.length - 1)];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-100">Architecture: A Worked Example <span className="text-sm font-normal text-slate-500">(live engine run)</span></h2>
        <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300" onClick={() => setAuto(!auto)}>
          {auto ? '⏸ Pause tour' : '▶ Auto-play tour'}
        </Button>
      </div>
      <Card className="border-violet-500/25 bg-[#141126]">
        <CardContent className="p-6">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {steps.map((s, i) => (
              <button
                key={s.title}
                onClick={() => { setStepIdx(i); setAuto(false); }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  i === stepIdx ? 'bg-violet-600 text-white' : i < stepIdx ? 'bg-violet-600/20 text-violet-300' : 'bg-slate-800/60 text-slate-500 hover:bg-slate-700/60'
                }`}
              >
                {i + 1}. {s.title}
              </button>
            ))}
          </div>

          <div className="grid items-start gap-6 md:grid-cols-[1fr_240px]">
            <div className="min-h-[150px]">
              <div className="mb-2 flex items-center gap-2">
                <step.icon className="h-5 w-5 text-violet-300" />
                <h3 className="text-lg font-semibold text-slate-100">{step.title}</h3>
                <span className="text-xs text-slate-500">step {stepIdx + 1} / {steps.length}</span>
              </div>
              <div className="text-sm leading-relaxed text-slate-300">{step.body}</div>
            </div>

            <div className="rounded-xl border border-cyan-500/20 bg-[#0d1520] p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Qubit Register</div>
              <div className="flex justify-center gap-2">
                {['|0⟩→', '|0⟩→', '|0⟩'].map((_, q) => {
                  const stateStr = stepIdxToBits(stepIdx);
                  const bit = stateStr[q];
                  const corrupted = stepIdx >= 2 && stepIdx <= 3 && q === 1;
                  const correcting = stepIdx === 4 && q === 1;
                  return (
                    <div key={q} className="flex flex-col items-center gap-1">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-lg border font-mono text-xl ${
                        corrupted ? 'border-rose-500 bg-rose-500/15 text-rose-300'
                          : correcting ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                            : 'border-cyan-500/40 bg-cyan-500/5 text-cyan-200'
                      }`}>
                        {bit}
                      </div>
                      <span className="text-[10px] text-slate-500">q{q}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-center font-mono text-xs text-slate-400">{stepCaption(stepIdx)}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300" onClick={() => { setStepIdx((stepIdx - 1 + steps.length) % steps.length); setAuto(false); }}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all" style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }} />
            </div>
            <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300" onClick={() => { setStepIdx((stepIdx + 1) % steps.length); setAuto(false); }}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CircleCheckDot(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/* bit patterns shown in the qubit register at each step */
function stepIdxToBits(step: number): string[] {
  switch (step) {
    case 0: return ['ψ', '0', '0'];
    case 1: return ['0', '0', '0'];
    case 2: return ['0', '1', '0'];
    case 3: return ['0', '1', '0'];
    case 4: return ['0', '0', '0'];
    case 5: return ['0', '0', '0'];
    case 6: return ['0', '0', '0'];
    default: return ['0', '0', '0'];
  }
}

function stepCaption(step: number): string {
  return ['input |ψ⟩ = |0⟩', 'encoded |000⟩', 'noise: X on q1', 'syndrome (1,1)', 'corrected |000⟩', 'decoded |0⟩', 'measured 0', 'F = 100%'][Math.min(step, 7)];
}
