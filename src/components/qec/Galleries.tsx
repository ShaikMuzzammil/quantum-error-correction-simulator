'use client';

/**
 * Reference galleries: QEC code explorer, noise model library, literature review,
 * and about/project-mapping sections.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import CircuitDiagram from './CircuitDiagram';
import { CODE_REGISTRY } from '@/lib/qec/registry';
import { SV_CODES, getSVCode } from '@/lib/qec/codes';
import { NOISE_MODELS } from '@/lib/qec/noise';

/* ------------------------------------------------------------------ */
/* Code gallery                                                        */
/* ------------------------------------------------------------------ */

export function CodeGallery() {
  const svCodes = CODE_REGISTRY;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-slate-100">QEC Code Explorer</h2>
        <p className="mb-4 text-sm text-slate-500">
          The two codes of all_with_noise_prob.py — both run live in the simulator. [[n, k, d]] = n physical qubits
          protecting k logical qubits with distance d (corrects up to ⌊(d−1)/2⌋ errors of the targeted type).
        </p>
        <Accordion type="single" collapsible className="flex flex-col gap-3">
          {svCodes.map((c) => {
            const def = getSVCode(c.id);
            return (
              <AccordionItem key={c.id} value={c.id} className="rounded-xl border border-violet-500/20 bg-[#141126] px-5 last:border-b">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex flex-wrap items-center gap-3 text-left">
                    <span className="text-sm font-semibold text-slate-100">{c.name}</span>
                    <Badge variant="outline" className="border-violet-500/40 text-violet-300">[[{c.n},{c.k},{c.d}]]</Badge>
                    <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">{c.family}</Badge>
                    <span className="text-xs text-slate-500">{c.corrects}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <p className="mb-4 text-sm leading-relaxed text-slate-400">{c.description}</p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">Encoding Circuit</h4>
                      <CircuitDiagram ops={def.encoding} nQubits={def.n} />
                    </div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">Stabilizer Generators</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {def.stabilizers.map((s) => (
                            <span key={s.label} className={`rounded-md border px-2 py-1 font-mono text-xs ${s.type === 'X' ? 'border-amber-500/40 bg-amber-500/5 text-amber-300' : 'border-violet-500/40 bg-violet-500/5 text-violet-300'}`}>
                              {s.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">Logical Operators</h4>
                        <div className="flex gap-1.5">
                          <span className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2 py-1 font-mono text-xs text-emerald-300">
                            X_L = {def.logicalX.filter((p) => p !== 'I').length > 0 ? def.logicalX.join('') : '—'}
                          </span>
                          <span className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2 py-1 font-mono text-xs text-emerald-300">
                            Z_L = {def.logicalZ.join('')}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        Syndrome extraction measures each generator via projective Pauli measurements; corrections are
                        looked up from an auto-generated single-error table with nearest-syndrome fallback.
                      </p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Noise gallery                                                       */
/* ------------------------------------------------------------------ */

export function NoiseGallery() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-slate-100">Noise Model Library</h2>
        <p className="mb-4 text-sm text-slate-500">
          Exactly the three channels of all_with_noise_prob.py&apos;s build_noise_model(), implemented with exact
          quantum-trajectory sampling on the state-vector engine. The Python file attaches each error to the id gate
          of the chosen error qubit; here every shot samples it live.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {NOISE_MODELS.map((m) => (
            <Card key={m.id} className="border-violet-500/20 bg-[#141126]">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-100">{m.name}</span>
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">
                    Python noise {m.pythonType}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                <p className="text-xs leading-relaxed text-slate-400">{m.description}</p>
                <code className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1.5 text-[11px] text-cyan-300">{m.math}</code>
                <span className="text-[11px] text-slate-500">Parameter: {m.mainParam}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Literature review (from the Phase-1 PPT)                            */
/* ------------------------------------------------------------------ */

const PAPERS = [
  { n: 1, title: 'An Efficient Simulation of Quantum Error Correction Codes', authors: 'R. Padma Priya, A. Baradeswaran', year: 2018, focus: 'QCAD-based simulation of QEC using bit-flip and phase-flip errors and recovery methods.' },
  { n: 2, title: 'Testing Quantum Fault Tolerance on Small Systems', authors: 'D. Willsch, M. Willsch, F. Jin, H. De Raedt, K. Michielsen', year: 2018, focus: 'Tests fault-tolerant quantum computing with simulations and an IBM quantum processor under different error conditions.' },
  { n: 3, title: 'Correcting Coherent Errors with Surface Codes', authors: 'S. Bravyi, M. Englbrecht, R. König, N. Peard', year: 2018, focus: 'Studies surface-code QEC under coherent errors and compares with Pauli-noise approximations.' },
  { n: 4, title: 'Logical Performance of 9 Qubit Compass Codes in Ion Traps with Crosstalk Errors', authors: 'D. M. Debroy, M. Li, S. Huang, K. R. Brown', year: 2020, focus: 'Evaluates QEC codes under dephasing, gate overrotation and crosstalk in ion-trap systems.' },
  { n: 5, title: 'Simulating Quantum Error Correction beyond Pauli Stochastic Errors', authors: 'J. Hines, C. Ostrove, K. Rudinger, S. Seritan, K. Young, R. Blume-Kohout, T. Proctor', year: 2026, focus: 'Simulates coherent and non-Pauli errors using detector error models for QEC performance analysis.' },
  { n: 6, title: 'Testing a Quantum Error-Correcting Code on Various Platforms', authors: 'Q. Guo, Y.-Y. Zhao, M. Grassl, X. Nie, G.-Y. Xiang, T. Xin, Z.-Q. Yin, B. Zeng', year: 2020, focus: 'Implements a two-qubit code for detected amplitude damping on optical, IBM Q and NMR platforms.' },
  { n: 7, title: 'Simulation and Performance Analysis of QEC with a Rotated Surface Code under a Realistic Noise Model', authors: 'M. Katsuda, K. Mitarai, K. Fujii', year: 2024, focus: 'Simulates a distance-5 rotated surface code under realistic stochastic and coherent noise.' },
  { n: 8, title: 'Demonstrating Multi-Round Subsystem QEC Using Matching and Maximum Likelihood Decoders', authors: 'N. Sundaresan et al.', year: 2023, focus: 'Demonstrates multi-round QEC and syndrome decoding with matching and maximum-likelihood decoders.' },
  { n: 9, title: 'Simulation of Thermal-Relaxation Noise for Quantum Error Correction', authors: 'S. R. Garner, N. M. Myers, M. Wang, S. Stein, C. Liu, A. Li', year: 2026, focus: 'Develops accurate simulation methods for thermal-relaxation noise and evaluates QEC performance.' },
  { n: 10, title: 'Comparative Performance Analysis of QEC Codes under Simulated Depolarizing Noise using Qiskit', authors: 'G. Kaur, S. Kour, S. Kaur, S. Kaur', year: 2026, focus: 'Compares 3-qubit bit-flip, phase-flip and Shor codes under depolarizing noise using Qiskit Aer.' },
];

export function Literature() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-slate-100">Literature Review</h2>
        <p className="mb-4 text-sm text-slate-500">
          The ten studies surveyed in Phase 1 — this simulator unifies their methodologies in one environment.
        </p>
        <Card className="border-violet-500/20 bg-[#141126]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-violet-500/20">
                  <TableHead className="w-10 text-slate-400">#</TableHead>
                  <TableHead className="text-slate-400">Title</TableHead>
                  <TableHead className="text-slate-400">Author(s)</TableHead>
                  <TableHead className="w-16 text-slate-400">Year</TableHead>
                  <TableHead className="text-slate-400">Main focus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PAPERS.map((p) => (
                  <TableRow key={p.n} className="border-violet-500/10">
                    <TableCell className="font-mono text-violet-300">{p.n}</TableCell>
                    <TableCell className="font-medium text-slate-200">{p.title}</TableCell>
                    <TableCell className="text-xs text-slate-400">{p.authors}</TableCell>
                    <TableCell className="font-mono text-xs text-cyan-300">{p.year}</TableCell>
                    <TableCell className="text-xs text-slate-400">{p.focus}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-100">How This Simulator Addresses the Gaps</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              gap: '1 · Limited coverage of noise conditions',
              fix: 'The three canonical noise channels of our Python reference — bit-flip (X), phase-flip (Z) and depolarizing — sampled live on both QEC codes, with manual error injection on any qubit, instead of one noise per paper.',
            },
            {
              gap: '2 · Difficulty comparing QEC performance',
              fix: 'Every experiment reports identical metrics (fidelity, logical error rate, improvement factor) computed identically for every code/noise pair, with shared RNG seeds for reproducibility and CSV export for the sweeps.',
            },
            {
              gap: '3 · No common framework for QEC experimentation',
              fix: 'One interactive environment: choose code, noise, state, seed, error-injection and shot count; inspect single-shot pipelines or run Monte-Carlo statistics — no setup, no toolchain, runs entirely in the browser.',
            },
          ].map((g) => (
            <Card key={g.gap} className="border-emerald-500/25 bg-[#101a14]">
              <CardContent className="flex flex-col gap-2 p-5">
                <span className="text-xs font-semibold text-rose-300">{g.gap}</span>
                <span className="text-sm leading-relaxed text-emerald-100/80">→ {g.fix}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

export function About() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-violet-500/20 bg-[#141126]">
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="text-xl font-semibold text-slate-100">About This Prototype</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            <span className="font-semibold text-slate-200">Amrita Vishwa Vidyapeetham</span> — this web application is the
            Phase-2 deliverable of our project <span className="text-violet-300">&ldquo;An Interactive Quantum Error
            Correction Simulator&rdquo;</span>. It implements the objectives defined in Phase 1 as a fully client-side web
            application, focused exactly on the scope of our Python reference program (all_with_noise_prob.py): the
            3-Qubit Bit-Flip and 3-Qubit Phase-Flip codes under Bit-Flip (X), Phase-Flip (Z) and Depolarizing noise —
            with a from-scratch state-vector quantum simulation engine in TypeScript (no external quantum libraries),
            quantum-trajectory noise sampling, projective stabilizer measurements and the same encode → syndrome →
            correct → decode pipeline the Python program runs.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-cyan-300">Engine Highlights</h3>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
                <li>Full state-vector simulation (complex amplitudes, 2³ = 8 dimensions per block) with an automated correctness suite</li>
                <li>Exact quantum-trajectory sampling of all three Python noise channels</li>
                <li>Projective stabilizer measurement — the ancilla-free equivalent of the Python file&apos;s q3/q4 ancilla checks</li>
                <li>Auto-generated syndrome → correction tables identical to the Python mapping (01→q0, 11→q1, 10→q2)</li>
                <li>Reproduced physics: matched code/noise pairs recover perfectly; Monte Carlo matches the analytic 1−3p²+2p³ curve</li>
              </ul>
            </div>
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-violet-300">Technology Stack</h3>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
                <li>Next.js 16 (App Router) + TypeScript 5</li>
                <li>Tailwind CSS 4 + shadcn/ui component system</li>
                <li>Recharts for statistical visualization, custom SVG for circuit / Bloch-sphere / lattice rendering</li>
                <li>Framer-motion-ready layout, fully responsive, dark quantum-lab theme</li>
                <li>Zero backend compute — the entire simulator runs client-side at ~10⁴ shots/s</li>
              </ul>
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="mb-2 text-sm font-semibold text-amber-300">What&apos;s new in this edition — Focused on our Python pipeline</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
              <li><span className="text-amber-200">Scope exactly = all_with_noise_prob.py</span>: 2 QEC codes (bit-flip, phase-flip) × 3 noise channels (X, Z, depolarizing) — every extra code/noise from earlier drafts was removed so everything you see is what the Python program implements.</li>
              <li><span className="text-amber-200">Exact Python circuits in-app</span>: the Simulator Lab renders the real 5-qubit + 3-classical-bit circuits — id-gate noise insertion, q3/q4 syndrome measurement, conditional if_test corrections and the Python QEC STATUS verdict.</li>
              <li><span className="text-amber-200">New 3D visualizers</span>: an interactive Bloch Sphere pipeline walkthrough and a 4D Syndrome Spacetime view of the bit-flip code join Bloch Flight 4D and the State Cityscape.</li>
              <li><span className="text-amber-200">Circuit-aware exports</span>: every printable report can embed the exact circuit diagram alongside the full inputs/outputs tables.</li>
              <li><span className="text-amber-200">Everything verified</span>: automated engine tests, Monte Carlo matched against the analytic success formula, all tabs browser-tested.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-600/30 bg-slate-800/20 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Feature map — where to find everything</h3>
            <div className="grid gap-1.5 text-[11px] text-slate-400 sm:grid-cols-2">
              {[
                ['Overview', 'Project goals, worked example tour, quick start'],
                ['Simulator Lab', 'Single-shot full pipeline · guides + explanation tabs'],
                ['3D Quantum Lab', 'Bloch Flight 4D · State Cityscape · Syndrome Spacetime 4D · Bloch Sphere 3D'],
                ['Performance Lab', 'Monte Carlo & sweeps · pseudo-threshold chart · exports'],
                ['Learn', 'Compact how-to · six ideas · glossary · FAQ'],
                ['Reference', 'QEC Codes + Noise Models + Literature in one tab'],
                ['About', 'This page — engine, stack, team'],
              ].map(([tab, what]) => (
                <div key={tab} className="flex gap-2 rounded border border-slate-700/40 px-2 py-1">
                  <span className="w-28 shrink-0 font-medium text-violet-300">{tab}</span>
                  <span>{what}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-600/30 bg-slate-800/20 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Project Team — Amrita Vishwa Vidyapeetham</h3>
            <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
              <div><span className="text-slate-200">K. Devendra Reddy</span> — CH.SC.U4CSE24021</div>
              <div><span className="text-slate-200">Shaik Muzzammil</span> — CH.SC.U4CSE24041</div>
              <div><span className="text-slate-200">D. Guna Samhith</span> — CH.SC.U4CSE24016</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
