'use client';

/**
 * Performance Lab: Monte Carlo before/after comparison + noise sweeps.
 * State-vector codes: fidelity-based comparison. Surface codes: logical error
 * rate vs p for d=3/5/7 with the celebrated threshold crossing.
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
import { Play, Download, BarChart3, TrendingUp, Timer, FileText, Braces, Trophy, Swords } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Cell,
} from 'recharts';
import { getSVCode } from '@/lib/qec/codes';
import { NoiseModelId, NoiseParams, noiseParams } from '@/lib/qec/noise';
import {
  mcRun, mcRunStreaming, PartialMC, SweepPoint, SurfaceSweepPoint, sweepSurface, sweepSV,
} from '@/lib/qec/pipeline';
import { CODE_REGISTRY, getCodeMeta } from '@/lib/qec/registry';
import { SurfaceNoise } from '@/lib/qec/surface';
import { downloadJSON, openPrintableReport, runId, nowStamp, TEAM_NAMES } from '@/lib/report';
import { GuideField, HowToCard, ResultTabs, StepList, MeaningCard, TryBox, GuideInfo } from './Guide';

const NOISE_LABELS: Record<string, string> = {
  bitflip: 'Bit-Flip (X)',
  phaseflip: 'Phase-Flip (Z)',
  depolarizing: 'Depolarizing',
  'amplitude-damping': 'Amplitude Damping',
  'phase-damping': 'Phase Damping',
  'thermal-relaxation': 'Thermal Relaxation',
  'coherent-rotation': 'Coherent Rotation',
  crosstalk: 'Crosstalk',
};

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
  what: 'Which quantum error correction code to evaluate. Every code here protects 1 logical qubit with several physical qubits ([[n,k,d]]: n physical qubits, k logical qubits, distance d).',
  how: 'Pick any code — the stats are computed live. State-vector codes give fidelity statistics; surface codes give logical error rates and the famous threshold behaviour.',
  example: '3-Qubit Bit-Flip [[3,1,3]] at 10% bit-flip noise improves the success rate massively over the bare qubit.',
};

const NOISE_INFO: GuideInfo = {
  what: 'The physical disturbance applied during every shot. Real hardware suffers value flips (X), phase flips (Z), energy loss (amplitude damping), mixed errors (depolarizing) and more — 8 channels are implemented.',
  how: 'Choose one; only models compatible with the selected code are listed. Bit-Flip (X) is the easiest to reason about.',
  example: 'Depolarizing at 10% picks X, Y or Z uniformly when a qubit is hit — the standard benchmark channel.',
};

const SHOTS_INFO: GuideInfo = {
  what: 'One “shot” = one complete experiment: sample noise → encode → detect → correct → decode → score. Monte Carlo repeats it many times and reports the average — that is what turns quantum randomness into reliable statistics.',
  how: '200–2,000 for quick checks; 10,000+ for smooth, report-ready numbers. Limits: 25,000 (state-vector codes) / 100,000 (surface codes) — everything still runs in your browser, with live results converging while it runs.',
  example: '10,000 shots at p = 10% → error rates accurate to roughly ±0.3%.',
};

interface ShowdownRow {
  id: string;
  short: string;
  engine: 'statevector' | 'surface';
  errQEC: number;
  errBare: number;
  improvement: number;
}

export default function PerformanceLab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [codeId, setCodeId] = useState('code-3bitflip');
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.1);
  const [shots, setShots] = useState(2000);
  const [rotDeg, setRotDeg] = useState(10);
  const [t1, setT1] = useState(5);
  const [t2, setT2] = useState(5);
  const [running, setRunning] = useState(false);
  const [mc, setMc] = useState<MCStats | null>(null);
  const [live, setLive] = useState<PartialMC | null>(null);
  const [liveSurf, setLiveSurf] = useState<{ done: number; failures: number; total: number } | null>(null);
  const [sweep, setSweep] = useState<SweepPoint[] | null>(null);
  const [surfaceSweeps, setSurfaceSweeps] = useState<SurfaceSweepPoint[] | null>(null);
  const [sweepProgress, setSweepProgress] = useState(0);
  const [showdown, setShowdown] = useState<ShowdownRow[] | null>(null);
  const [showdownProgress, setShowdownProgress] = useState(0);
  const runToken = useRef(0);

  const codeMeta = getCodeMeta(codeId);
  const isSurface = codeMeta.engine === 'surface';
  const compat = codeMeta.compat;

  const switchCode = (id: string) => {
    setCodeId(id);
    const meta = getCodeMeta(id);
    if (!meta.compat.includes(noise)) setNoise(meta.compat[0]);
  };

  const runMC = useCallback(async () => {
    const token = ++runToken.current;
    setRunning(true);
    setMc(null);
    setLive(null);
    setLiveSurf(null);
    await new Promise((r) => setTimeout(r, 30));
    if (isSurface) {
      // surface code: logical error rate vs bare physical error rate — streamed live
      const t0 = performance.now();
      const { surfaceMonteCarlo } = await import('@/lib/qec/surface');
      const { makeRng } = await import('@/lib/qec/engine');
      const d = codeMeta.d;
      let done = 0;
      let failures = 0;
      const chunk = 500;
      while (done < shots) {
        const n = Math.min(chunk, shots - done);
        const r = surfaceMonteCarlo(d, noise as SurfaceNoise, p, n, makeRng(1000 + done + token));
        failures += r.failures;
        done += n;
        if (token !== runToken.current) return;
        setLiveSurf({ done, failures, total: shots });
        await new Promise((res) => setTimeout(res, 0));
      }
      const pLogical = failures / shots;
      setMc({
        shots,
        fidelityQEC: 1 - pLogical,
        fidelityBefore: 1 - p,
        errorRateQEC: pLogical,
        errorRateBefore: p,
        improvement: pLogical > 0 ? p / pLogical : p > 0 ? Infinity : 1,
        detectionRate: 1,
        correctionRate: 1,
        elapsedMs: performance.now() - t0,
      });
    } else {
      const svCode = getSVCode(codeId);
      const params = noiseParams(p, noise, { rotDeg, T1: t1, T2: t2 });
      const r = await mcRunStreaming(svCode, noise, params, Math.PI / 3, Math.PI / 5, shots, 77, 0, (s) => {
        if (token !== runToken.current) return;
        setLive(s);
      });
      if (token !== runToken.current) return;
      setMc(r);
    }
    setLive(null);
    setLiveSurf(null);
    setRunning(false);
  }, [codeId, noise, p, shots, isSurface, codeMeta]);

  /* ------------- Code Showdown: all 9 codes, one noise level, ranked ------------- */
  const runShowdown = useCallback(async () => {
    const token = ++runToken.current;
    setRunning(true);
    setShowdown(null);
    setShowdownProgress(0);
    await new Promise((r) => setTimeout(r, 30));
    const rows: ShowdownRow[] = [];
    const params = noiseParams(p, noise, { rotDeg, T1: t1, T2: t2 });
    const perCode = 2500; // shots per code — enough for a clean ranking, still snappy
    for (let i = 0; i < CODE_REGISTRY.length; i++) {
      const c = CODE_REGISTRY[i];
      if (c.engine === 'surface') {
        const { surfaceMonteCarlo } = await import('@/lib/qec/surface');
        const { makeRng } = await import('@/lib/qec/engine');
        let done = 0;
        let failures = 0;
        while (done < perCode) {
          const n = Math.min(1250, perCode - done);
          const r = surfaceMonteCarlo(c.d, noise as SurfaceNoise, p, n, makeRng(7100 + i * 131 + done));
          failures += r.failures;
          done += n;
          if (token !== runToken.current) return;
          await new Promise((res) => setTimeout(res, 0));
        }
        const pLogical = failures / perCode;
        rows.push({ id: c.id, short: c.short, engine: 'surface', errQEC: pLogical, errBare: p, improvement: pLogical > 1e-9 ? p / pLogical : Infinity });
      } else {
        const sv = getSVCode(c.id);
        const r = mcRun(sv, noise, params, Math.PI / 3, Math.PI / 5, perCode, 9100 + i * 17, 0);
        rows.push({ id: c.id, short: c.short, engine: 'statevector', errQEC: r.errorRateQEC, errBare: r.errorRateBefore, improvement: r.improvement });
      }
      if (token !== runToken.current) return;
      setShowdown([...rows].sort((a, b) => b.improvement - a.improvement));
      setShowdownProgress(((i + 1) / CODE_REGISTRY.length) * 100);
      await new Promise((r) => setTimeout(r, 0));
    }
    setRunning(false);
  }, [noise, p, rotDeg, t1, t2]);

  const runSweep = useCallback(async () => {
    const token = ++runToken.current;
    setRunning(true);
    setSweepProgress(0);
    setSweep(null);
    setSurfaceSweeps(null);
    await new Promise((r) => setTimeout(r, 30));
    if (isSurface) {
      const pValues = Array.from({ length: 16 }, (_, i) => 0.01 + i * 0.019); // 1%..30%
      const all: SurfaceSweepPoint[] = [];
      const ds = [3, 5, 7];
      for (let di = 0; di < ds.length; di++) {
        const pts = sweepSurface(ds[di], noise as SurfaceNoise, 4000, 500, pValues);
        all.push(...pts);
        if (token !== runToken.current) return;
        setSweepProgress(((di + 1) / ds.length) * 100);
        await new Promise((r) => setTimeout(r, 0));
      }
      setSurfaceSweeps(all);
    } else {
      const svCode = getSVCode(codeId);
      const baseParams = noiseParams(p, noise, { rotDeg, T1: t1, T2: t2 });
      const pValues = Array.from({ length: 13 }, (_, i) => 0.01 + i * 0.039); // 1%..50%
      // For channels whose strength is NOT p: coherent rotation sweeps the angle (θ = p·π),
      // thermal relaxation sweeps T1 = T2 = 0.5 + 19.5·(1−p) gate times.
      const paramsFor =
        noise === 'coherent-rotation'
          ? (pv: number) => ({ ...baseParams, theta: pv * Math.PI })
          : noise === 'thermal-relaxation'
            ? (pv: number) => { const T = 0.5 + (1 - pv) * 19.5; return { ...baseParams, T1: T, T2: T }; }
            : undefined;
      const pts = sweepSV(svCode, noise, baseParams, Math.PI / 3, Math.PI / 5, 800, 300, pValues, paramsFor);
      if (token !== runToken.current) return;
      setSweep(pts);
    }
    setRunning(false);
  }, [codeId, noise, isSurface]);

  const exportCSV = () => {
    let csv = 'p,fidelityQEC,fidelityBare,errorRateQEC,errorRateBare\n';
    if (sweep) {
      csv = 'p,fidelityQEC,fidelityBare,errorRateQEC,errorRateBare\n' + sweep.map((s) =>
        `${s.p},${s.fidelityQEC},${s.fidelityBefore},${s.errorRateQEC},${s.errorRateBefore}`).join('\n');
    } else if (surfaceSweeps) {
      csv = 'd,p,pLogical\n' + surfaceSweeps.map((s) => `${s.d},${s.p},${s.pLogical}`).join('\n');
    } else return;
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
      inputs: {
        code: `${codeMeta.name} [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]]`,
        engine: codeMeta.engine,
        noiseModel: NOISE_LABELS[noise] ?? noise,
        operatingPointP: p,
        shots,
      },
      monteCarlo: mc ?? null,
      fidelitySweep: sweep ?? null,
      surfaceSweep: surfaceSweeps ?? null,
      codeShowdown: showdown
        ? { shotsPerCode: 2500, ranking: showdown.map((r) => ({ code: r.short, engine: r.engine, errorRateQEC: r.errQEC, errorRateBare: r.errBare, improvement: r.improvement })) }
        : null,
    });
  };

  const exportReport = () => {
    const sections: Parameters<typeof openPrintableReport>[1] = [
      {
        heading: 'Inputs (Experiment Configuration)',
        kv: [
          ['QEC code', `${codeMeta.name} — [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]]`],
          ['Engine', codeMeta.engine === 'surface' ? 'Pauli-frame stabilizer + MWPM decoder' : 'Full state-vector simulator'],
          ['Noise model', NOISE_LABELS[noise] ?? noise],
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

    if (surfaceSweeps) {
      sections.push({
        heading: 'Outputs — Surface-Code Threshold Sweep',
        table: {
          headers: ['d', 'p', 'Logical error rate', 'vs bare p'],
          rows: surfaceSweeps.map((s) => [
            s.d,
            s.p.toFixed(3),
            (s.pLogical * 100).toFixed(4) + '%',
            s.pLogical < s.p ? `${(s.p / Math.max(s.pLogical, 1e-9)).toFixed(1)}× better` : `${(s.pLogical / s.p).toFixed(2)}× worse`,
          ]),
        },
        note: 'Below the ~10% threshold, larger distances suppress the logical rate exponentially; above it the ordering flips — the celebrated surface-code threshold.',
      });
    }

    if (showdown) {
      sections.push({
        heading: `Outputs — Code Showdown (all ${showdown.length} codes at ${noise === 'coherent-rotation' ? `${rotDeg.toFixed(1)}° rotation` : `p = ${p.toFixed(2)}`})`,
        table: {
          headers: ['Rank', 'Code', 'Engine', 'Error rate with QEC', 'Bare error rate', 'Improvement'],
          rows: showdown.map((r, i) => [
            String(i + 1),
            r.short,
            r.engine === 'surface' ? 'Surface + MWPM' : 'State-vector',
            (r.errQEC * 100).toFixed(3) + '%',
            (r.errBare * 100).toFixed(3) + '%',
            r.improvement > 1000 ? '∞' : r.improvement.toFixed(2) + '×',
          ]),
        },
        note: 'Every code ran the same 2,500 shots under the identical noise channel and input state; ranking is by improvement factor (bare error rate ÷ QEC error rate).',
      });
    }

    sections.push({
      heading: 'Methodology',
      text: `Monte Carlo estimates are computed shot-by-shot with a seeded PRNG: every shot independently samples the noise channel, runs the full encode → syndrome → correct → decode pipeline, and scores the logical fidelity against the identical noise applied to an unprotected qubit. Surface-code sweeps use the code-capacity model with an exact minimum-weight perfect-matching decoder. All computation ran client-side in the browser. Team: ${TEAM_NAMES.join(', ')}.`,
    });

    openPrintableReport({ title: 'QEC Performance Analysis', runKind: 'Performance Lab · Monte Carlo & Sweeps' }, sections);
  };

  const surfaceChartData = surfaceSweeps
    ? [3, 5, 7].map((d) => ({
        d,
        points: surfaceSweeps.filter((s) => s.d === d).map((s) => ({ p: s.p, pLogical: Math.max(s.pLogical, 1e-5) })),
      }))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <HowToCard
        steps={[
          { title: 'Choose code + noise + shots', body: 'Set up your experiment in the bar below. Every option has a ? button with a plain-language explanation. More shots = smoother statistics.' },
          { title: 'Monte Carlo = live before/after', body: 'Press “Monte Carlo” and watch the two success numbers converge LIVE while thousands of full experiments run — then read the final statistics.' },
          { title: 'Sweep p = the full picture', body: '“Sweep p” repeats the experiment across all noise levels. For surface codes this draws the famous threshold chart where bigger codes win below ~10%.' },
          { title: 'Code Showdown = all codes ranked', body: 'One click races all 9 QEC codes under identical noise and ranks them by improvement factor — the big picture of which code protects best.' },
          { title: 'Export what you see', body: 'Report (print-ready PDF), JSON and CSV buttons carry your full inputs + outputs — ready for your project documentation.' },
        ]}
        tip="The improvement factor answers the project's core question: how much does error correction actually help — and where does it stop helping?"
      />
      {/* config bar */}
      <Card className="glass border-white/8">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto] md:items-end">
          <GuideField label="QEC Code" info={CODE_INFO}>
            <Select value={codeId} onValueChange={switchCode}>
              <SelectTrigger className="w-full border-violet-400/25 bg-white/[0.04]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {CODE_REGISTRY.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.short} · [[{c.n},{c.k},{c.d}]]</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GuideField>
          <GuideField label="Noise Model" info={NOISE_INFO}>
            <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
              <SelectTrigger className="w-full border-violet-400/25 bg-white/[0.04]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {compat.map((id) => <SelectItem key={id} value={id}>{NOISE_LABELS[id]}</SelectItem>)}
              </SelectContent>
            </Select>
          </GuideField>
          {noise !== 'thermal-relaxation' && noise !== 'coherent-rotation' && (
            <GuideField
              label={isSurface ? 'Physical error p' : 'Noise p'}
              info={{ what: 'The per-shot probability that each qubit is hit by the selected noise. This is the x-axis of every sweep.', how: 'Drag to the operating point you care about; “Sweep p” will scan the whole range automatically.', example: 'p = 0.10 is the Phase-1 example for the 3-qubit bit-flip code.' }}
              right={<span className="font-mono text-violet-300">{p.toFixed(2)}</span>}
            >
              <Slider value={[Math.round(p * 100)]} min={1} max={45} step={1} onValueChange={(v) => setP(v[0] / 100)} />
            </GuideField>
          )}
          {noise === 'coherent-rotation' && (
            <GuideField
              label="Error angle"
              info={{ what: 'A coherent error is a systematic over-rotation applied to every qubit, every shot. The sweep maps the x-axis to the angle θ = p·π.', how: 'Set the angle used by the Monte Carlo button; the sweep scans 1.8°–88° regardless.', example: '5° is typical of miscalibrated real gates.' }}
              hint="Miscalibrated gate = same tilt every shot."
              right={<span className="font-mono text-violet-300">{rotDeg.toFixed(1)}°</span>}
            >
              <Slider value={[rotDeg]} min={0} max={90} step={0.5} onValueChange={(v) => setRotDeg(v[0])} />
            </GuideField>
          )}
          {noise === 'thermal-relaxation' && (
            <GuideField
              label="T₁ / T₂ (gate times)"
              info={{ what: 'T1 = energy-loss time, T2 = dephasing time (capped at 2×T1). The sweep maps the x-axis to T1 = T2 = 0.5 + 19.5·(1−p).', how: 'Set the values used by the Monte Carlo button. Small T = harsh hardware.', example: 'T1 = 5 → ~18% amplitude damping per gate.' }}
              hint="Energy-loss & dephasing times."
              right={<span className="font-mono text-violet-300">{t1.toFixed(1)}/{t2.toFixed(1)}</span>}
            >
              <div className="flex flex-col gap-1.5">
                <Slider value={[Math.round(t1 * 4)]} min={2} max={80} step={1} onValueChange={(v) => { const nv = v[0] / 4; setT1(nv); if (t2 > 2 * nv) setT2(2 * nv); }} />
                <Slider value={[Math.round(t2 * 4)]} min={2} max={Math.round(2 * t1 * 4)} step={1} onValueChange={(v) => setT2(v[0] / 4)} />
              </div>
            </GuideField>
          )}
          <GuideField label="Shots" info={SHOTS_INFO}>
            <Input
              type="number"
              value={shots}
              min={200}
              max={isSurface ? 100000 : 25000}
              step={100}
              onChange={(e) => setShots(Math.max(200, Math.min(isSurface ? 100000 : 25000, parseInt(e.target.value) || 1000)))}
              className="h-9 min-w-[92px] border-violet-400/25 bg-white/[0.04]"
            />
          </GuideField>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runMC} disabled={running} className="bg-violet-600 hover:bg-violet-500">
              <Play className="mr-1 h-4 w-4" /> Monte Carlo
            </Button>
            <Button onClick={runSweep} disabled={running} variant="outline" className="border-cyan-500/40 text-cyan-300">
              <TrendingUp className="mr-1 h-4 w-4" /> Sweep p
            </Button>
            <Button onClick={runShowdown} disabled={running} variant="outline" className="border-amber-400/40 text-amber-300 hover:bg-amber-400/10">
              <Trophy className="mr-1 h-4 w-4" /> Code Showdown
            </Button>
            <Button onClick={exportReport} disabled={!mc && !sweep && !surfaceSweeps} variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">
              <FileText className="mr-1 h-4 w-4" /> Report
            </Button>
            <Button onClick={exportJSON} disabled={!mc && !sweep && !surfaceSweeps} variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10">
              <Braces className="mr-1 h-4 w-4" /> JSON
            </Button>
          </div>
        </CardContent>
        {running && (live || liveSurf) && (
          <CardContent className="pt-0">
            {live && (
              <div className="glass rounded-xl border-cyan-400/25 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium text-cyan-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 pulse-dot" aria-hidden />
                    Live — estimates converging ({live.done.toLocaleString()} / {live.total.toLocaleString()} shots)
                  </span>
                  <span className="font-mono text-xs text-slate-500">{Math.round((live.done / live.total) * 100)}%</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">With QEC (live)</div>
                    <div className="font-mono text-2xl font-semibold text-emerald-300">{(live.fidelityQEC * 100).toFixed(2)}%</div>
                  </div>
                  <div className="rounded-lg border border-rose-400/30 bg-rose-400/[0.06] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Bare qubit (live)</div>
                    <div className="font-mono text-2xl font-semibold text-rose-300">{(live.fidelityBefore * 100).toFixed(2)}%</div>
                  </div>
                </div>
                <Progress value={(live.done / live.total) * 100} className="mt-3 h-1.5" />
              </div>
            )}
            {liveSurf && (
              <div className="glass rounded-xl border-cyan-400/25 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium text-cyan-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 pulse-dot" aria-hidden />
                    Live — logical failures counting up ({liveSurf.done.toLocaleString()} / {liveSurf.total.toLocaleString()} shots)
                  </span>
                  <span className="font-mono text-xs text-slate-500">{Math.round((liveSurf.done / liveSurf.total) * 100)}%</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Logical failures</div>
                    <div className="font-mono text-2xl font-semibold text-amber-300">{liveSurf.failures.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Logical error rate (live)</div>
                    <div className="font-mono text-2xl font-semibold text-emerald-300">{((liveSurf.failures / Math.max(liveSurf.done, 1)) * 100).toFixed(2)}%</div>
                  </div>
                  <div className="rounded-lg border border-rose-400/30 bg-rose-400/[0.06] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Bare physical p</div>
                    <div className="font-mono text-2xl font-semibold text-rose-300">{(p * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <Progress value={(liveSurf.done / liveSurf.total) * 100} className="mt-3 h-1.5" />
              </div>
            )}
          </CardContent>
        )}
        {running && !live && !liveSurf && (
          <CardContent className="pt-0">
            <Progress value={sweep || surfaceSweeps ? sweepProgress : showdownProgress} className="h-2" />
            <p className="mt-1 text-xs text-slate-500">
              {sweep || surfaceSweeps ? 'Sweeping noise probability…' : showdown !== null || showdownProgress > 0 ? 'Running the Code Showdown across all 9 codes…' : 'Simulating…'}
            </p>
          </CardContent>
        )}
      </Card>

      {/* results with explanation tabs */}
      {(mc || sweep || surfaceSweeps) && (
        <ResultTabs
          results={
            <>
      {mc && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <Card className="glass border-white/8">
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
              {isSurface && <p className="mt-2 text-center text-[11px] text-slate-500">Surface code metric: logical error rate (success = logical qubit preserved) vs physical error rate.</p>}
            </CardContent>
          </Card>

          <Card className="glass border-white/8">
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

      {/* sweep charts */}
      {sweep && (
        <Card className="glass border-white/8">
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
              the region where error correction genuinely helps. Average over {sweep[0]?.p ? '' : ''}800 shots per point, input |ψ⟩ at θ=60°, φ=36°.
            </p>
          </CardContent>
        </Card>
      )}

      {surfaceChartData && (
        <Card className="glass border-white/8">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-slate-200">
              <span>Surface-Code Threshold — Logical Error Rate vs Physical Error Rate</span>
              <Button size="sm" variant="ghost" className="text-cyan-400" onClick={exportCSV}><Download className="mr-1 h-3.5 w-3.5" /> CSV</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2750" />
                <XAxis dataKey="p" type="number" domain={[0, 0.3]} tick={{ fill: '#8b85ad', fontSize: 11 }} tickFormatter={(v) => (v * 100).toFixed(0) + '%'} />
                <YAxis tick={{ fill: '#8b85ad', fontSize: 11 }} domain={[1e-5, 1]} scale="log" tickFormatter={(v) => (v >= 0.01 ? (v * 100).toFixed(0) + '%' : v.toExponential(0))} />
                <Tooltip
                  contentStyle={{ background: '#181430', border: '1px solid #4c4470', borderRadius: 8 }}
                  formatter={(v: number) => `${(v * 100).toFixed(3)}%`}
                  labelFormatter={(l) => `p = ${((l as number) * 100).toFixed(1)}%`}
                />
                <Legend wrapperStyle={{ color: '#8b85ad' }} />
                <ReferenceLine x={p} stroke="#facc15" strokeDasharray="4 4" label={{ value: 'operating p', fill: '#facc15', fontSize: 10 }} />
                {surfaceChartData.map((series, i) => (
                  <Line key={series.d} data={series.points} dataKey="pLogical" name={`d=${series.d}`}
                    stroke={['#8b5cf6', '#22d3ee', '#34d399'][i]} strokeWidth={2.2} dot={false} type="monotone" />
                ))}
                <Line data={surfaceChartData[0].points.map((pt) => ({ p: pt.p, pLogical: Math.max(pt.p, 1e-5) }))} dataKey="pLogical"
                  name="no QEC (y = p)" stroke="#64748b" strokeWidth={1.6} strokeDasharray="6 4" dot={false} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 text-center text-xs text-slate-500">
              Below ~10% noise, larger codes win: the d=7 curve sits orders of magnitude below d=3 (exponential suppression).
              Above threshold the ordering flips — this crossover IS the surface-code threshold, the phenomenon our
              literature review (refs 3, 7) builds on. 4000 shots per point, MWPM decoder, code-capacity model.
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
                            ({noise === 'coherent-rotation' ? `rotation angle ${rotDeg.toFixed(1)}°`
                              : noise === 'thermal-relaxation' ? `T1 = ${t1.toFixed(1)}, T2 = ${t2.toFixed(1)} gate times`
                                : `p = ${p.toFixed(2)} per qubit`}), ran the full encode → syndrome → correct → decode pipeline
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
                            A mini Monte Carlo ran at every noise level from 1% to 50%
                            {noise === 'coherent-rotation' ? ' — for coherent rotation each level maps to an error angle θ = p·π (1.8°…88°).'
                              : noise === 'thermal-relaxation' ? ' — for thermal relaxation each level maps to T1 = T2 = 0.5 + 19.5·(1−p) gate times.'
                                : ''}. The curve shows exactly where the code helps and where it breaks down.
                          </>
                        ),
                      }]
                    : []),
                  ...(surfaceSweeps
                    ? [{
                        title: 'Threshold sweep — d = 3/5/7 × 16 noise levels × 4,000 shots',
                        body: 'For each distance and each p from 1% to 30%, thousands of fresh shots ran the full stabilizer cycle with the exact MWPM decoder. The fraction of shots ending in logical failure is the logical error rate — plotted on a log scale so the exponential separation is visible.',
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
                      <p>The improvement factor is (bare error rate) ÷ (QEC error rate). “3×” means three times fewer logical failures. At low noise with a good code the factor explodes toward “near-perfect” — the rare failures are the ones where several errors conspired inside one block.</p>
                      <p className="mt-2">Your run: <span className="font-mono text-cyan-300">{mc.improvement > 1000 ? '∞ (near-perfect)' : `${mc.improvement.toFixed(2)}×`}</span> at {noise === 'coherent-rotation' ? `${rotDeg.toFixed(1)}°` : `p = ${p.toFixed(2)}`}.</p>
                    </MeaningCard>
                    <MeaningCard tone={mc.fidelityQEC > mc.fidelityBefore ? 'good' : 'warn'} title={mc.fidelityQEC > mc.fidelityBefore ? 'QEC is winning at this noise level' : 'Noise too strong — QEC is losing here'}>
                      {mc.fidelityQEC > mc.fidelityBefore
                        ? `Over ${mc.shots.toLocaleString()} shots the encoded block succeeded ${(mc.fidelityQEC * 100).toFixed(2)}% of the time vs ${(mc.fidelityBefore * 100).toFixed(2)}% bare — error correction is doing real work at this operating point.`
                        : `At this operating point the code fails more often than the bare qubit (${(mc.fidelityQEC * 100).toFixed(2)}% vs ${(mc.fidelityBefore * 100).toFixed(2)}%). You are beyond this code's pseudo-threshold — lower the noise or pick a stronger code.`}
                    </MeaningCard>
                  </>
                )}
                {sweep && (
                  <MeaningCard tone="info" title="Pseudo-threshold — where the curves cross">
                    <p>The violet (QEC) and pink (bare) curves cross at this code&apos;s pseudo-threshold. Left of the crossing, redundancy pays off; right of it, the extra qubits simply add more things that can break. Both curves fall toward 0/100% at their own rates — the QEC curve falls much faster.</p>
                  </MeaningCard>
                )}
                {surfaceSweeps && (
                  <MeaningCard tone="info" title="The threshold — QEC's most famous number">
                    <p>Below ~10% physical noise the d = 7 curve lies orders of magnitude below d = 3 — exponential suppression, the entire promise of fault tolerance. Above ~10% the ordering flips and bigger codes get worse. That crossover is THE surface-code threshold reproduced live by your browser.</p>
                  </MeaningCard>
                )}
                <MeaningCard tone="good" title="Why statistics instead of a single shot">
                  One shot is a coin flip — it cannot tell you whether a code works. Monte Carlo averaging over thousands of shots turns quantum randomness into engineering data, with uncertainty shrinking like 1/√shots. That is why the Shots input matters: 200 for a peek, 25,000 for publication-smooth curves.
                </MeaningCard>
              </div>
              <TryBox>
                Run “Sweep p” on the 3-qubit bit-flip code and find the crossing point (hint: near 20–25%). Then switch to Steane [[7,1,3]] and repeat — stronger codes push the crossover higher. With a surface code selected, watch d = 3/5/7 reorder around ~10% — then export the CSV and plot it yourself.
              </TryBox>
            </>
          }
        />
      )}

      {/* code showdown — all codes ranked */}
      {showdown && showdown.length > 0 && (
        <div className="rise-in">
          <ResultTabs
            results={
              <Card className="glass border-amber-400/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
                    <Swords className="h-4 w-4 text-amber-300" />
                    Code Showdown — all {showdown.length} codes at {noise === 'coherent-rotation' ? `${rotDeg.toFixed(1)}° rotation` : `p = ${p.toFixed(2)}`} ({NOISE_LABELS[noise]})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={showdown.map((r, i) => ({
                        name: r.short,
                        improvement: Math.min(r.improvement, 1000),
                        label: r.improvement > 1000 ? '∞' : r.improvement.toFixed(2) + '×',
                        rank: i + 1,
                        fill: r.engine === 'surface' ? '#22d3ee' : i === 0 ? '#fbbf24' : '#8b5cf6',
                      }))} layout="vertical" margin={{ left: 8, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2c2750" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#8b85ad', fontSize: 11 }} tickFormatter={(v) => v + '×'} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#a5a0c4', fontSize: 10.5 }} />
                        <Tooltip
                          contentStyle={{ background: '#141126', border: '1px solid #4c4470', borderRadius: 8 }}
                          formatter={(v: number, _n: unknown, p: { payload?: { label?: string } }) => [p?.payload?.label ?? `${v}×`, 'improvement']}
                        />
                        <Bar dataKey="improvement" radius={[0, 5, 5, 0]}>
                          {showdown.map((r, i) => (
                            <Cell key={i} fill={r.engine === 'surface' ? '#22d3ee' : i === 0 ? '#fbbf24' : '#8b5cf6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-slate-400">Rank</TableHead>
                          <TableHead className="text-slate-400">Code</TableHead>
                          <TableHead className="text-slate-400">Engine</TableHead>
                          <TableHead className="text-right text-slate-400">Error rate with QEC</TableHead>
                          <TableHead className="text-right text-slate-400">Bare</TableHead>
                          <TableHead className="text-right text-slate-400">Improvement</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {showdown.map((r, i) => (
                          <TableRow key={r.id} className="border-white/5">
                            <TableCell>
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                                i === 0 ? 'bg-amber-400/20 text-amber-300' : i === 1 ? 'bg-slate-400/15 text-slate-300' : i === 2 ? 'bg-orange-500/15 text-orange-300' : 'text-slate-500'
                              }`}>{i + 1}</span>
                            </TableCell>
                            <TableCell className="text-slate-200">{r.short}</TableCell>
                            <TableCell className="text-xs text-slate-500">{r.engine === 'surface' ? 'Surface + MWPM' : 'State-vector'}</TableCell>
                            <TableCell className="text-right font-mono text-emerald-400">{(r.errQEC * 100).toFixed(3)}%</TableCell>
                            <TableCell className="text-right font-mono text-rose-300">{(r.errBare * 100).toFixed(3)}%</TableCell>
                            <TableCell className="text-right font-mono text-cyan-300">{r.improvement > 1000 ? '∞ (near-perfect)' : r.improvement.toFixed(2) + '×'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="mt-3 text-center text-xs text-slate-500">
                    Every code ran the same 2,500 shots under the identical noise channel and input state |ψ⟩ at θ=60°, φ=36°.
                    Gold = best protection at this noise level · cyan = surface codes (logical-error metric).
                  </p>
                </CardContent>
              </Card>
            }
            how={
              <div className="flex flex-col gap-4">
                <p className="text-xs leading-relaxed text-slate-400">
                  The showdown is a fair race: all {showdown.length} codes received the same {NOISE_LABELS[noise]} channel at the same
                  strength, the same input state, and 2,500 fresh shots each — then the engine ranked them by improvement factor.
                </p>
                <StepList
                  steps={[
                    { title: 'Same noise, same state, same shot count', body: 'Identical conditions for every code — the only variable is the code itself, so the ranking is a fair comparison of protective power.' },
                    { title: 'State-vector codes', body: 'Each shot runs the full pipeline and scores the decoded fidelity; error rate = 1 − average fidelity. Codes that cannot fully reverse this noise type (e.g. amplitude damping) show residual error even after perfect syndrome decoding.' },
                    { title: 'Surface codes', body: 'Ranked by logical error rate from the MWPM decoder under the code-capacity model — the same metric used in the threshold sweep.' },
                    { title: 'Ranking', body: 'Improvement factor = bare error rate ÷ QEC error rate. Higher = better protection. ∞ appears when zero logical failures occurred in all 2,500 shots.' },
                  ]}
                />
              </div>
            }
            meaning={
              <div className="grid gap-3 md:grid-cols-2">
                <MeaningCard tone="info" title="How to read the ranking">
                  <p>The improvement factor compresses the whole story into one number: how many times fewer logical failures the code produced versus an unprotected qubit. The gold bar is the best buy at this exact noise level.</p>
                  <p className="mt-2">Notice the pattern: codes with more physical qubits (Shor-9, Steane-7, Surface d=5/7) generally rank higher — protection scales with redundancy, but so does the hardware cost (n qubits for 1 logical qubit).</p>
                </MeaningCard>
                <MeaningCard tone="warn" title="Why the ranking changes with noise">
                  At very low noise many codes look near-perfect (∞). Raise p towards each code&apos;s pseudo-threshold and the weaker codes collapse first — rerun the showdown at a higher p and watch the ordering reshuffle. That noise-dependence is exactly why hardware chooses its code carefully.
                </MeaningCard>
              </div>
            }
          />
        </div>
      )}

      {!mc && !sweep && !surfaceSweeps && !showdown && !running && (
        <Card className="glass border-dashed border-cyan-400/25">
          <CardContent className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
            <TrendingUp className="h-10 w-10 text-cyan-500/60" />
            <p className="max-w-md text-sm text-slate-400">
              Press <span className="text-violet-300">Monte Carlo</span> for a live before/after comparison, <span className="text-cyan-300">Sweep p</span> for the full noise range, or <span className="text-amber-300">Code Showdown</span> to rank all 9 codes head-to-head —
              for surface codes this reproduces the famous threshold chart.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
