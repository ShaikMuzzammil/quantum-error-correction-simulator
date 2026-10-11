'use client';

/**
 * Advanced live 3D/4D visualizers for the Quantum Lab (v6 — rebuilt):
 *
 *  - StateCityscape   : the encoded block drawn as a real 3-D city — one
 *    shaded tower per basis state, arranged on a proper city grid. Watch
 *    noise raise error towers and every correction cycle flatten the
 *    skyline back to the codespace. Supports up to 32 live towers
 *    (5-qubit codes) with full state-vector physics per round.
 *
 *  - SpacetimeLab     : 4-D surface-code error propagation — d×d space
 *    (d = 3…9) stacked over syndrome rounds of time, with a connected time
 *    axis, translucent floor panels, defect stars and MWPM matching chains
 *    drawn through spacetime. Orbit / zoom / play.
 *
 *  - ThresholdTerrain : large-scale Monte Carlo — thousands of complete
 *    surface-code experiments run live in your browser to measure the
 *    logical error rate for every (noise p, code distance d) pair, rendered
 *    as a 3-D terrain that grows while the data streams in. This is the
 *    famous surface-code threshold, measured in front of you.
 *
 * All three run genuine simulations using the same verified engine as the
 * rest of the app (no canned animation, no faked data).
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Play, RotateCcw, FileText, Braces, MousePointer2 } from 'lucide-react';
import { makeRng } from '@/lib/qec/engine';
import { getSVCode } from '@/lib/qec/codes';
import { NoiseModelId, applyNoiseLayer, noiseParams } from '@/lib/qec/noise';
import { prepareEncodedState, runLiveRound } from '@/lib/qec/pipeline';
import {
  SurfaceNoise, SurfaceLayout, MatchingGraph, SurfaceStab,
  getSurfaceLayout, buildMatchingGraph, matchDefects, stabCenter, runSurfaceShot,
} from '@/lib/qec/surface';
import {
  Cam, Vec3, useOrbitCam, proj, fitCanvas, stroke3D, dot3D, label3D,
  bar3D, quad3D, drawFloorGrid, arrow3D, star3D,
} from './three-d';
import { downloadJSON, openPrintableReport, runId, nowStamp, TEAM_NAMES } from '@/lib/report';

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function LabeledSlider({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="font-medium text-slate-400">{label}</span>
        <span className="font-mono text-violet-300">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-200';
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function OrbitHint() {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
      <MousePointer2 className="h-3 w-3" /> drag to orbit · wheel to zoom
    </span>
  );
}

function ExportButtons({ onReport, onJSON }: { onReport: () => void; onJSON: () => void }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10" onClick={onReport}>
        <FileText className="mr-1 h-3.5 w-3.5" /> Report
      </Button>
      <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10" onClick={onJSON}>
        <Braces className="mr-1 h-3.5 w-3.5" /> JSON
      </Button>
    </div>
  );
}

/** Map a complex phase (radians) to a hex color on the app's cyan→violet→pink arc. */
function phaseHex(re: number, im: number): string {
  const frac = (((Math.atan2(im, re) / (2 * Math.PI)) + 1) % 1); // 0..1
  const hue = 185 + frac * 140; // cyan(185) → violet(255) → pink(325)
  return hslToHex(hue, 78, 62);
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Smooth emerald→amber→rose ramp for logical error rates. */
function rateHex(rate: number): string {
  const t = Math.max(0, Math.min(1, rate / 0.22));
  if (t < 0.5) return lerpHex('#10b981', '#f59e0b', t * 2);
  return lerpHex('#f59e0b', '#f43f5e', (t - 0.5) * 2);
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/* ==================================================================== */
/* State Cityscape v6 — a real 3-D city of amplitudes                   */
/* ==================================================================== */

interface CityHistoryRow {
  round: number;
  events: string[];
  detected: boolean;
  corrected: boolean;
  dominant: string;
  dominantProb: number;
}

const CITY_CODES = ['code-3bitflip', 'code-3phaseflip', 'code-rep5', 'code-5qubit'];

export function StateCityscape() {
  const [orbit, setOrbit] = useState(true);
  const [codeId, setCodeId] = useState('code-3bitflip');
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.12);
  const [rounds, setRounds] = useState(24);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [qecOn, setQecOn] = useState(true);
  const [hud, setHud] = useState({ round: 0, corrections: 0, detected: 0, dominant: '—', dominantProb: 0 });

  const rafRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const phaseRef = useRef<'idle' | 'playing' | 'done'>('idle');
  const { cam, canvasRef, setAuto, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useOrbitCam(
    { dist: 3.5, yaw: 0.66, pitch: 0.5, auto: true },
    () => wakeRef.current()
  );

  const svRef = useRef<ReturnType<typeof prepareEncodedState> | null>(null);
  const rngRef = useRef(makeRng(7));
  const dispRef = useRef<Float64Array>(new Float64Array(2 * 32)); // lerped [re,im]×2^n
  const tgtRef = useRef<Float64Array>(new Float64Array(2 * 32));
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const roundRef = useRef(0);
  const correctionsRef = useRef(0);
  const detectedRef = useRef(0);
  const historyRef = useRef<CityHistoryRow[]>([]);
  const cfgRef = useRef({ codeId, noise, p, rounds, qecOn });

  useEffect(() => {
    cfgRef.current = { codeId, noise, p, rounds, qecOn };
  }, [codeId, noise, p, rounds, qecOn]);
  const orbitRef = useRef(orbit);
  useEffect(() => { orbitRef.current = orbit; }, [orbit]);
  useEffect(() => {
    setAuto(orbitRef.current);
    wakeRef.current();
  }, [orbit]);
  const endDragKeep = () => {
    onPointerUp();
    onPointerLeave();
    setAuto(orbitRef.current);
    wakeRef.current();
  };

  const code = getSVCode(codeId);
  const nQ = code.n;
  const nStates = 2 ** nQ;
  const cols = nStates <= 8 ? 4 : 8;
  const rows = Math.ceil(nStates / cols);
  const isRepFamily = codeId === 'code-3bitflip' || codeId === 'code-3phaseflip' || codeId === 'code-rep5';

  const reset = () => {
    const c = cfgRef.current;
    const cdef = getSVCode(c.codeId);
    svRef.current = prepareEncodedState(cdef, Math.PI / 3, Math.PI / 5);
    rngRef.current = makeRng(7 + Math.floor(Math.random() * 1e6));
    dispRef.current.fill(0);
    roundRef.current = 0;
    correctionsRef.current = 0;
    detectedRef.current = 0;
    historyRef.current = [];
    phaseRef.current = 'idle';
    setPhase('idle');
    setHud({ round: 0, corrections: 0, detected: 0, dominant: '—', dominantProb: 0 });
    wakeRef.current();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate simulation reset on code change
    reset();
  }, [codeId]);

  /** ONE-SHOT RUN: reset, simulate exactly `rounds` rounds, then stop. */
  const runCity = () => {
    reset();
    phaseRef.current = 'playing';
    setPhase('playing');
    wakeRef.current();
  };

  useEffect(() => {
    lastRef.current = performance.now();

    const doRound = () => {
      const sv = svRef.current;
      if (!sv) return;
      const c = cfgRef.current;
      const cdef = getSVCode(c.codeId);
      let events: { kind: string; qubit: number }[] = [];
      let detected = false;
      let corrected = false;
      if (c.qecOn) {
        const r = runLiveRound(cdef, sv, c.noise, noiseParams(c.p, c.noise, { rotDeg: c.p * 180, T1: 5, T2: 5 }), rngRef.current, Math.PI / 3, Math.PI / 5);
        events = r.noiseEvents;
        detected = r.detected;
        corrected = r.correction.x.length > 0 || r.correction.z.length > 0;
      } else {
        events = applyNoiseLayer(sv, c.noise, noiseParams(c.p, c.noise, { rotDeg: c.p * 180, T1: 5, T2: 5 }), rngRef.current);
      }
      roundRef.current++;
      if (detected) detectedRef.current++;
      if (corrected) correctionsRef.current++;
      historyRef.current.push({
        round: roundRef.current,
        events: events.map((e) => `${e.kind}@q${e.qubit}`),
        detected,
        corrected,
        dominant: '',
        dominantProb: 0,
      });
      if (historyRef.current.length > 600) historyRef.current.shift();
    };

    const draw = () => {
      const cv = canvasRef.current;
      if (!cv || !svRef.current) return phaseRef.current === 'playing';
      const fit = fitCanvas(cv);
      if (!fit) return phaseRef.current === 'playing';
      const { w, h, ctx } = fit;
      const c = cfgRef.current;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const camO = cam.current as Cam;
      if (camO.auto) camO.yaw += dt * 0.14; // gentle idle orbit

      // ----- ONE-SHOT physics ticks: exactly c.rounds rounds, then stop
      if (phaseRef.current === 'playing') {
        accRef.current += dt;
        const interval = 1 / 5; // readable playback: 5 rounds per second
        let progressed = false;
        while (accRef.current > interval && roundRef.current < c.rounds) {
          doRound();
          accRef.current -= interval;
          progressed = true;
        }
        if (roundRef.current >= c.rounds) {
          phaseRef.current = 'done';
          setPhase('done');
        }
        if (progressed) {
          let dom = 0, domP = -1;
          for (let i = 0; i < nStates; i++) {
            const pr = dispRef.current[2 * i] ** 2 + dispRef.current[2 * i + 1] ** 2;
            if (pr > domP) { domP = pr; dom = i; }
          }
          if (historyRef.current.length) {
            historyRef.current[historyRef.current.length - 1].dominant = `|${dom.toString(2).padStart(nQ, '0')}⟩`;
            historyRef.current[historyRef.current.length - 1].dominantProb = domP;
          }
          setHud({
            round: roundRef.current,
            corrections: correctionsRef.current,
            detected: detectedRef.current,
            dominant: `|${dom.toString(2).padStart(nQ, '0')}⟩`,
            dominantProb: domP,
          });
        }
      }

      // ----- targets from live state vector (all 2^n amplitudes)
      const data = svRef.current.data;
      for (let i = 0; i < nStates; i++) {
        tgtRef.current[2 * i] = data[2 * i];
        tgtRef.current[2 * i + 1] = data[2 * i + 1];
      }
      const k = 1 - Math.exp(-dt * 7);
      for (let i = 0; i < 2 * nStates; i++) dispRef.current[i] += (tgtRef.current[i] - dispRef.current[i]) * k;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.52;
      const scale = Math.min(w, h) * 0.33;

      // ----- city ground
      const floorY = -0.82;
      drawFloorGrid(ctx, camO, cx, cy, scale, 1.0, cols, floorY, 'rgba(96,110,170,0.22)');
      label3D(ctx, 'computational basis →', { x: 0.98, y: floorY, z: 0.98 }, camO, cx, cy, scale, 'rgba(148,163,184,0.75)', '10px ui-sans-serif', 0, 0);

      // ----- towers on a proper city grid (depth-sorted: far rows first)
      const spacing = 1.84 / cols;
      const halfW = spacing * 0.3;
      const maxH = 1.55;
      const towers: { i: number; x: number; z: number; prob: number; re: number; im: number; height: number; depth: number }[] = [];
      for (let i = 0; i < nStates; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * spacing;
        const z = (row - (rows - 1) / 2) * spacing * (rows > 1 ? 1.35 : 1);
        const re = dispRef.current[2 * i];
        const im = dispRef.current[2 * i + 1];
        const prob = re * re + im * im;
        const height = Math.max(0.02, prob * maxH);
        const depth = proj(x, floorY + height / 2, z, camO, cx, cy, scale).d;
        towers.push({ i, x, z, prob, re, im, height, depth });
      }
      towers.sort((a, b) => a.depth - b.depth); // far (negative d) first
      for (const tw of towers) {
        const { i, x, z, prob, re, im, height } = tw;
        const color = prob < 0.004 ? '#39465e' : phaseHex(re, im); // dim stubs for ~0 towers
        const isLogical = isRepFamily && (i === 0 || i === nStates - 1);

        bar3D(ctx, { x, z }, floorY, floorY + height, halfW, camO, cx, cy, scale, color, {
          capGlow: prob > 0.08 ? 9 : 0,
          outline: 'rgba(8,6,20,0.5)',
        });

        // logical codespace towers get a cyan glow ring at the base
        if (isLogical && prob > 0.02) {
          dot3D(ctx, { x, y: floorY + 0.005, z }, camO, cx, cy, scale, 'rgba(34,211,238,0.95)', 3.4, 12);
        }
        // basis label — front row for big grids, all for small ones
        const showLabel = rows === 1 || Math.floor(tw.i / cols) === rows - 1 || prob > 0.05;
        if (showLabel) {
          label3D(ctx, `|${i.toString(2).padStart(nQ, '0')}⟩`, { x, y: floorY, z: z + halfW + 0.03 }, camO, cx, cy, scale, 'rgba(148,163,184,0.85)', '9px monospace', 0, 6);
        }
        if (prob > 0.004) {
          label3D(ctx, `${(prob * 100).toFixed(prob > 0.1 ? 0 : 1)}%`, { x, y: floorY + height + 0.05, z }, camO, cx, cy, scale, color === '#000000' ? '#94a3b8' : '#e2e8f0', 'bold 10px monospace', 0, -4);
        }
      }

      // legend
      ctx.save();
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(148,163,184,0.85)';
      ctx.fillText('tower height = probability · colour = complex phase · ○ cyan base = codespace (logical) towers', 12, h - 12);
      ctx.restore();

      // keep animating while playing, settling, or idle-orbiting
      let settled = true;
      for (let i = 0; i < 2 * nStates; i++) {
        if (Math.abs(dispRef.current[i] - tgtRef.current[i]) > 0.004) { settled = false; break; }
      }
      return phaseRef.current === 'playing' || !settled || camO.auto;
    };

    const loop = () => {
      const keep = draw();
      rafRef.current = keep ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!rafRef.current) {
        lastRef.current = performance.now();
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    wakeRef.current = wake;

    wake(); // render one static frame on mount
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      wakeRef.current = () => {};
    };
     
  }, []);

  const exportReport = () => {
    const rows = historyRef.current.slice(-120);
    openPrintableReport(
      { title: '3-D State Cityscape — Live Encoded-Block Simulation', runKind: 'Real-Time 3D Visualizer' },
      [
        {
          heading: 'Inputs',
          kv: [
            ['QEC code', `${code.name} [[${code.n},${code.k},${code.d}]]`],
            ['Encoding', code.projectionEncoding ? 'Stabilizer projection' : 'Unitary circuit'],
            ['Basis towers rendered', String(nStates)],
            ['Noise model', NOISE_LABELS[noise] ?? noise],
            ['Noise strength p', p.toFixed(3)],
            ['QEC correction rounds', qecOn ? 'Enabled' : 'DISABLED (raw noise observation)'],
            ['Rounds simulated', `${hud.round} (one-shot run — stopped at completion)`],
            ['Input logical state', '|ψ⟩ = cos(π/6)|0⟩ + e^(iπ/5)·sin(π/6)|1⟩'],
            ['Generated at', nowStamp()],
          ],
        },
        {
          heading: 'Outputs — Live Statistics',
          cards: [
            { label: 'Rounds simulated', value: String(hud.round) },
            { label: 'Syndrome detections', value: String(hud.detected) },
            { label: 'Corrections applied', value: String(hud.corrections), tone: 'good' },
            { label: 'Dominant basis state', value: `${hud.dominant} (${(hud.dominantProb * 100).toFixed(1)}%)` },
          ],
        },
        {
          heading: 'Per-Round Log (last 120 rounds)',
          table: {
            headers: ['Round', 'Noise events', 'Syndrome', 'Correction', 'Dominant state', 'Probability'],
            rows: rows.map((r) => [r.round, r.events.join(' ') || 'none', r.detected ? 'flagged' : 'trivial', r.corrected ? 'applied' : '—', r.dominant || '—', r.dominantProb ? (r.dominantProb * 100).toFixed(1) + '%' : '—']),
          },
          note: 'Full state-vector simulation per round: noise channel → stabilizer syndrome → table-driven correction. Amplitudes were read directly from the encoded register.',
        },
        {
          heading: 'Methodology',
          text: `Each round applies the selected noise channel to the full encoded state vector, measures every stabilizer generator projectively, applies the decoder correction, and re-reads all 2^${nQ} computational-basis amplitudes. Towers are arranged on a city grid, shaded per face by a fixed light direction, and colored by complex phase; for the repetition family the two cyan-marked all-0 / all-1 towers span the logical codespace. Team: ${TEAM_NAMES.join(', ')}.`,
        },
      ]
    );
  };

  const exportJSONData = () => {
    const data = svRef.current?.data ?? new Float64Array(2 * nStates);
    const amps = Array.from({ length: nStates }, (_, i) => ({
      basis: `|${i.toString(2).padStart(nQ, '0')}⟩`,
      re: data[2 * i],
      im: data[2 * i + 1],
      prob: data[2 * i] ** 2 + data[2 * i + 1] ** 2,
    }));
    downloadJSON(`cityscape-${codeId}-${runId()}.json`, {
      experiment: '3D State Cityscape — live encoded-block rounds',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      inputs: { code: codeId, noise, p, qecOn, rounds },
      currentAmplitudes: amps,
      roundCount: roundRef.current,
      history: historyRef.current,
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card className="glass border-white/8">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">State Cityscape Controls</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              The encoded block drawn as a 3-D city — one tower per basis state. Press Run: it simulates exactly N
              rounds, then stops so you can inspect the final skyline.
            </p>
          </div>
          <Field label="Encoded Block">
            <Select value={codeId} onValueChange={setCodeId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CITY_CODES.map((id) => {
                  const c = getSVCode(id);
                  return <SelectItem key={id} value={id}>{c.short} · [[{c.n},{c.k},{c.d}]]</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Noise Model">
            <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['bitflip', 'phaseflip', 'depolarizing', 'amplitude-damping', 'phase-damping', 'coherent-rotation'].map((id) => (
                  <SelectItem key={id} value={id}>{NOISE_LABELS[id]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <LabeledSlider label="Noise strength p" value={Math.round(p * 500)} display={p.toFixed(3)} min={0} max={250} step={1} onChange={(v) => setP(v / 500)} />
          <LabeledSlider label="Rounds to run" value={rounds} display={String(rounds)} min={10} max={60} step={2} onChange={setRounds} />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-300">QEC correction</div>
              <div className="text-[10px] text-slate-500">off = watch the state decay raw</div>
            </div>
            <Switch checked={qecOn} onCheckedChange={setQecOn} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="bg-violet-600 text-white hover:bg-violet-500" onClick={runCity} disabled={phase === 'playing'}>
              <Play className="mr-1 h-3.5 w-3.5" /> {phase === 'done' ? 'Run again' : 'Run'}
            </Button>
            <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300" onClick={reset} disabled={phase === 'playing'}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {phase === 'idle' ? 'idle — press Run' : phase === 'playing' ? `running — round ${hud.round} / ${rounds}` : 'complete — simulation stopped'}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'playing' ? 'animate-pulse bg-amber-400' : phase === 'done' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Round" value={String(hud.round)} />
            <StatChip label="Corrections" value={String(hud.corrections)} tone="good" />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Dominant basis state</div>
            <div className="font-mono text-base text-cyan-300">{hud.dominant} <span className="text-xs text-slate-500">{(hud.dominantProb * 100).toFixed(1)}%</span></div>
          </div>
          <ExportButtons onReport={exportReport} onJSON={exportJSONData} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Auto-orbit camera</span>
            <Switch checked={orbit} onCheckedChange={setOrbit} />
          </div>
          <OrbitHint />
        </CardContent>
      </Card>

      <Card className="glass-deep overflow-hidden border-white/8">
        <CardContent className="relative p-2">
          <canvas
            ref={canvasRef}
            className="h-[540px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDragKeep}
            onPointerLeave={endDragKeep}
          />
          <Badge className="absolute left-4 top-4 bg-violet-600/25 text-violet-200 hover:bg-violet-600/25">3D · live state vector — {nStates} towers</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

/* ==================================================================== */
/* Spacetime Lab v6 — 4D surface-code error propagation                 */
/* ==================================================================== */

interface SlabRound {
  t: number;
  newErrors: { r: number; c: number; x: boolean; z: boolean }[];
  cumX: boolean[];
  cumZ: boolean[];
  defectsZ: [number, number][];
  defectsX: [number, number][];
  chains: { pts: [number, number][]; kind: 'X' | 'Z' }[];
  corrections: [number, number][];
  logicalError: boolean;
}

export function SpacetimeLab() {
  const [orbit, setOrbit] = useState(true);
  const [d, setD] = useState(5);
  const [noise, setNoise] = useState<SurfaceNoise>('bitflip');
  const [p, setP] = useState(0.08);
  const [totalRounds, setTotalRounds] = useState(8);
  const [speed, setSpeed] = useState(1.6);
  const [phase, setPhase] = useState<'playing' | 'done'>('playing');
  const [hud, setHud] = useState({ failures: 0, errors: 0, defects: 0, corrections: 0, round: 0 });

  const rafRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const phaseRef = useRef<'playing' | 'done'>('playing');
  const { cam, canvasRef, setAuto, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useOrbitCam(
    { dist: 3.8, yaw: 0.72, pitch: 0.46, auto: true },
    () => wakeRef.current()
  );

  const slabsRef = useRef<SlabRound[]>([]);
  const cfgRef = useRef({ d, noise, p, totalRounds, speed });
  useEffect(() => {
    cfgRef.current = { d, noise, p, totalRounds, speed };
  }, [d, noise, p, totalRounds, speed]);
  const orbitRef = useRef(orbit);
  useEffect(() => { orbitRef.current = orbit; }, [orbit]);
  useEffect(() => {
    setAuto(orbitRef.current);
    wakeRef.current();
  }, [orbit]);
  const endDragKeep = () => {
    onPointerUp();
    onPointerLeave();
    setAuto(orbitRef.current);
    wakeRef.current();
  };
  const cursorRef = useRef(0);
  const lastRef = useRef(0);
  const totalsRef = useRef({ failures: 0, errors: 0, defects: 0, corrections: 0 });
  const historyRef = useRef<Record<string, unknown>[]>([]);

  const generate = () => {
    const { d: dd, noise: nz, p: pp, totalRounds: T } = cfgRef.current;
    const layout = getSurfaceLayout(dd);
    const n2 = dd * dd;
    const rng = makeRng(Math.floor(Math.random() * 1e9));
    const cumX = new Array(n2).fill(false);
    const cumZ = new Array(n2).fill(false);
    const graphZ = buildMatchingGraph(layout, 'Z');
    const graphX = buildMatchingGraph(layout, 'X');
    const slabs: SlabRound[] = [];
    totalsRef.current = { failures: 0, errors: 0, defects: 0, corrections: 0 };

    const decodeDir = (syndrome: number[], stabs: SurfaceStab[], graph: MatchingGraph, kind: 'X' | 'Z') => {
      const defects = syndrome.map((s, i) => (s === 1 ? i : -1)).filter((i) => i >= 0);
      const corrected: boolean[] = new Array(n2).fill(false);
      const chains: { pts: [number, number][]; kind: 'X' | 'Z' }[] = [];
      if (defects.length === 0) return { corrected, chains, defectCenters: [] as [number, number][] };
      const { pairs, toBoundary } = matchDefects(graph, defects);
      for (const [i, j] of pairs) {
        for (const q of graph.path[i][j]) corrected[q] = !corrected[q];
        chains.push({ pts: graph.path[i][j].map((q) => [Math.floor(q / dd), q % dd] as [number, number]), kind });
      }
      for (const i of toBoundary) {
        for (const q of graph.pathB[i]) corrected[q] = !corrected[q];
        chains.push({ pts: graph.pathB[i].map((q) => [Math.floor(q / dd), q % dd] as [number, number]), kind });
      }
      const defectCenters = defects.map((i) => stabCenter(layout, stabs[i]));
      return { corrected, chains, defectCenters };
    };

    for (let t = 1; t <= T; t++) {
      // fresh noise this round
      const newErrors: SlabRound['newErrors'] = [];
      for (let i = 0; i < n2; i++) {
        let ex = false, ez = false;
        if (nz === 'bitflip') ex = rng() < pp;
        else if (nz === 'phaseflip') ez = rng() < pp;
        else {
          const r = rng();
          if (r < pp / 3) ex = true;
          else if (r < (2 * pp) / 3) ez = true;
          else if (r < pp) { ex = true; ez = true; }
        }
        if (ex || ez) {
          cumX[i] = cumX[i] || ex;
          cumZ[i] = cumZ[i] || ez;
          newErrors.push({ r: Math.floor(i / dd), c: i % dd, x: ex, z: ez });
        }
      }

      const syndromeZ = layout.stabsZ.map((st) => st.qubits.reduce((a, [r, c]) => a + (cumX[r * dd + c] ? 1 : 0), 0) % 2);
      const syndromeX = layout.stabsX.map((st) => st.qubits.reduce((a, [r, c]) => a + (cumZ[r * dd + c] ? 1 : 0), 0) % 2);

      const decZ = decodeDir(syndromeZ, layout.stabsZ, graphZ, 'X'); // X errors from Z syndrome
      const decX = decodeDir(syndromeX, layout.stabsX, graphX, 'Z');

      const corrections: [number, number][] = [];
      for (let q = 0; q < n2; q++) {
        if (decZ.corrected[q] || decX.corrected[q]) {
          cumX[q] = cumX[q] !== decZ.corrected[q];
          cumZ[q] = cumZ[q] !== decX.corrected[q];
          corrections.push([Math.floor(q / dd), q % dd]);
        }
      }

      // logical check on residual cumulative state
      const xOnRow0 = layout.logicalZ.filter(([r, c]) => cumX[r * dd + c]).length;
      const zOnCol0 = layout.logicalX.filter(([r, c]) => cumZ[r * dd + c]).length;
      const logicalError = xOnRow0 % 2 === 1 || zOnCol0 % 2 === 1;

      totalsRef.current.errors += newErrors.length;
      totalsRef.current.defects += decZ.defectCenters.length + decX.defectCenters.length;
      totalsRef.current.corrections += corrections.length;
      if (logicalError) totalsRef.current.failures++;

      slabs.push({
        t, newErrors, cumX: [...cumX], cumZ: [...cumZ],
        defectsZ: decZ.defectCenters, defectsX: decX.defectCenters,
        chains: [...decZ.chains, ...decX.chains],
        corrections, logicalError,
      });
      historyRef.current.push({
        round: t,
        newPhysicalErrors: newErrors.length,
        defectsZ: decZ.defectCenters.length,
        defectsX: decX.defectCenters.length,
        corrections: corrections.length,
        logicalError,
      });
      if (logicalError) {
        // decoder failed: reset the block to a fresh encoded state and continue
        cumX.fill(false);
        cumZ.fill(false);
      }
    }
    slabsRef.current = slabs;
    cursorRef.current = 0;
    // ONE-SHOT: a fresh experiment always plays exactly T rounds, then stops
    phaseRef.current = 'playing';
    setPhase('playing');
    setHud({ ...totalsRef.current, round: 0 });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-shot regeneration on config change
    generate();
  }, [d, noise, p, totalRounds]);

  useEffect(() => {
    lastRef.current = performance.now();

    const draw = () => {
      const cv = canvasRef.current;
      if (!cv) return phaseRef.current === 'playing';
      const fit = fitCanvas(cv);
      if (!fit) return phaseRef.current === 'playing';
      const { w, h, ctx } = fit;
      const c = cfgRef.current;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const camO = cam.current as Cam;
      if (camO.auto) camO.yaw += dt * 0.14;

      // ONE-SHOT playback: advance through the pre-computed rounds, then stop
      if (phaseRef.current === 'playing') {
        cursorRef.current += dt * c.speed;
        if (cursorRef.current > c.totalRounds + 0.8) {
          cursorRef.current = c.totalRounds + 0.8;
          phaseRef.current = 'done';
          setPhase('done');
          setHud({ ...totalsRef.current, round: c.totalRounds });
        } else {
          setHud((s) => ({ ...s, round: Math.min(c.totalRounds, Math.floor(cursorRef.current)) }));
        }
      }
      const cursor = Math.min(cursorRef.current, c.totalRounds);

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.5;
      const scale = Math.min(w, h) * 0.31;
      const dd = c.d;
      const T = c.totalRounds;
      const spread = 1.72;
      const px = (col: number) => (col / Math.max(1, dd - 1) - 0.5) * spread;
      const pz = (row: number) => (row / Math.max(1, dd - 1) - 0.5) * spread;
      const py = (t: number) => -1.02 + (t / T) * 2.04;

      // ---- connected time axis at the front-left corner of the stack
      const axX = px(0) - 0.34;
      const axZ = pz(dd - 1) + 0.34;
      const a0: Vec3 = { x: axX, y: py(0) - 0.1, z: axZ };
      const a1: Vec3 = { x: axX, y: py(T) + 0.1, z: axZ };
      arrow3D(ctx, a0, a1, camO, cx, cy, scale, 'rgba(167,139,250,0.95)', 1.8);
      for (let t = 0; t <= T; t += 2) {
        const tv: Vec3 = { x: axX, y: py(t), z: axZ };
        stroke3D(ctx, [tv, { x: axX - 0.05, y: py(t), z: axZ + 0.05 }], camO, cx, cy, scale, 'rgba(167,139,250,0.8)', 1.2);
        label3D(ctx, `t=${t}`, tv, camO, cx, cy, scale, 'rgba(167,139,250,0.95)', '9px monospace', -24, 3);
      }
      label3D(ctx, 'time (syndrome rounds)', { x: axX - 0.06, y: py(T) + 0.16, z: axZ }, camO, cx, cy, scale, '#a78bfa', '10px ui-sans-serif', -70, 0);

      const slabs = slabsRef.current;
      const visT = Math.floor(cursor);

      // ---- floors, oldest (back) to newest (front of drawing order)
      for (const slab of slabs) {
        if (slab.t > visT) continue;
        const y = py(slab.t);
        const active = slab.t === visT;
        const fade = active ? 1 : Math.max(0.18, 1 - (visT - slab.t) * 0.1);

        // translucent floor panel — makes each round read as a solid sheet
        quad3D(
          ctx,
          [
            { x: px(0), y, z: pz(0) }, { x: px(dd - 1), y, z: pz(0) },
            { x: px(dd - 1), y, z: pz(dd - 1) }, { x: px(0), y, z: pz(dd - 1) },
          ],
          camO, cx, cy, scale,
          `rgba(56,120,200,${(active ? 0.07 : 0.035) * fade})`,
          `rgba(56,189,248,${(active ? 0.55 : 0.3) * fade})`,
          1
        );

        // lattice grid lines
        for (let r = 0; r < dd; r++) {
          stroke3D(ctx, [{ x: px(0), y, z: pz(r) }, { x: px(dd - 1), y, z: pz(r) }], camO, cx, cy, scale, `rgba(56,189,248,${0.4 * fade})`, 0.8);
        }
        for (let col = 0; col < dd; col++) {
          stroke3D(ctx, [{ x: px(col), y, z: pz(0) }, { x: px(col), y, z: pz(dd - 1) }], camO, cx, cy, scale, `rgba(56,189,248,${0.4 * fade})`, 0.8);
        }

        // data qubits — clean when teal, glowing when carrying errors
        for (let r = 0; r < dd; r++) {
          for (let col = 0; col < dd; col++) {
            const i = r * dd + col;
            const v: Vec3 = { x: px(col), y, z: pz(r) };
            const hasX = slab.cumX[i];
            const hasZ = slab.cumZ[i];
            if (hasX && hasZ) dot3D(ctx, v, camO, cx, cy, scale, `rgba(232,121,249,${fade})`, 3.6, 12);
            else if (hasX) dot3D(ctx, v, camO, cx, cy, scale, `rgba(251,113,133,${fade})`, 3.4, active ? 11 : 0);
            else if (hasZ) dot3D(ctx, v, camO, cx, cy, scale, `rgba(251,191,36,${fade})`, 3.4, active ? 11 : 0);
            else dot3D(ctx, v, camO, cx, cy, scale, `rgba(94,234,212,${0.55 * fade})`, 2.0);
          }
        }

        // matching chains (decoder recovery paths in spacetime)
        for (const ch of slab.chains) {
          const pts: Vec3[] = ch.pts.map(([r, cc]) => ({ x: px(cc), y: y + 0.02, z: pz(r) }));
          stroke3D(ctx, pts, camO, cx, cy, scale, ch.kind === 'X' ? `rgba(74,222,128,${0.9 * fade})` : `rgba(167,139,250,${0.9 * fade})`, 2.4, [5, 3]);
        }

        // defect stars
        for (const [r, col] of slab.defectsZ) star3D(ctx, { x: px(col), y: y + 0.09, z: pz(r) }, camO, cx, cy, scale, `rgba(251,113,133,${fade})`, 6.5);
        for (const [r, col] of slab.defectsX) star3D(ctx, { x: px(col), y: y + 0.09, z: pz(r) }, camO, cx, cy, scale, `rgba(167,139,250,${fade})`, 6.5);

        if (slab.logicalError) {
          label3D(ctx, 'LOGICAL ERROR → block re-initialized', { x: px(dd - 1), y: y + 0.15, z: pz(dd - 1) }, camO, cx, cy, scale, 'rgba(251,113,133,0.95)', 'bold 10px ui-sans-serif', 6, 0);
        }
        if (active) {
          label3D(ctx, `t = ${slab.t} / ${T}`, { x: px(0), y: y - 0.13, z: pz(0) }, camO, cx, cy, scale, '#67e8f9', 'bold 11px monospace', -14, 0);
        }
      }

      // worldlines of errored qubits across visible slabs (spacetime threads)
      const errored = new Set<number>();
      for (const slab of slabs) {
        if (slab.t > visT) continue;
        for (let i = 0; i < dd * dd; i++) if (slab.cumX[i] || slab.cumZ[i]) errored.add(i);
      }
      for (const i of errored) {
        const r = Math.floor(i / dd);
        const col = i % dd;
        stroke3D(
          ctx,
          Array.from({ length: visT }, (_, t) => ({ x: px(col), y: py(t + 1), z: pz(r) })),
          camO, cx, cy, scale, 'rgba(226,232,240,0.22)', 1.1
        );
      }

      // legend
      ctx.save();
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(148,163,184,0.85)';
      ctx.fillText('● X error   ● Z error   ● Y error   ✳ defect (flagged stabilizer)   ┄ MWPM matching chain   │ error worldline', 12, h - 12);
      ctx.restore();

      return phaseRef.current === 'playing' || camO.auto; // one-shot: stop when complete (unless idle-orbiting)
    };

    const loop = () => {
      const keep = draw();
      rafRef.current = keep ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!rafRef.current) {
        lastRef.current = performance.now();
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    wakeRef.current = wake;

    wake(); // render one static frame on mount
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      wakeRef.current = () => {};
    };
  }, []);

  const exportReport = () => {
    const rows = slabsRef.current;
    openPrintableReport(
      { title: '4-D Spacetime Surface-Code Experiment', runKind: 'Real-Time 4D Visualizer' },
      [
        {
          heading: 'Inputs',
          kv: [
            ['Code', `Rotated surface code d=${d} ([[${d * d},1,${d}]])`],
            ['Noise model', NOISE_LABELS[noise] ?? noise],
            ['Physical error rate p', p.toFixed(3)],
            ['Syndrome rounds', String(totalRounds)],
            ['Decoder', 'Minimum-weight perfect matching (exact subset DP)'],
            ['Model', 'Code-capacity, cumulative multi-round Pauli frame'],
            ['Generated at', nowStamp()],
          ],
        },
        {
          heading: 'Outputs — Experiment Totals',
          cards: [
            { label: 'Rounds', value: String(rows.length) },
            { label: 'Physical errors', value: String(hud.errors) },
            { label: 'Defects flagged', value: String(hud.defects) },
            { label: 'Corrections', value: String(hud.corrections), tone: 'good' },
            { label: 'Logical failures', value: String(hud.failures), tone: hud.failures ? 'bad' : 'good' },
          ],
        },
        {
          heading: 'Per-Round Ledger',
          table: {
            headers: ['Round', 'New errors', 'Z-defects', 'X-defects', 'Corrections', 'Logical error'],
            rows: rows.map((s) => [s.t, s.newErrors.length, s.defectsZ.length, s.defectsX.length, s.corrections.length, s.logicalError ? 'YES (block reset)' : 'no']),
          },
          note: 'Errors accumulate on the code block across rounds; every round the decoder matches defect pairs in spacetime and applies corrections. On a logical failure the block is re-initialized, mirroring a fresh logical qubit.',
        },
        {
          heading: 'Methodology',
          text: `Each syndrome round samples independent physical Pauli errors at rate p on the d×d data lattice (code-capacity model). Z-type stabilizers flag X components, X-type flag Z components; the MWPM decoder pairs defects through the stabilizer graph (boundary-terminating pairs allowed). A residual error anticommuting with a logical operator after correction constitutes a logical error. Team: ${TEAM_NAMES.join(', ')}.`,
        },
      ]
    );
  };

  const exportJSONData = () => {
    downloadJSON(`spacetime-d${d}-${runId()}.json`, {
      experiment: '4D Spacetime surface-code error propagation',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      inputs: { d, noise, p, rounds: totalRounds, decoder: 'MWPM' },
      totals: totalsRef.current,
      rounds: historyRef.current,
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card className="glass border-white/8">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Spacetime Lattice Controls</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Surface-code data qubits in space (d×d) stacked over syndrome rounds (time). Each run plays exactly T
              rounds once, then stops — a complete 4-D experiment you can orbit and inspect.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance d">
              <Select value={String(d)} onValueChange={(v) => setD(Number(v))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{[3, 5, 7, 9].map((dd) => <SelectItem key={dd} value={String(dd)}>d = {dd}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Noise">
              <Select value={noise} onValueChange={(v) => setNoise(v as SurfaceNoise)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['bitflip', 'phaseflip', 'depolarizing'].map((id) => <SelectItem key={id} value={id}>{NOISE_LABELS[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <LabeledSlider label="Physical error rate p" value={Math.round(p * 200)} display={p.toFixed(3)} min={1} max={40} step={1} onChange={(v) => setP(v / 200)} />
          <LabeledSlider label="Syndrome rounds" value={totalRounds} display={String(totalRounds)} min={3} max={16} step={1} onChange={setTotalRounds} />
          <LabeledSlider label="Playback speed" value={Math.round(speed * 10)} display={`${speed.toFixed(1)} rounds/s`} min={3} max={40} step={1} onChange={(v) => setSpeed(v / 10)} />
          <div className="grid grid-cols-1 gap-2">
            <Button size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500" onClick={generate} disabled={phase === 'playing'}>
              <Play className="mr-1 h-3.5 w-3.5" /> {phase === 'done' ? 'New run (fresh random noise)' : 'Running…'}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-cyan-500/20 px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {phase === 'playing' ? `playing — round ${hud.round} / ${totalRounds}` : 'complete — simulation stopped'}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'playing' ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Errors sampled" value={String(hud.errors)} />
            <StatChip label="Defects" value={String(hud.defects)} />
            <StatChip label="Corrections" value={String(hud.corrections)} tone="good" />
            <StatChip label="Logical fails" value={String(hud.failures)} tone={hud.failures ? 'bad' : 'good'} />
          </div>
          <ExportButtons onReport={exportReport} onJSON={exportJSONData} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Auto-orbit camera</span>
            <Switch checked={orbit} onCheckedChange={setOrbit} />
          </div>
          <OrbitHint />
        </CardContent>
      </Card>

      <Card className="glass-deep overflow-hidden border-white/8">
        <CardContent className="relative p-2">
          <canvas
            ref={canvasRef}
            className="h-[540px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDragKeep}
            onPointerLeave={endDragKeep}
          />
          <Badge className="absolute left-4 top-4 bg-cyan-600/25 text-cyan-200 hover:bg-cyan-600/25">4D · {d}×{d} space × {totalRounds} rounds</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

/* ==================================================================== */
/* Threshold Terrain v6 — large-scale live Monte Carlo (NEW)            */
/* ==================================================================== */

/**
 * Runs thousands of complete surface-code experiments live in the browser —
 * one bar per (physical error rate p, code distance d) pair — and grows a 3-D
 * terrain of measured logical error rates while the data streams in. This is
 * the surface-code threshold, measured in front of you: below the threshold
 * bigger codes (taller d) give shorter bars; above it the ordering flips.
 */

const TERRAIN_D = [3, 5, 7];
const TERRAIN_P = [0.02, 0.05, 0.08, 0.11, 0.14, 0.17, 0.2];
const SHOTS_PER_CELL = 200;
const TOTAL_SHOTS = TERRAIN_D.length * TERRAIN_P.length * SHOTS_PER_CELL; // 2,520 experiments

interface TerrainCell {
  shots: number;
  failures: number;
}

export function ThresholdTerrain() {
  const [orbit, setOrbit] = useState(true);
  const [noise, setNoise] = useState<SurfaceNoise>('bitflip');
  const [shotsPerCell, setShotsPerCell] = useState(SHOTS_PER_CELL);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [hud, setHud] = useState({ done: 0, total: TOTAL_SHOTS, cell: '—', elapsed: 0, verdict: '' });

  const rafRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const phaseRef = useRef<'idle' | 'playing' | 'done'>('idle');
  const { cam, canvasRef, setAuto, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useOrbitCam(
    { dist: 3.7, yaw: 0.52, pitch: 0.5, auto: true },
    () => wakeRef.current()
  );

  const resultsRef = useRef<TerrainCell[][]>(TERRAIN_D.map(() => TERRAIN_P.map(() => ({ shots: 0, failures: 0 }))));
  const cfgRef = useRef({ noise, shotsPerCell });
  useEffect(() => {
    cfgRef.current = { noise, shotsPerCell };
  }, [noise, shotsPerCell]);
  const orbitRef = useRef(orbit);
  useEffect(() => { orbitRef.current = orbit; }, [orbit]);
  useEffect(() => {
    setAuto(orbitRef.current);
    wakeRef.current();
  }, [orbit]);
  const endDragKeep = () => {
    onPointerUp();
    onPointerLeave();
    setAuto(orbitRef.current);
    wakeRef.current();
  };
  const cursorRef = useRef({ cell: 0, shot: 0 }); // flat cell index + shot within cell
  const rngRef = useRef(makeRng(1));
  const startRef = useRef(0);
  const lastRef = useRef(0);
  const lastHudRef = useRef(0);
  const totalRef = useRef(TOTAL_SHOTS);

  const totalShotsFor = () => TERRAIN_D.length * TERRAIN_P.length * cfgRef.current.shotsPerCell;

  const resetData = () => {
    resultsRef.current = TERRAIN_D.map(() => TERRAIN_P.map(() => ({ shots: 0, failures: 0 })));
    cursorRef.current = { cell: 0, shot: 0 };
    totalRef.current = totalShotsFor();
  };

  const runTerrain = () => {
    resetData();
    rngRef.current = makeRng(Math.floor(Math.random() * 1e9));
    startRef.current = performance.now();
    phaseRef.current = 'playing';
    setPhase('playing');
    setHud({ done: 0, total: totalRef.current, cell: '—', elapsed: 0, verdict: '' });
    wakeRef.current();
  };

  useEffect(() => {
    lastRef.current = performance.now();

    /** run one shot of the current flat cell; advance to the next cell when full */
    const stepShot = () => {
      const c = cfgRef.current;
      const total = TERRAIN_D.length * TERRAIN_P.length * c.shotsPerCell;
      const { cell, shot } = cursorRef.current;
      if (cell >= TERRAIN_D.length * TERRAIN_P.length) return;
      const dIdx = Math.floor(cell / TERRAIN_P.length);
      const pIdx = cell % TERRAIN_P.length;
      const res = runSurfaceShot(TERRAIN_D[dIdx], c.noise, TERRAIN_P[pIdx], rngRef.current);
      const bucket = resultsRef.current[dIdx][pIdx];
      bucket.shots++;
      if (res.logicalError) bucket.failures++;
      cursorRef.current.shot++;
      if (cursorRef.current.shot >= c.shotsPerCell) {
        cursorRef.current = { cell: cell + 1, shot: 0 };
      }
      void total;
    };

    const doneCount = () => {
      let done = 0;
      for (const row of resultsRef.current) for (const c of row) done += c.shots;
      return done;
    };

    const draw = () => {
      const cv = canvasRef.current;
      if (!cv) return phaseRef.current === 'playing';
      const fit = fitCanvas(cv);
      if (!fit) return phaseRef.current === 'playing';
      const { w, h, ctx } = fit;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const camO = cam.current as Cam;
      if (camO.auto) camO.yaw += dt * 0.13;

      // ---- time-sliced Monte Carlo: burn at most ~12ms per frame on physics
      if (phaseRef.current === 'playing') {
        const budgetEnd = performance.now() + 12;
        let frameShots = 0;
        while (performance.now() < budgetEnd && frameShots < 18 && doneCount() < totalRef.current) {
          stepShot();
          frameShots++;
        }
        const done = doneCount();
        if (done >= totalRef.current) {
          phaseRef.current = 'done';
          setPhase('done');
        }
        if (now - lastHudRef.current > 120 || phaseRef.current === 'done') {
          lastHudRef.current = now;
          const { cell } = cursorRef.current;
          const dIdx = Math.min(TERRAIN_D.length - 1, Math.floor(cell / TERRAIN_P.length));
          const pIdx = cell % TERRAIN_P.length;
          const inProgress = phaseRef.current === 'playing';
          // verdict: first p where d=7 stops beating d=3 (linear interp)
          let verdict = '';
          if (phaseRef.current === 'done') {
            const r3 = resultsRef.current[0].map((c) => (c.shots ? c.failures / c.shots : 0));
            const r7 = resultsRef.current[2].map((c) => (c.shots ? c.failures / c.shots : 0));
            let cross = -1;
            for (let i = 0; i < TERRAIN_P.length - 1; i++) {
              if (r3[i + 1] >= 0.02 && r7[i] <= r3[i] && r7[i + 1] > r3[i + 1]) {
                const f = (r3[i + 1] - r7[i]) / Math.max(1e-9, (r7[i + 1] - r7[i]) - (r3[i + 1] - r3[i]));
                cross = TERRAIN_P[i] + f * (TERRAIN_P[i + 1] - TERRAIN_P[i]);
                break;
              }
            }
            verdict = cross > 0
              ? `threshold estimate ≈ ${(cross * 100).toFixed(1)}% — beyond it, bigger codes stop helping`
              : 'no crossover below 20% — bigger codes win everywhere in this range';
          }
          setHud({
            done,
            total: totalRef.current,
            cell: inProgress && cell < TERRAIN_D.length * TERRAIN_P.length
              ? `d=${TERRAIN_D[dIdx]}, p=${(TERRAIN_P[pIdx] * 100).toFixed(0)}%`
              : 'finished',
            elapsed: (now - startRef.current) / 1000,
            verdict,
          });
        }
      }

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.52;
      const scale = Math.min(w, h) * 0.34;
      const floorY = -0.72;

      // ---- ground
      drawFloorGrid(ctx, camO, cx, cy, scale, 1.05, 6, floorY, 'rgba(96,110,170,0.22)');

      // ---- vertical axis (logical error rate)
      const axX = -1.02, axZ = -1.02;
      arrow3D(ctx, { x: axX, y: floorY, z: axZ }, { x: axX, y: floorY + 1.72, z: axZ }, camO, cx, cy, scale, 'rgba(148,163,184,0.9)', 1.4);
      label3D(ctx, 'logical error rate', { x: axX, y: floorY + 1.78, z: axZ }, camO, cx, cy, scale, '#94a3b8', '10px ui-sans-serif', -52, 0);
      for (const f of [0.25, 0.5, 0.75]) {
        label3D(ctx, `${((f * 0.36) * 100).toFixed(0)}%`, { x: axX, y: floorY + f * 1.6, z: axZ }, camO, cx, cy, scale, 'rgba(148,163,184,0.7)', '8px monospace', -30, 3);
      }

      // ---- terrain bars: x = physical error rate, z = code distance
      const nP = TERRAIN_P.length;
      const px = (i: number) => (i / (nP - 1) - 0.5) * 1.9;
      const pz = (dIdx: number) => 0.62 - dIdx * 0.62;
      const halfW = 0.085;

      const cells: { dIdx: number; pIdx: number; rate: number; measured: boolean; height: number; depth: number }[] = [];
      for (let dIdx = 0; dIdx < TERRAIN_D.length; dIdx++) {
        // distance label on the left edge
        label3D(ctx, `d = ${TERRAIN_D[dIdx]}`, { x: px(0) - 0.18, y: floorY, z: pz(dIdx) }, camO, cx, cy, scale, '#67e8f9', 'bold 10px monospace', -36, 4);
        for (let pIdx = 0; pIdx < nP; pIdx++) {
          const cellData = resultsRef.current[dIdx][pIdx];
          const rate = cellData.shots >= 8 ? cellData.failures / cellData.shots : 0;
          const measured = cellData.shots >= 8;
          const height = Math.max(0.02, (rate / 0.36) * 1.6);
          const depth = proj(px(pIdx), floorY + height / 2, pz(dIdx), camO, cx, cy, scale).d;
          cells.push({ dIdx, pIdx, rate, measured, height, depth });
        }
      }
      cells.sort((a, b) => a.depth - b.depth); // painter: far first
      for (const cl of cells) {
        const color = cl.measured ? rateHex(cl.rate) : '#475569';
        bar3D(ctx, { x: px(cl.pIdx), z: pz(cl.dIdx) }, floorY, floorY + cl.height, halfW, camO, cx, cy, scale, color, {
          capGlow: cl.measured && cl.rate > 0.08 ? 8 : 0,
          outline: 'rgba(8,6,20,0.45)',
        });
        if (cl.measured) {
          label3D(ctx, `${(cl.rate * 100).toFixed(1)}%`, { x: px(cl.pIdx), y: floorY + cl.height + 0.05, z: pz(cl.dIdx) }, camO, cx, cy, scale, '#e2e8f0', 'bold 9px monospace', 0, -3);
        }
      }

      // ---- p axis labels along the front edge
      for (let pIdx = 0; pIdx < nP; pIdx++) {
        label3D(ctx, `${(TERRAIN_P[pIdx] * 100).toFixed(0)}%`, { x: px(pIdx), y: floorY, z: pz(0) + 0.16 }, camO, cx, cy, scale, 'rgba(148,163,184,0.9)', '9px monospace', 0, 10);
      }
      label3D(ctx, 'physical error rate p →', { x: px(nP - 1) + 0.1, y: floorY, z: pz(0) + 0.3 }, camO, cx, cy, scale, '#94a3b8', '10px ui-sans-serif', -20, 14);

      // legend
      ctx.save();
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(148,163,184,0.85)';
      ctx.fillText('bar height = measured logical error rate · colour = how bad (green good → red bad) · live experiments per bar', 12, h - 12);
      ctx.restore();

      return phaseRef.current === 'playing' || camO.auto;
    };

    const loop = () => {
      const keep = draw();
      rafRef.current = keep ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!rafRef.current) {
        lastRef.current = performance.now();
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    wakeRef.current = wake;

    wake();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      wakeRef.current = () => {};
    };
  }, []);

  const exportReport = () => {
    const rows: string[][] = [];
    for (let dIdx = 0; dIdx < TERRAIN_D.length; dIdx++) {
      for (let pIdx = 0; pIdx < TERRAIN_P.length; pIdx++) {
        const c = resultsRef.current[dIdx][pIdx];
        rows.push([
          String(TERRAIN_D[dIdx]),
          TERRAIN_P[pIdx].toFixed(2),
          String(c.shots),
          String(c.failures),
          c.shots ? ((c.failures / c.shots) * 100).toFixed(2) + '%' : '—',
        ]);
      }
    }
    openPrintableReport(
      { title: 'Threshold Terrain — Large-Scale Surface-Code Monte Carlo', runKind: 'Real-Time 4D Batch Experiment' },
      [
        {
          heading: 'Inputs',
          kv: [
            ['Code family', 'Rotated surface code, d = 3 / 5 / 7'],
            ['Noise model', NOISE_LABELS[noise] ?? noise],
            ['Physical error rates', TERRAIN_P.map((v) => v.toFixed(2)).join(', ')],
            ['Experiments per (p, d) cell', String(shotsPerCell)],
            ['Total experiments', String(hud.done)],
            ['Decoder', 'Minimum-weight perfect matching (exact subset DP)'],
            ['Wall-clock time', `${hud.elapsed.toFixed(1)} s (all in-browser)`],
            ['Generated at', nowStamp()],
          ],
        },
        {
          heading: 'Outputs — Measured Logical Error Rates',
          cards: [
            { label: 'Experiments run', value: String(hud.done) },
            { label: 'Data cells', value: `${TERRAIN_D.length * TERRAIN_P.length}` },
            { label: 'Threshold verdict', value: hud.verdict || '—' },
          ],
        },
        {
          heading: 'Full Rate Table',
          table: {
            headers: ['Distance d', 'Physical p', 'Shots', 'Logical failures', 'Logical error rate'],
            rows,
          },
          note: 'Every cell is an independent Monte Carlo estimate; each shot is a complete code-capacity experiment: sample errors → measure stabilizers → MWPM decode → residual logical check.',
        },
        {
          heading: 'Methodology',
          text: `For every pair (physical error rate p, code distance d) we ran ${shotsPerCell} independent surface-code experiments and counted how often the decoded residual error anticommuted with a logical operator. The resulting terrain shows the surface-code threshold: below it, increasing d lowers the logical error rate (green valleys); above it, increasing d stops helping. Team: ${TEAM_NAMES.join(', ')}.`,
        },
      ]
    );
  };

  const exportJSONData = () => {
    const grid = TERRAIN_D.map((dd, dIdx) => ({
      d: dd,
      rates: TERRAIN_P.map((pp, pIdx) => {
        const c = resultsRef.current[dIdx][pIdx];
        return { p: pp, shots: c.shots, failures: c.failures, rate: c.shots ? c.failures / c.shots : null };
      }),
    }));
    downloadJSON(`threshold-terrain-${runId()}.json`, {
      experiment: 'Threshold Terrain — large-scale surface-code Monte Carlo',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      inputs: { noise, shotsPerCell, decoder: 'MWPM' },
      totalExperiments: hud.done,
      wallClockSeconds: hud.elapsed,
      verdict: hud.verdict,
      grid,
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card className="glass border-white/8">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Threshold Terrain Controls</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Thousands of complete surface-code experiments, run live in your browser, build a 3-D map of “how often
              does the code fail?” for every noise level and code size.
            </p>
          </div>
          <Field label="Noise Model">
            <Select value={noise} onValueChange={(v) => setNoise(v as SurfaceNoise)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['bitflip', 'phaseflip', 'depolarizing'].map((id) => <SelectItem key={id} value={id}>{NOISE_LABELS[id]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <LabeledSlider
            label="Experiments per bar"
            value={shotsPerCell}
            display={`${shotsPerCell} × 21 bars`}
            min={40}
            max={300}
            step={20}
            onChange={setShotsPerCell}
          />
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-slate-400">
            Total experiments this run: <span className="font-mono text-cyan-300">{TERRAIN_D.length * TERRAIN_P.length * shotsPerCell}</span>.
            More experiments = smoother terrain, longer run. It stops by itself when finished.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={runTerrain} disabled={phase === 'playing'}>
              <Play className="mr-1 h-3.5 w-3.5" /> {phase === 'done' ? 'Run again' : phase === 'playing' ? 'Measuring…' : 'Run experiment'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-500/40 text-cyan-300"
              onClick={() => { resetData(); phaseRef.current = 'idle'; setPhase('idle'); setHud({ done: 0, total: totalShotsFor(), cell: '—', elapsed: 0, verdict: '' }); wakeRef.current(); }}
              disabled={phase === 'playing'}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {phase === 'idle' ? 'idle — press Run experiment' : phase === 'playing' ? `measuring — ${hud.done} / ${hud.total}` : 'complete — simulation stopped'}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'playing' ? 'animate-pulse bg-amber-400' : phase === 'done' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Experiments" value={`${hud.done}`} />
            <StatChip label="Elapsed" value={`${hud.elapsed.toFixed(1)}s`} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Current cell</div>
            <div className="font-mono text-sm text-cyan-300">{hud.cell}</div>
          </div>
          {hud.verdict && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-emerald-200">
              <span className="font-semibold">Result:</span> {hud.verdict}
            </div>
          )}
          <ExportButtons onReport={exportReport} onJSON={exportJSONData} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Auto-orbit camera</span>
            <Switch checked={orbit} onCheckedChange={setOrbit} />
          </div>
          <OrbitHint />
        </CardContent>
      </Card>

      <Card className="glass-deep overflow-hidden border-white/8">
        <CardContent className="relative p-2">
          <canvas
            ref={canvasRef}
            className="h-[540px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDragKeep}
            onPointerLeave={endDragKeep}
          />
          <Badge className="absolute left-4 top-4 bg-emerald-600/25 text-emerald-200 hover:bg-emerald-600/25">4D · p × distance × failure rate — live Monte Carlo</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
