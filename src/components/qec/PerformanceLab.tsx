'use client';

/**
 * Performance Lab: Monte Carlo before/after comparison + noise sweeps.
 * Exactly the two QEC codes and three noise channels of
 * all_with_noise_prob.py: fidelity-based statistics (with QEC vs bare
 * qubit) and the fidelity-vs-p sweep that exposes each code's
 * pseudo-threshold.
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Download, BarChart3, TrendingUp, Timer, FileText, Braces } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { getSVCode } from '@/lib/qec/codes';
import { NoiseModelId, noiseParams } from '@/lib/qec/noise';
import { mcRunAsync, SweepPoint, sweepSV } from '@/lib/qec/pipeline';
import { CODE_REGISTRY, getCodeMeta } from '@/lib/qec/registry';
import { downloadJSON, openPrintableReport, runId, nowStamp, TEAM_NAMES } from '@/lib/report';
import { GuideField, HowToCard, ResultTabs, StepList, MeaningCard, TryBox, GuideInfo } from './Guide';

const NOISE_LABELS: Record<string, string> = {
  bitflip: 'Bit-Flip Noise (X)',
  phaseflip: 'Phase-Flip Noise (Z)',
  depolarizing: 'Depolarizing Noise',
};

const NOISE_PYTYPE: Record<string, 1 | 2 | 3> = { bitflip: 1, phaseflip: 2, depolarizing: 3 };

interface MCStats {
  shots: number;
  fidelityQEC: number;
  fidelityBefore: number;
  errorRateQEC: number;
  errorRateBefore: number;
  improvement: number;
  detectionRate: number;
  correctionRate: number;
  elapsedMs: number;
}

const CODE_INFO: GuideInfo = {
  what: 'Which quantum error correction code to evaluate. Both codes protect 1 logical qubit with 3 physical qubits ([[n,k,d]]: n physical qubits, k logical qubits, distance d).',
  how: 'Pick a code — the stats are computed live from full state-vector Monte Carlo. These are exactly the two codes of all_with_noise_prob.py.',
  example: '3-Qubit Bit-Flip [[3,1,3]] at 10% bit-flip noise improves the success rate massively over the bare qubit.',
};

const NOISE_INFO: GuideInfo = {
  what: 'The physical disturbance applied during every shot. The Python reference implements exactly three channels: Bit-Flip (X), Phase-Flip (Z) and Depolarizing — all three are implemented here.',
  how: 'Choose one. Bit-Flip (X) is the easiest to reason about; Depolarizing is the standard benchmark.',
  example: 'Depolarizing at 10% picks X, Y or Z uniformly when a qubit is hit — the standard benchmark channel.',
};

const SHOTS_INFO: GuideInfo = {
  what: 'One “shot” = one complete experiment: sample noise → encode → detect → correct → decode → score. Monte Carlo repeats it many times and reports the average — that is what turns quantum randomness into reliable statistics.',
  how: '200–2,000 for quick checks; 10,000+ for smooth, report-ready numbers. Limit: 25,000 shots — everything still runs in your browser.',
  example: '10,000 shots at p = 10% → error rates accurate to roughly ±0.3%.',
};

export default function PerformanceLab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [codeId, setCodeId] = useState('code-3bitflip');
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.1);
  const [shots, setShots] = useState(2000);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [mc, setMc] = useState<MCStats | null>(null);
  const [sweep, setSweep] = useState<SweepPoint[] | null>(null);
  const [sweepProgress, setSweepProgress] = useState(0);
  const runToken = useRef(0);

  const codeMeta = getCodeMeta(codeId);
  const compat = codeMeta.compat;

  const switchCode = (id: string) => {
    setCodeId(id);
    const meta = getCodeMeta(id);
    if (!meta.compat.includes(noise)) setNoise(meta.compat[0]);
  };

  const runMC = useCallback(async () => {
    const token = ++runToken.current;
    setRunning(true);
    setProgress(0);
    setMc(null);
    await new Promise((r) => setTimeout(r, 30));
    const svCode = getSVCode(codeId);
    const params = noiseParams(p);
    const r = await mcRunAsync(svCode, noise, params, Math.PI / 3, Math.PI / 5, shots, 77, 0, (done, total) => {
      if (token !== runToken.current) return;
      setProgress((done / total) * 100);
    });
    if (token !== runToken.current) return;
    setMc(r);
    setRunning(false);
  }, [codeId, noise, p, shots]);

  const runSweep = useCallback(async () => {
    const token = ++runToken.current;
    setRunning(true);
    setSweepProgress(0);
    setSweep(null);
    await new Promise((r) => setTimeout(r, 30));
    const svCode = getSVCode(codeId);
    const baseParams = noiseParams(p);
    const pValues = Array.from({ length: 13 }, (_, i) => 0.01 + i * 0.039); // 1%..50%
    const pts = sweepSV(svCode, noise, baseParams, Math.PI / 3, Math.PI / 5, 800, 300, pValues);
    if (token !== runToken.current) return;
    setSweepProgress(100);
    setSweep(pts);
    setRunning(false);
  }, [codeId, noise, p]);

  const exportCSV = () => {
    if (!sweep) return;
    const csv =
      'p,fidelityQEC,fidelityBare,errorRateQEC,errorRateBare\n' +
      sweep.map((s) => `${s.p},${s.fidelityQEC},${s.fidelityBefore},${s.errorRateQEC},${s.errorRateBefore}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qec-sweep-${codeId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ------------- formal report + JSON export (inputs + outputs) ------------- */

  const exportJSON = () => {
    downloadJSON(`performance-${codeId}-${runId()}.json`, {
      experiment: 'QEC performance analysis',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      institution: 'Amrita Vishwa Vidyapeetham',
      inputs: {
        code: `${codeMeta.name} [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]]`,
        pythonQecType: codeMeta.pythonType,
        engine: 'statevector',
        noiseModel: NOISE_LABELS[noise] ?? noise,
        pythonNoiseType: NOISE_PYTYPE[noise],
        operatingPointP: p,
        shots,
      },
      monteCarlo: mc ?? null,
      fidelitySweep: sweep ?? null,
    });
  };

  const exportReport = () => {
    const sections: Parameters<typeof openPrintableReport>[1] = [
      {
        heading: 'Inputs (Experiment Configuration)',
        kv: [
          ['QEC code', `${codeMeta.name} — [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]] (Python QEC ${codeMeta.pythonType})`],
          ['Engine', 'Full state-vector simulator (all_with_noise_prob.py pipeline)'],
          ['Noise model', `${NOISE_LABELS[noise] ?? noise} (Python noise ${NOISE_PYTYPE[noise]})`],
          ['Operating point p', p.toFixed(3)],
          ['Shots (Monte Carlo)', String(shots)],
          ['Input state', '|ψ⟩ at θ = 60°, φ = 36° (performance-lab standard)'],
          ['Generated at', nowStamp()],
        ],
      },
    ];

    if (mc) {
      sections.push({
        heading: `Outputs — Monte Carlo Result (${mc.shots.toLocaleString()} shots)`,
        cards: [
          { label: 'Success with QEC', value: (mc.fidelityQEC * 100).toFixed(3) + '%', tone: 'good' },
          { label: 'Success bare', value: (mc.fidelityBefore * 100).toFixed(3) + '%', tone: 'bad' },
          { label: 'Improvement', value: mc.improvement > 1000 ? '∞ (near-perfect)' : mc.improvement.toFixed(2) + '×' },
          { label: 'Wall time', value: `${mc.elapsedMs} ms (${((mc.shots / Math.max(mc.elapsedMs, 1)) * 1000).toFixed(0)} shots/s)` },
        ],
        kv: [
          ['Error rate with QEC', (mc.errorRateQEC * 100).toFixed(4) + '%'],
          ['Error rate bare', (mc.errorRateBefore * 100).toFixed(4) + '%'],
          ['Detection / correction rate', `${(mc.detectionRate * 100).toFixed(1)}% / ${(mc.correctionRate * 100).toFixed(1)}%`],
        ],
      });
    }

    if (sweep) {
      sections.push({
        heading: 'Outputs — Fidelity vs Noise Sweep',
        table: {
          headers: ['p', 'Fidelity with QEC', 'Fidelity bare', 'Error rate QEC', 'Error rate bare', 'Improvement'],
          rows: sweep.map((s) => [
            s.p.toFixed(3),
            (s.fidelityQEC * 100).toFixed(2) + '%',
            (s.fidelityBefore * 100).toFixed(2) + '%',
            (s.errorRateQEC * 100).toFixed(2) + '%',
            (s.errorRateBefore * 100).toFixed(2) + '%',
            s.improvement > 1000 ? '∞' : s.improvement.toFixed(2) + '×',
          ]),
        },
        note: 'QEC outperforms the bare qubit below the code’s pseudo-threshold; the crossover marks the pseudo-threshold of this code/noise pair.',
      });
    }

    sections.push({
      heading: 'Methodology',
      text: `Monte Carlo estimates are computed shot-by-shot with a seeded PRNG: every shot independently samples the selected noise channel (bit-flip X, phase-flip Z or depolarizing — the three channels of all_with_noise_prob.py), runs the full encode → syndrome → correct → decode pipeline, and scores the logical fidelity against the identical noise applied to an unprotected qubit. All computation ran client-side in the browser. Team: ${TEAM_NAMES.join(', ')} — Amrita Vishwa Vidyapeetham.`,
    });

    openPrintableReport({ title: 'QEC Performance Analysis', runKind: 'Performance Lab · Monte Carlo & Sweeps' }, sections);
  };

  return (
    <div className="flex flex-col gap-6">
      <HowToCard
        steps={[
          { title: 'Choose code + noise + shots', body: 'Set up your experiment in the bar below. Every option has a ? button with a plain-language explanation. More shots = smoother statistics.' },
          { title: 'Monte Carlo = instant before/after', body: 'Press “Monte Carlo” to run thousands of full experiments and compare QEC vs no protection at your chosen noise level.' },
          { title: 'Sweep p = the full picture', body: '“Sweep p” repeats the experiment across all noise levels from 1% to 50% and draws where the code wins and where it breaks down.' },
          { title: 'Export what you see', body: 'Report (print-ready PDF), JSON and CSV buttons carry your full inputs + outputs — ready for your project documentation.' },
        ]}
        tip="The improvement factor answers the project's core question: how much does error correction actually help — and where does it stop helping?"
      />
      {/* config bar */}
      <Card className="border-violet-500/20 bg-[#141126]">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto] md:items-end">
          <GuideField label="QEC Code" info={CODE_INFO}>
            <Select value={codeId} onValueChange={switchCode}>
              <SelectTrigger className="w-full border-violet-500/30 bg-[#1c1836]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {CODE_REGISTRY.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.short} · [[{c.n},{c.k},{c.d}]]</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GuideField>
          <GuideField label="Noise Model" info={NOISE_INFO}>
            <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
              <SelectTrigger className="w-full border-violet-500/30 bg-[#1c1836]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {compat.map((id) => <SelectItem key={id} value={id}>{NOISE_LABELS[id]}</SelectItem>)}
              </SelectContent>
            </Select>
          </GuideField>
          <GuideField
            label="Noise p"
            info={{ what: 'The per-shot probability that each qubit is hit by the selected noise. This is the x-axis of every sweep.', how: 'Drag to the operating point you care about; “Sweep p” will scan the whole range automatically.', example: 'p = 0.10 is the Phase-1 example for the 3-qubit bit-flip code.' }}
            right={<span className="font-mono text-violet-300">{p.toFixed(2)}</span>}
          >
            <Slider value={[Math.round(p * 100)]} min={1} max={45} step={1} onValueChange={(v) => setP(v[0] / 100)} />
          </GuideField>
          <GuideField label="Shots" info={SHOTS_INFO}>
            <Input
              type="number"
              value={shots}
              min={200}
              max={25000}
              step={100}
              onChange={(e) => setShots(Math.max(200, Math.min(25000, parseInt(e.target.value) || 1000)))}
              className="h-9 border-violet-500/30 bg-[#1c1836]"
            />
          </GuideField>
          <div className="flex gap-2">
            <Button onClick={runMC} disabled={running} className="bg-violet-600 hover:bg-violet-500">
              <Play className="mr-1 h-4 w-4" /> Monte Carlo
            </Button>
            <Button onClick={runSweep} disabled={running} variant="outline" className="border-cyan-500/40 text-cyan-300">
              <TrendingUp className="mr-1 h-4 w-4" /> Sweep p
            </Button>
            <Button onClick={exportReport} disabled={!mc && !sweep} variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">
              <FileText className="mr-1 h-4 w-4" /> Report
            </Button>
            <Button onClick={exportJSON} disabled={!mc && !sweep} variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10">
              <Braces className="mr-1 h-4 w-4" /> JSON
            </Button>
          </div>
        </CardContent>
        {running && (
          <CardContent className="pt-0">
            <Progress value={sweep ? sweepProgress : progress} className="h-2" />
            <p className="mt-1 text-xs text-slate-500">
              {sweep ? 'Sweeping noise probability…' : `Simulating quantum trajectories… ${Math.round(progress)}%`}
            </p>
          </CardContent>
        )}
      </Card>

      {/* results with explanation tabs */}
      {(mc || sweep) && (
        <ResultTabs
          results={
            <>
      {mc && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <Card className="border-violet-500/20 bg-[#141126]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
                <BarChart3 className="h-4 w-4 text-violet-300" /> Before vs After QEC — {mc.shots} shots
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[
                  { name: 'Fidelity / Success', 'With QEC': mc.fidelityQEC * 100, 'Bare qubit': mc.fidelityBefore * 100 },
                  { name: 'Error rate', 'With QEC': mc.errorRateQEC * 100, 'Bare qubit': mc.errorRateBefore * 100 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2750" />
                  <XAxis dataKey="name" tick={{ fill: '#8b85ad', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8b85ad', fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: '#181430', border: '1px solid #4c4470', borderRadius: 8, color: '#e2e8f0' }}
                    formatter={(v: number) => `${v.toFixed(2)}%`}
                  />
                  <Legend wrapperStyle={{ color: '#8b85ad' }} />
                  <Bar dataKey="With QEC" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Bare qubit" fill="#f472b6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-violet-500/20 bg-[#141126]">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Statistical Summary</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-violet-500/15">
                    <TableHead className="text-slate-400">Metric</TableHead>
                    <TableHead className="text-right text-slate-400">With QEC</TableHead>
                    <TableHead className="text-right text-slate-400">Bare qubit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="border-violet-500/10">
                    <TableCell className="text-slate-300">Success fidelity</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">{(mc.fidelityQEC * 100).toFixed(3)}%</TableCell>
                    <TableCell className="text-right font-mono text-rose-300">{(mc.fidelityBefore * 100).toFixed(3)}%</TableCell>
                  </TableRow>
                  <TableRow className="border-violet-500/10">
                    <TableCell className="text-slate-300">Error rate</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">{(mc.errorRateQEC * 100).toFixed(3)}%</TableCell>
                    <TableCell className="text-right font-mono text-rose-300">{(mc.errorRateBefore * 100).toFixed(3)}%</TableCell>
                  </TableRow>
                  <TableRow className="border-violet-500/10">
                    <TableCell className="text-slate-300">Improvement factor</TableCell>
                    <TableCell className="text-right font-mono text-cyan-300" colSpan={2}>
                      {mc.improvement > 1000 ? '∞ (near-perfect)' : `${mc.improvement.toFixed(2)}× fewer errors`}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-violet-500/10">
                    <TableCell className="text-slate-300">Syndrome detection / correction rate</TableCell>
                    <TableCell className="text-right font-mono text-slate-300" colSpan={2}>
                      {(mc.detectionRate * 100).toFixed(1)}% / {(mc.correctionRate * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-violet-500/10">
                    <TableCell className="text-slate-300 flex items-center gap-1"><Timer className="h-3 w-3" /> Wall time</TableCell>
                    <TableCell className="text-right font-mono text-slate-300" colSpan={2}>{mc.elapsedMs} ms ({(mc.shots / Math.max(mc.elapsedMs, 1) * 1000).toFixed(0)} shots/s)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="border-violet-500/40 text-violet-300">{codeMeta.short}</Badge>
                <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">{NOISE_LABELS[noise]}</Badge>
                <Badge variant="outline" className="border-slate-500/40 text-slate-400">p = {p.toFixed(2)}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* sweep chart */}
      {sweep && (
        <Card className="border-cyan-500/20 bg-[#141126]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-slate-200">
              <span>Fidelity vs Noise Strength — {codeMeta.short}, {NOISE_LABELS[noise]}</span>
              <Button size="sm" variant="ghost" className="text-cyan-400" onClick={exportCSV}><Download className="mr-1 h-3.5 w-3.5" /> CSV</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={sweep}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2750" />
                <XAxis dataKey="p" tick={{ fill: '#8b85ad', fontSize: 11 }} tickFormatter={(v) => (v * 100).toFixed(0) + '%'} />
                <YAxis tick={{ fill: '#8b85ad', fontSize: 11 }} domain={[0, 1.02]} tickFormatter={(v) => (v * 100).toFixed(0) + '%'} />
                <Tooltip
                  contentStyle={{ background: '#181430', border: '1px solid #4c4470', borderRadius: 8 }}
                  formatter={(v: number) => `${(v * 100).toFixed(2)}%`}
                  labelFormatter={(l) => `p = ${(l * 100).toFixed(1)}%`}
                />
                <Legend wrapperStyle={{ color: '#8b85ad' }} />
                <Line type="monotone" dataKey="fidelityQEC" name="With QEC" stroke="#8b5cf6" strokeWidth={2.4} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="fidelityBefore" name="Bare qubit" stroke="#f472b6" strokeWidth={2.4} dot={{ r: 3 }} strokeDasharray="6 3" />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 text-center text-xs text-slate-500">
              The violet curve stays above the pink bare-qubit curve while p is below the code&apos;s pseudo-threshold —
              the region where error correction genuinely helps. 800 shots per point, input |ψ⟩ at θ=60°, φ=36°.
            </p>
          </CardContent>
        </Card>
      )}
            </>
          }
          how={
            <div className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-slate-400">
                What the engine just did — step by step, with your actual configuration ({codeMeta.short} · {NOISE_LABELS[noise]}):
              </p>
              <StepList
                steps={[
                  ...(mc
                    ? [{
                        title: `Monte Carlo — ${mc.shots.toLocaleString()} independent shots`,
                        body: (
                          <>
                            Every shot independently sampled the {NOISE_LABELS[noise]} channel
                            (p = {p.toFixed(2)} per qubit), ran the full encode → syndrome → correct → decode pipeline
                            and scored the logical fidelity. The bare-qubit baseline received the identical noise on one unprotected
                            qubit. Averaging over all shots produced the statistics in the Results tab.
                          </>
                        ),
                      }]
                    : []),
                  ...(sweep
                    ? [{
                        title: 'Fidelity sweep — 13 noise levels × 800 shots each',
                        body: (
                          <>
                            A mini Monte Carlo ran at every noise level from 1% to 50%.
                            The curve shows exactly where the code helps and where it breaks down — the crossing with the
                            bare-qubit line is this code&apos;s pseudo-threshold.
                          </>
                        ),
                      }]
                    : []),
                  {
                    title: 'All of it ran in your browser',
                    body: mc
                      ? `Wall time ${mc.elapsedMs} ms (${((mc.shots / Math.max(mc.elapsedMs, 1)) * 1000).toFixed(0)} shots/s) — no server, no quantum SDK, just the verified TypeScript engine with a seeded PRNG for reproducibility.`
                      : 'The entire sweep ran client-side — no server, no quantum SDK, just the verified TypeScript engine with a seeded PRNG for reproducibility.',
                  },
                ]}
              />
            </div>
          }
          meaning={
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {mc && (
                  <>
                    <MeaningCard tone="info" title="Improvement factor — how to read it">
                      <p>The improvement factor is (bare error rate) ÷ (QEC error rate). “3×” means three times fewer logical failures. At low noise with a matched code the factor explodes toward “near-perfect” — the rare failures are the ones where several errors conspired inside one block.</p>
                      <p className="mt-2">Your run: <span className="font-mono text-cyan-300">{mc.improvement > 1000 ? '∞ (near-perfect)' : `${mc.improvement.toFixed(2)}×`}</span> at p = {p.toFixed(2)}.</p>
                    </MeaningCard>
                    <MeaningCard tone={mc.fidelityQEC > mc.fidelityBefore ? 'good' : 'warn'} title={mc.fidelityQEC > mc.fidelityBefore ? 'QEC is winning at this noise level' : 'Noise too strong — QEC is losing here'}>
                      {mc.fidelityQEC > mc.fidelityBefore
                        ? `Over ${mc.shots.toLocaleString()} shots the encoded block succeeded ${(mc.fidelityQEC * 100).toFixed(2)}% of the time vs ${(mc.fidelityBefore * 100).toFixed(2)}% bare — error correction is doing real work at this operating point.`
                        : `At this operating point the code fails more often than the bare qubit (${(mc.fidelityQEC * 100).toFixed(2)}% vs ${(mc.fidelityBefore * 100).toFixed(2)}%). You are beyond this code's pseudo-threshold — lower the noise.`}
                    </MeaningCard>
                  </>
                )}
                {sweep && (
                  <MeaningCard tone="info" title="Pseudo-threshold — where the curves cross">
                    <p>The violet (QEC) and pink (bare) curves cross at this code&apos;s pseudo-threshold. Left of the crossing, redundancy pays off; right of it, the extra qubits simply add more things that can break. Both curves fall toward 0/100% at their own rates — the QEC curve falls much faster.</p>
                  </MeaningCard>
                )}
                <MeaningCard tone="good" title="Why statistics instead of a single shot">
                  One shot is a coin flip — it cannot tell you whether a code works. Monte Carlo averaging over thousands of shots turns quantum randomness into engineering data, with uncertainty shrinking like 1/√shots. That is why the Shots input matters: 200 for a peek, 25,000 for publication-smooth curves.
                </MeaningCard>
              </div>
              <TryBox>
                Run “Sweep p” on the 3-qubit bit-flip code under bit-flip noise and find the crossing point (hint: near 20–25%). Then switch the noise to Depolarizing and repeat — unmatched pairings break down earlier. Compare the 3-Qubit Phase-Flip code under phase-flip noise: the matched pairing pushes the crossover higher.
              </TryBox>
            </>
          }
        />
      )}

      {!mc && !sweep && !running && (
        <Card className="border-dashed border-cyan-500/30 bg-[#100d1e]">
          <CardContent className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
            <TrendingUp className="h-10 w-10 text-cyan-500/60" />
            <p className="max-w-md text-sm text-slate-400">
              Press <span className="text-violet-300">Monte Carlo</span> for a before/after comparison at the chosen noise
              level, or <span className="text-cyan-300">Sweep p</span> to trace performance across the full noise range.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
