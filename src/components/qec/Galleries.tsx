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
  const svIds = new Set(SV_CODES.map((c) => c.id));
  const svCodes = CODE_REGISTRY.filter((c) => svIds.has(c.id));
  const surfaceCodes = CODE_REGISTRY.filter((c) => !svIds.has(c.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-slate-100">QEC Code Explorer</h2>
        <p className="mb-4 text-sm text-slate-500">
          Every code below runs live in the simulator. [[n, k, d]] = n physical qubits protecting k logical qubits
          with distance d (corrects up to ⌊(d−1)/2⌋ arbitrary single-qubit errors).
        </p>
        <Accordion type="single" collapsible className="flex flex-col gap-3">
          {svCodes.map((c) => {
            const def = getSVCode(c.id);
            return (
              <AccordionItem key={c.id} value={c.id} className="rounded-xl border glass border-white/8 px-5 last:border-b">
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

          {surfaceCodes.map((c) => (
            <AccordionItem key={c.id} value={c.id} className="rounded-xl border border-cyan-500/20 bg-[#101822] px-5 last:border-b">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex flex-wrap items-center gap-3 text-left">
                  <span className="text-sm font-semibold text-slate-100">{c.name}</span>
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">[[{c.n},{c.k},{c.d}]]</Badge>
                  <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">{c.family}</Badge>
                  <span className="text-xs text-slate-500">MWPM decoder</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-5">
                <p className="text-sm leading-relaxed text-slate-400">{c.description}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
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
          All eight channels from our literature survey, implemented with exact quantum-trajectory sampling
          (state-vector codes) or Pauli-frame sampling (surface codes).
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {NOISE_MODELS.map((m) => (
            <Card key={m.id} className="glass border-white/8">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-100">{m.name}</span>
                  <Badge variant="outline" className={`${m.pauliOnly ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400'}`}>
                    {m.pauliOnly ? 'Pauli (surface-compatible)' : 'non-Pauli'}
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
        <Card className="glass border-white/8">
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
              fix: 'Eight noise channels — including non-Pauli amplitude damping, thermal relaxation, coherent over-rotation and correlated crosstalk — across ALL nine code configurations, instead of one noise per paper.',
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
      <Card className="glass border-white/8">
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="text-xl font-semibold text-slate-100">About This Prototype</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            This web application is the Phase-2 deliverable of our project <span className="text-violet-300">&ldquo;An Interactive
            Quantum Error Correction Simulator&rdquo;</span>. It implements the three objectives defined in Phase 1 as a fully
            client-side web application: a from-scratch quantum simulation engine in TypeScript (no external quantum
            libraries), a state-vector backend with quantum-trajectory noise sampling and projective stabilizer
            measurements for codes up to 9 data qubits, and a Pauli-frame stabilizer backend with an exact
            minimum-weight-perfect-matching decoder for rotated surface codes up to distance 7.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-cyan-300">Engine Highlights</h3>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
                <li>Full state-vector simulation (complex amplitudes, up to 2⁹ dimensions) with 125 automated correctness tests passing</li>
                <li>Quantum trajectories for non-Pauli channels (amplitude damping, thermal relaxation, coherent rotations)</li>
                <li>Projective stabilizer measurement with optional syndrome readout error</li>
                <li>Exact MWPM decoding (subset DP) with BFS shortest-path recovery on the stabilizer graph</li>
                <li>Reproduced physics: 3-qubit code matches theory to <span className="font-mono">1−P(≥2 errors)</span>; surface-code threshold at ~10%; P_L(d=3) = 18p² exact scaling</li>
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
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-4">
            <h3 className="mb-2 text-sm font-semibold text-amber-300">What&apos;s new in v6 — the 4D Lab rebuild</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
              <li><span className="text-amber-200">Four live 3D/4D simulators</span>: Bloch Flight 4D (target pin + live fidelity chart), State Cityscape 3D (true city grid, up to 32 shaded towers), Spacetime Lattice 4D (connected time axis, floor panels, d up to 9 × 16 rounds) — and the new Threshold Terrain 4D.</li>
              <li><span className="text-amber-200">Threshold Terrain 4D</span>: 2,500+ complete surface-code experiments run live in your browser, building the logical-error-rate terrain in 3D and reporting a measured threshold estimate.</li>
              <li><span className="text-amber-200">Plain-language pass</span>: every 3D-lab explanation and “Try this” rewritten in short, simple sentences — nothing about the physics removed.</li>
              <li><span className="text-amber-200">Detailed deploy guide</span>: README now walks from GitHub push to a live Vercel site, step by step.</li>
              <li><span className="text-amber-200">Everything else kept</span>: aurora-glass UI, live pipeline playback, streaming Monte Carlo, Code Showdown, one-shot 3D/4D labs, PDF/JSON/CSV exports, and the 125-test verified engine.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-600/30 bg-slate-800/20 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Feature map — where to find everything</h3>
            <div className="grid gap-1.5 text-[11px] text-slate-400 sm:grid-cols-2">
              {[
                ['Overview', 'Project goals, worked example tour, quick start'],
                ['Simulator Lab', 'Single-shot full pipeline · guides + explanation tabs'],
                ['3D Quantum Lab', 'Bloch Flight 4D · State Cityscape · Spacetime Lattice · Threshold Terrain (one-shot runs)'],
                ['Performance Lab', 'Live Monte Carlo · sweeps · Code Showdown · exports'],
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
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Project Team</h3>
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
