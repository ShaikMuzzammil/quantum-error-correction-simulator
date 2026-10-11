'use client';

/**
 * Quantum Lab 3D — the "beyond flat" live simulation suite.
 *
 * Three fully-interactive real-time visualizers (all driven by the same
 * verified QEC engine, 60 fps, orbit/zoom camera):
 *
 *   1. Bloch Flight 4D  — a logical qubit flying on the Bloch sphere under
 *      continuous noise rounds, with its full time-colored trajectory trail
 *      (3 spatial dimensions + time as the 4th, encoded as color) and the
 *      bare-qubit ghost trajectory for comparison.
 *
 *   2. State Cityscape  — live 3-D amplitude landscape of an encoded block
 *      (see Lab3DVisuals).
 *
 *   3. Spacetime Lattice — 4-D surface-code error propagation across
 *      syndrome rounds (see Lab3DVisuals).
 *
 * Every visualizer exports a formal report (printable HTML → PDF), JSON
 * and per-round data.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Play, RotateCcw, FileText, Braces, MousePointer2, Orbit, Boxes, Network, LandPlot, FlaskConical } from 'lucide-react';
import { makeRng, StateVector } from '@/lib/qec/engine';
import { getSVCode, SV_CODES } from '@/lib/qec/codes';
import { NoiseModelId, noiseParams } from '@/lib/qec/noise';
import { prepareEncodedState, runLiveRound, runBareRound } from '@/lib/qec/pipeline';
import { Cam, Vec3, useOrbitCam, proj, fitCanvas, drawWireSphere, drawArrow3D, dot3D, label3D, stroke3D } from './three-d';
import { StateCityscape, SpacetimeLab, ThresholdTerrain } from './Lab3DVisuals';
import { downloadJSON, downloadCSV, openPrintableReport, runId, nowStamp, TEAM_NAMES } from '@/lib/report';
import { GuideField, GuideInfo } from './Guide';

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

const STATE_PRESETS = [
  { label: '|0⟩', theta: 0, phi: 0 },
  { label: '|1⟩', theta: Math.PI, phi: 0 },
  { label: '|+⟩', theta: Math.PI / 2, phi: 0 },
  { label: '|+i⟩', theta: Math.PI / 2, phi: Math.PI / 2 },
  { label: 'Custom', theta: -1, phi: -1 },
];

function StatChip({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-200';
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

/* ==================================================================== */
/* Bloch Flight 4D                                                      */
/* ==================================================================== */

interface FlightRound {
  round: number;
  fidelity: number;
  bareFidelity: number;
  events: string[];
  detected: boolean;
  corrected: boolean;
}

const MAX_TRAIL = 260;

export function BlochFlight() {
  const [orbit, setOrbit] = useState(true);
  const [codeId, setCodeId] = useState('code-3bitflip');
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.1);
  const [rounds, setRounds] = useState(30);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [rotDeg, setRotDeg] = useState(10);
  const [t1, setT1] = useState(5);
  const [t2, setT2] = useState(5);
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(Math.PI / 5);
  const [preset, setPreset] = useState('|+i⟩ custom');
  const [qecOn, setQecOn] = useState(true);
  const [hud, setHud] = useState({
    round: 0, fQEC: 1, fBare: 1, avgQEC: 1, avgBare: 1,
    corrections: 0, detected: 0, failures: 0,
  });

  const rafRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const phaseRef = useRef<'idle' | 'playing' | 'done'>('idle');
  const { cam, canvasRef, setAuto, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useOrbitCam(
    { dist: 3.0, yaw: 0.55, pitch: 0.42, auto: true },
    () => wakeRef.current()
  );

  const svRef = useRef<ReturnType<typeof prepareEncodedState> | null>(null);
  const bareRef = useRef<ReturnType<typeof prepareEncodedState> | null>(null);
  const rngRef = useRef(makeRng(42));
  const trailQRef = useRef<{ v: Vec3; t: number }[]>([]);
  const trailBRef = useRef<{ v: Vec3; t: number }[]>([]);
  const vecQRef = useRef<Vec3>({ x: 0, y: 0.85, z: 0.53 });
  const vecBRef = useRef<Vec3>({ x: 0, y: 0.85, z: 0.53 });
  const dispQRef = useRef<Vec3>({ x: 0, y: 0.85, z: 0.53 });
  const dispBRef = useRef<Vec3>({ x: 0, y: 0.85, z: 0.53 });
  const histQRef = useRef<number[]>([]);
  const histBRef = useRef<number[]>([]);
  const roundRef = useRef(0);
  const countersRef = useRef({ corrections: 0, detected: 0, failures: 0 });
  const historyRef = useRef<FlightRound[]>([]);
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const cfgRef = useRef({ codeId, noise, p, rounds, theta, phi, qecOn, rotDeg, t1, t2 });
  useEffect(() => {
    cfgRef.current = { codeId, noise, p, rounds, theta, phi, qecOn, rotDeg, t1, t2 };
  }, [codeId, noise, p, rounds, theta, phi, qecOn, rotDeg, t1, t2]);

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

  const reset = () => {
    const c = cfgRef.current;
    const code = getSVCode(c.codeId);
    svRef.current = prepareEncodedState(code, c.theta, c.phi);
    const bare1 = new StateVector(1);
    bare1.prepareQubit0(c.theta, c.phi);
    bareRef.current = bare1;
    rngRef.current = makeRng(Math.floor(Math.random() * 1e9));
    trailQRef.current = [];
    trailBRef.current = [];
    histQRef.current = [];
    histBRef.current = [];
    roundRef.current = 0;
    countersRef.current = { corrections: 0, detected: 0, failures: 0 };
    historyRef.current = [];
    accRef.current = 0;
    phaseRef.current = 'idle';
    setPhase('idle');
    const v: Vec3 = { x: Math.sin(c.theta) * Math.cos(c.phi), y: Math.cos(c.theta), z: Math.sin(c.theta) * Math.sin(c.phi) };
    vecQRef.current = { ...v };
    vecBRef.current = { ...v };
    dispQRef.current = { ...v };
    dispBRef.current = { ...v };
    setHud({ round: 0, fQEC: 1, fBare: 1, avgQEC: 1, avgBare: 1, corrections: 0, detected: 0, failures: 0 });
    wakeRef.current(); // redraw the idle sphere
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate simulation reset on config change
    reset();
  }, [codeId]);

  /** ONE-SHOT RUN: reset, play exactly `rounds` rounds, then stop for good. */
  const runFlight = () => {
    reset();
    phaseRef.current = 'playing';
    setPhase('playing');
    wakeRef.current();
  };

  useEffect(() => {
    lastRef.current = performance.now();

    const doRound = () => {
      const sv = svRef.current;
      const bare = bareRef.current;
      if (!sv || !bare) return;
      const c = cfgRef.current;
      const code = getSVCode(c.codeId);
      const params = noiseParams(c.p, c.noise, { rotDeg: c.rotDeg, T1: c.t1, T2: c.t2 });

      const r = runLiveRound(code, sv, c.noise, params, rngRef.current, c.theta, c.phi, c.qecOn);
      const b = runBareRound(bare, c.noise, params, rngRef.current, c.theta, c.phi);

      roundRef.current++;
      if (r.detected) countersRef.current.detected++;
      if (r.correction.x.length || r.correction.z.length) countersRef.current.corrections++;
      if (r.fidelity < 0.5) countersRef.current.failures++;

      histQRef.current.push(r.fidelity);
      histBRef.current.push(b.fidelity);
      if (histQRef.current.length > 2000) histQRef.current.shift();
      if (histBRef.current.length > 2000) histBRef.current.shift();

      vecQRef.current = r.bloch;
      vecBRef.current = b.bloch;
      trailQRef.current.push({ v: { ...r.bloch }, t: roundRef.current });
      trailBRef.current.push({ v: { ...b.bloch }, t: roundRef.current });
      if (trailQRef.current.length > MAX_TRAIL) trailQRef.current.shift();
      if (trailBRef.current.length > MAX_TRAIL) trailBRef.current.shift();

      historyRef.current.push({
        round: roundRef.current,
        fidelity: r.fidelity,
        bareFidelity: b.fidelity,
        events: r.noiseEvents.map((e) => `${e.kind}@q${e.qubit}`),
        detected: r.detected,
        corrected: !!(r.correction.x.length || r.correction.z.length),
      });
      if (historyRef.current.length > 2000) historyRef.current.shift();
    };

    const drawFidelityStrip = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      // mini live fidelity chart (bottom strip) with axis + fail line
      const stripH = 96;
      const x0 = 14, y0 = h - stripH - 10, stripW = Math.min(380, w * 0.48);
      ctx.save();
      ctx.fillStyle = 'rgba(13,10,26,0.78)';
      ctx.strokeStyle = 'rgba(139,92,246,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x0, y0, stripW, stripH, 8);
      ctx.fill();
      ctx.stroke();

      const q = histQRef.current.slice(-240);
      const b = histBRef.current.slice(-240);
      const n = Math.max(q.length, 2);
      const plotX = x0 + 30;
      const plotW = stripW - 38;
      const plotY = y0 + 8;
      const plotH = stripH - 30;

      // fail line at F = 0.5
      ctx.strokeStyle = 'rgba(251,113,133,0.5)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(plotX, plotY + plotH * 0.5);
      ctx.lineTo(plotX + plotW, plotY + plotH * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(251,113,133,0.9)';
      ctx.fillText('50%', x0 + 6, plotY + plotH * 0.5 + 3);
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.fillText('100%', x0 + 6, plotY + 4);

      const line = (arr: number[], color: string, fill: boolean) => {
        if (arr.length < 2) return;
        if (fill) {
          ctx.beginPath();
          ctx.moveTo(plotX, plotY + plotH);
          for (let i = 0; i < arr.length; i++) {
            const x = plotX + (i / (n - 1)) * plotW;
            const y = plotY + (1 - Math.max(0, Math.min(1, arr[i]))) * plotH;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(plotX + ((arr.length - 1) / (n - 1)) * plotW, plotY + plotH);
          ctx.closePath();
          ctx.fillStyle = 'rgba(167,139,250,0.12)';
          ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i++) {
          const x = plotX + (i / (n - 1)) * plotW;
          const y = plotY + (1 - Math.max(0, Math.min(1, arr[i]))) * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      line(b, 'rgba(244,114,182,0.85)', false);
      line(q, 'rgba(167,139,250,0.95)', true);

      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(167,139,250,1)';
      ctx.fillText('F with QEC', x0 + 34, y0 + stripH - 16);
      ctx.fillStyle = 'rgba(244,114,182,1)';
      ctx.fillText('F bare', x0 + 108, y0 + stripH - 16);
      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      ctx.fillText('live fidelity — last rounds', x0 + 34, y0 + stripH - 5);
      ctx.restore();
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
      if (camO.auto) camO.yaw += dt * 0.13; // gentle idle orbit

      // ---- ONE-SHOT physics: play exactly c.rounds rounds, then stop for good
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
          const q = histQRef.current, b = histBRef.current;
          const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 1);
          setHud({
            round: roundRef.current,
            fQEC: q.length ? q[q.length - 1] : 1,
            fBare: b.length ? b[b.length - 1] : 1,
            avgQEC: avg(q),
            avgBare: avg(b),
            corrections: countersRef.current.corrections,
            detected: countersRef.current.detected,
            failures: countersRef.current.failures,
          });
        }
      }

      // smooth vector easing
      const ease = 1 - Math.exp(-dt * 6);
      const lerpV = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * ease, z: a.z + (b.z - a.z) * ease });
      dispQRef.current = lerpV(dispQRef.current, vecQRef.current);
      dispBRef.current = lerpV(dispBRef.current, vecBRef.current);

      // render
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.47;
      const scale = Math.min(w, h) * 0.33;

      drawWireSphere(ctx, camO, cx, cy, scale, 'rgba(134,126,205,0.62)');

      // target pin — the state the flight started from (QEC tries to hold it)
      const tTheta = c.theta, tPhi = c.phi;
      const target: Vec3 = { x: Math.sin(tTheta) * Math.cos(tPhi), y: Math.cos(tTheta), z: Math.sin(tTheta) * Math.sin(tPhi) };
      dot3D(ctx, target, camO, cx, cy, scale, 'rgba(103,232,249,0.28)', 9, 0);
      dot3D(ctx, target, camO, cx, cy, scale, 'rgba(103,232,249,0.95)', 3, 10);
      label3D(ctx, 'target |ψ⟩', { x: target.x * 1.16, y: target.y * 1.16, z: target.z * 1.16 }, camO, cx, cy, scale, 'rgba(103,232,249,0.95)', '10px ui-sans-serif', 6, -6);

      // axes + labels
      const axes: { v: Vec3; label: string }[] = [
        { v: { x: 0, y: 1.18, z: 0 }, label: '|0⟩' },
        { v: { x: 0, y: -1.18, z: 0 }, label: '|1⟩' },
        { v: { x: 1.2, y: 0, z: 0 }, label: '|+⟩' },
        { v: { x: -1.2, y: 0, z: 0 }, label: '|−⟩' },
        { v: { x: 0, y: 0, z: 1.2 }, label: '|+i⟩' },
        { v: { x: 0, y: 0, z: -1.2 }, label: '|−i⟩' },
      ];
      for (const ax of axes) {
        stroke3D(ctx, [{ x: 0, y: 0, z: 0 }, ax.v], camO, cx, cy, scale, 'rgba(100,90,150,0.4)', 0.8, [3, 3]);
        label3D(ctx, ax.label, ax.v, camO, cx, cy, scale, '#8b85ad', '10px monospace', 0, 0);
      }

      // trails — time as color: old = deep violet, recent = cyan (4th dimension)
      const trailColor = (ageFrac: number) => {
        // ageFrac 0 = newest
        const hue = 190 + ageFrac * 75; // cyan(190) → violet(265)
        const light = 72 - ageFrac * 18;
        return `hsla(${hue.toFixed(0)}, 90%, ${light.toFixed(0)}%, ${(0.9 - ageFrac * 0.55).toFixed(2)})`;
      };
      const drawTrail = (trail: { v: Vec3; t: number }[]) => {
        for (let i = 1; i < trail.length; i++) {
          const age = 1 - i / trail.length;
          stroke3D(ctx, [trail[i - 1].v, trail[i].v], camO, cx, cy, scale, trailColor(1 - age), 2.8 - age * 1.4);
        }
        if (trail.length) {
          const newest = trail[trail.length - 1];
          dot3D(ctx, newest.v, camO, cx, cy, scale, 'rgba(103,232,249,0.9)', 2.6, 9);
        }
      };
      drawTrail(trailQRef.current);
      drawTrail(trailBRef.current);

      // round progress on-canvas while playing
      if (phaseRef.current === 'playing') {
        ctx.save();
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(226,232,240,0.92)';
        ctx.fillText(`round ${Math.min(roundRef.current, c.rounds)} / ${c.rounds}`, w - 132, 26);
        ctx.restore();
      }

      // vectors
      drawArrow3D(ctx, dispBRef.current, camO, cx, cy, scale, '#f472b6', 2.2, true);
      drawArrow3D(ctx, dispQRef.current, camO, cx, cy, scale, '#a78bfa', 3);

      // legend + hud strip
      ctx.save();
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(167,139,250,1)';
      ctx.fillText('— logical qubit with QEC', 14, 22);
      ctx.fillStyle = 'rgba(244,114,182,1)';
      ctx.fillText('- - bare qubit (no protection)', 14, 38);
      ctx.fillStyle = 'rgba(103,232,249,0.9)';
      ctx.fillText('trajectory trail: color encodes time (now → past)', 14, 54);
      ctx.restore();

      drawFidelityStrip(ctx, w, h);

      // keep animating ONLY while the flight is playing or the arrows are
      // still settling — once everything is at rest the loop fully stops
      const settled =
        Math.abs(dispQRef.current.x - vecQRef.current.x) < 0.004 &&
        Math.abs(dispQRef.current.y - vecQRef.current.y) < 0.004 &&
        Math.abs(dispQRef.current.z - vecQRef.current.z) < 0.004 &&
        Math.abs(dispBRef.current.x - vecBRef.current.x) < 0.004 &&
        Math.abs(dispBRef.current.y - vecBRef.current.y) < 0.004 &&
        Math.abs(dispBRef.current.z - vecBRef.current.z) < 0.004;
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

  const applyPreset = (label: string) => {
    const pr = STATE_PRESETS.find((s) => s.label === label);
    if (!pr) return;
    setPreset(label);
    if (pr.theta >= 0) {
      setTheta(pr.theta);
      setPhi(pr.phi);
    }
  };

  const exportReport = () => {
    const rows = historyRef.current.slice(-150);
    const code = getSVCode(codeId);
    openPrintableReport(
      { title: 'Bloch Flight 4D — Live QEC Trajectory Experiment', runKind: 'Real-Time 4D Visualizer' },
      [
        {
          heading: 'Inputs',
          kv: [
            ['QEC code', `${code.name} [[${code.n},${code.k},${code.d}]]`],
            ['Noise model', NOISE_LABELS[noise] ?? noise],
            ['Noise strength p', p.toFixed(3)],
            ['Input state', `|ψ⟩, θ = ${theta.toFixed(2)} rad, φ = ${phi.toFixed(2)} rad`],
            ['Correction rounds', qecOn ? 'Enabled every round' : 'DISABLED (raw decoherence observed)'],
            ['Rounds flown', `${hud.round} (one-shot run — stopped at completion)`],
            ['Generated at', nowStamp()],
          ],
        },
        {
          heading: 'Outputs — Trajectory Statistics',
          cards: [
            { label: 'Rounds flown', value: String(hud.round) },
            { label: 'Avg F (with QEC)', value: `${(hud.avgQEC * 100).toFixed(2)}%`, tone: 'good' },
            { label: 'Avg F (bare)', value: `${(hud.avgBare * 100).toFixed(2)}%`, tone: 'bad' },
            { label: 'Corrections', value: String(hud.corrections) },
            { label: 'Severe corruptions', value: String(hud.failures), tone: hud.failures ? 'bad' : 'good' },
          ],
        },
        {
          heading: 'Per-Round Ledger (last 150 rounds)',
          table: {
            headers: ['Round', 'F with QEC', 'F bare', 'Noise events', 'Syndrome', 'Correction'],
            rows: rows.map((r) => [r.round, (r.fidelity * 100).toFixed(2) + '%', (r.bareFidelity * 100).toFixed(2) + '%', r.events.join(' ') || 'none', r.detected ? 'flagged' : 'trivial', r.corrected ? 'applied' : '—']),
          },
          note: 'Each round: noise channel on the encoded block → projective stabilizer measurement → decoder correction → logical readout. The bare-qubit column applies the identical noise to an unprotected qubit.',
        },
        {
          heading: 'Methodology',
          text: `The logical Bloch vector is read out after every round from the logical density matrix (codespace readout for projection-encoded codes; inverse-circuit readout otherwise) without destroying the encoded state, so trajectories continue across rounds. The trail is colored by round index — the fourth dimension — so the full history remains visible on the sphere. Team: ${TEAM_NAMES.join(', ')}.`,
        },
      ]
    );
  };

  const exportJSONData = () => {
    downloadJSON(`bloch-flight-${codeId}-${runId()}.json`, {
      experiment: 'Bloch Flight 4D — live QEC trajectory',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      inputs: { code: codeId, noise, p, theta, phi, qecOn, rounds },
      totals: hud,
      rounds: historyRef.current,
      trailQEC: trailQRef.current.map((pt) => ({ ...pt.v, round: pt.t })),
      trailBare: trailBRef.current.map((pt) => ({ ...pt.v, round: pt.t })),
    });
  };

  const exportCSVData = () => {
    downloadCSV(
      `bloch-flight-${codeId}-${runId()}.csv`,
      ['round', 'fidelityQEC', 'fidelityBare', 'noiseEvents', 'syndromeFlagged', 'corrected'],
      historyRef.current.map((r) => [r.round, r.fidelity.toFixed(6), r.bareFidelity.toFixed(6), r.events.join(' '), r.detected ? 1 : 0, r.corrected ? 1 : 0])
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card className="glass border-white/8">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Bloch Flight Controls</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              A logical qubit flies round after round through real noise + correction cycles. The sphere shows its
              full spacetime history.
            </p>
          </div>
          <GuideField label="QEC Code" info={{ what: 'Which code protects the flying logical qubit. This visualizer uses the full state-vector engine, so the list shows state-vector codes only.', how: 'Pick any — the flight resets and re-encodes. Small codes correct coarsely but fast; Shor [[9,1,3]] and Steane [[7,1,3]] correct more before losing ground.', example: '3-Qubit Bit-Flip survives a single X error in every single round.' }}>
            <Select value={codeId} onValueChange={setCodeId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {SV_CODES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.short} · [[{c.n},{c.k},{c.d}]]</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GuideField>
          <GuideField label="Noise Model" info={{ what: 'The physical disturbance applied EVERY round to all qubits of the block — the same channel also hits the bare comparison qubit.', how: 'Pick one. Bit-flip/phase-flip/depolarizing are random hits; coherent rotation is a systematic tilt; thermal relaxation is realistic hardware decay.', example: 'Bit-Flip at 10%: each round, every qubit independently risks flipping.' }}>
            <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NOISE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GuideField>
          {noise !== 'thermal-relaxation' && noise !== 'coherent-rotation' && (
            <GuideField
              label="Noise strength p"
              info={{ what: 'The per-round probability that each qubit is hit by the selected noise. This drives how violently the trajectory is kicked.', how: 'Drag from 0 to 50%. Around or above 20–30%, most small codes stop coping — watch the violet arrow start to wander.', example: 'p = 0.10 → typically a couple of errors per dozen rounds; the decoder absorbs them.' }}
              hint="How hard each round hits. 10% is a good start."
              right={<span className="font-mono text-violet-300">{p.toFixed(3)}</span>}
            >
              <Slider value={[Math.round(p * 500)]} min={0} max={250} step={1} onValueChange={(v) => setP(v[0] / 500)} />
            </GuideField>
          )}
          {noise === 'coherent-rotation' && (
            <GuideField
              label="Error rotation angle"
              info={{ what: 'A coherent error tilts EVERY qubit by the same angle every round — a miscalibrated gate. The slider sets that angle.', how: 'Small angles (1–15°) are realistic; large angles show coherent errors overpowering the code.', example: '10° per round accumulates fast — watch the syndrome fire every round.' }}
              hint="Same tilt every round."
              right={<span className="font-mono text-violet-300">{rotDeg.toFixed(1)}°</span>}
            >
              <Slider value={[rotDeg]} min={0} max={90} step={0.5} onValueChange={(v) => setRotDeg(v[0])} />
            </GuideField>
          )}
          {noise === 'thermal-relaxation' && (
            <GuideField
              label="T₁ / T₂ (gate times)"
              info={{ what: 'T1 = energy-loss time, T2 = dephasing time, per round. Small values = harsh hardware that decays quickly.', how: 'Set both sliders (T2 is capped at 2×T1, as physics demands).', example: 'T1 = T2 = 5 → the bare qubit loses most of its fidelity within ~10 rounds.' }}
              hint="Decay times per round. Small = harsh."
              right={<span className="font-mono text-violet-300">{t1.toFixed(1)}/{t2.toFixed(1)}</span>}
            >
              <div className="flex flex-col gap-1.5">
                <Slider value={[Math.round(t1 * 4)]} min={2} max={80} step={1} onValueChange={(v) => { const nv = v[0] / 4; setT1(nv); if (t2 > 2 * nv) setT2(2 * nv); }} />
                <Slider value={[Math.round(t2 * 4)]} min={2} max={Math.round(2 * t1 * 4)} step={1} onValueChange={(v) => setT2(v[0] / 4)} />
              </div>
            </GuideField>
          )}
          <GuideField label="Input State |ψ⟩" info={{ what: 'The state the logical qubit starts in, shown as an arrow on the Bloch sphere (θ from the |0⟩ pole, φ around the axis).', how: 'Click a preset or pick Custom and use the two sliders below. The flight re-encodes from this state.', example: '|+i⟩ starts on the equator — a good stress test because both amplitude and phase must survive.' }}>
            <div className="flex flex-wrap gap-1.5">
              {STATE_PRESETS.map((s) => (
                <Button
                  key={s.label}
                  size="sm"
                  variant={preset === s.label ? 'default' : 'outline'}
                  className={preset === s.label ? 'bg-violet-600 hover:bg-violet-500' : 'border-violet-400/30 bg-white/[0.03] text-slate-300'}
                  onClick={() => applyPreset(s.label)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </GuideField>
          <GuideField label="θ polar" info={{ what: 'Polar angle from the |0⟩ pole: 0 = |0⟩, π = |1⟩, π/2 = equator.', how: 'Drag to set the |0⟩/|1⟩ mix of the start state.', example: 'θ = π/3 tilts the arrow 60° from the pole.' }} right={<span className="font-mono text-violet-300">{theta.toFixed(2)} rad</span>}>
            <Slider value={[Math.round((theta / Math.PI) * 100)]} min={0} max={100} step={1} onValueChange={(v) => setTheta((v[0] / 100) * Math.PI)} />
          </GuideField>
          <GuideField label="φ azimuth" info={{ what: 'Azimuth around the vertical axis — the complex phase of the start state.', how: 'Drag to spin the start arrow around the equator.', example: 'φ = π/2 puts the state at |+i⟩.' }} right={<span className="font-mono text-violet-300">{phi.toFixed(2)} rad</span>}>
            <Slider value={[Math.round((phi / (2 * Math.PI)) * 100)]} min={0} max={100} step={1} onValueChange={(v) => setPhi((v[0] / 100) * 2 * Math.PI)} />
          </GuideField>
          <GuideField label="Rounds to run" info={{ what: 'How many noise + correction rounds the flight plays in ONE run. The simulation runs exactly this many rounds and then stops — a complete, bounded experiment, not an endless loop.', how: '20–40 rounds shows the encode → detect → correct loop clearly; 100+ stresses the code long-term. Press Run again any time for a fresh flight with new random noise.', example: '30 rounds at 10% bit-flip noise: several errors hit the block, the decoder catches them, and the violet arrow stays pinned near its target.' }} right={<span className="font-mono text-violet-300">{rounds} rounds</span>}>
            <Slider value={[rounds]} min={10} max={100} step={5} onValueChange={(v) => setRounds(v[0])} />
          </GuideField>
          <GuideField label="QEC correction" info={{ what: 'Turns the decoder on or off for the run. OFF shows raw decoherence — the honest “before” picture with no protection.', how: 'Set it before a run, or flip it mid-run while the flight is playing. With QEC ON the violet arrow snaps back to its target; with OFF it random-walks away like the pink ghost.', example: 'Run 30 rounds with QEC OFF and watch the violet arrow wander — flip ON and run again to watch the decoder drag it home.' }}>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-[11px] text-slate-400">{qecOn ? 'ON — decoder cleans every round' : 'OFF — watching raw decoherence'}</span>
              <Switch checked={qecOn} onCheckedChange={setQecOn} />
            </div>
          </GuideField>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="bg-violet-600 text-white hover:bg-violet-500" onClick={runFlight} disabled={phase === 'playing'}>
              <Play className="mr-1 h-3.5 w-3.5" /> {phase === 'done' ? 'Run again' : 'Run flight'}
            </Button>
            <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300" onClick={reset} disabled={phase === 'playing'}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {phase === 'idle' ? 'idle — press Run flight' : phase === 'playing' ? `running — round ${hud.round} / ${rounds}` : 'complete — simulation stopped'}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'playing' ? 'animate-pulse bg-amber-400' : phase === 'done' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Round" value={String(hud.round)} />
            <StatChip label="Corrections" value={String(hud.corrections)} tone="good" />
          </div>
          <ExportRow onReport={exportReport} onJSON={exportJSONData} onCSV={exportCSVData} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Auto-orbit camera</span>
            <Switch checked={orbit} onCheckedChange={setOrbit} />
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <MousePointer2 className="h-3 w-3" /> drag to orbit · wheel to zoom
          </span>
        </CardContent>
      </Card>

      <Card className="glass-deep overflow-hidden border-white/8">
        <CardContent className="relative p-2">
          <canvas
            ref={canvasRef}
            className="h-[560px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDragKeep}
            onPointerLeave={endDragKeep}
          />
          <Badge className="absolute right-4 top-4 bg-violet-600/25 text-violet-200 hover:bg-violet-600/25">4D · space + time trail</Badge>
          <div className="absolute right-4 top-12 flex flex-col items-end gap-1.5">
            <div className="rounded-lg border border-white/12 bg-black/50 px-3 py-2 text-right backdrop-blur">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">F with QEC (now)</div>
              <div className={`font-mono text-xl font-bold ${(hud.fQEC * 100).toFixed(1) === '100.0' || hud.fQEC > 0.99 ? 'text-emerald-400' : hud.fQEC > 0.9 ? 'text-violet-300' : 'text-rose-400'}`}>
                {(hud.fQEC * 100).toFixed(1)}%
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">F bare (now)</div>
              <div className="font-mono text-sm text-rose-300">{(hud.fBare * 100).toFixed(1)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportRow({ onReport, onJSON, onCSV }: { onReport: () => void; onJSON: () => void; onCSV: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10" onClick={onReport}>
        <FileText className="mr-1 h-3.5 w-3.5" /> Report
      </Button>
      <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10" onClick={onJSON}>
        <Braces className="mr-1 h-3.5 w-3.5" /> JSON
      </Button>
      <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={onCSV}>
        <Braces className="mr-1 h-3.5 w-3.5" /> CSV
      </Button>
    </div>
  );
}

/* ==================================================================== */
/* Lab shell                                                            */
/* ==================================================================== */

const SUBTABS = [
  {
    id: 'flight',
    label: 'Bloch Flight 4D',
    icon: Orbit,
    title: 'Bloch Flight — 4D QEC Trajectory (one-shot run)',
    blurb:
      'A logical qubit flies through a fixed number of noisy rounds, then the flight stops. The colored trail is time itself — the 4th dimension: watch QEC hold the state on its target while the unprotected ghost drifts away.',
    reading: [
      'Violet arrow = protected logical qubit · pink dashed = same noise, no protection.',
      'Trail color = time: cyan is “now”, deep violet is older — the 4th dimension made visible.',
      'Press Run: it plays exactly N rounds once, stops with “complete — stopped”, and you can orbit the result.',
    ],
    tryThis: 'Turn “QEC correction” OFF, run 30 rounds and watch the violet arrow wander off with the pink ghost. Turn it back ON, run again, and watch the decoder pull it home.',
  },
  {
    id: 'city',
    label: 'State Cityscape 3D',
    icon: Boxes,
    title: 'State Cityscape — Live Amplitude City',
    blurb:
      'The encoded block drawn as a real city: one shaded tower per basis state on a proper street grid. Tower height is its probability and its color is the complex phase. Noise grows error towers; every correction cycle flattens the skyline back to the codespace.',
    reading: [
      'Each tower = one basis state |abc…⟩; height = probability, color = complex phase.',
      'A healthy repetition-family state has exactly TWO towers — the all-0 and all-1 codespace pair (cyan rings).',
      'Noise sprouts extra towers (errors); each correction cycle flattens the skyline back to two.',
      'Pick a 5-qubit code and the city grows to 32 live towers — same engine, bigger skyline.',
    ],
    tryThis: 'Raise the noise until a third tower appears, then watch QEC flatten it back — you just watched an error being detected and undone, live in 3D.',
  },
  {
    id: 'spacetime',
    label: 'Spacetime Lattice 4D',
    icon: Network,
    title: 'Spacetime Lattice — 4D Surface-Code Decoding',
    blurb:
      'The surface code in genuine 4 dimensions: a d×d sheet of qubits, one floor per syndrome round, stacked upward through time (up to d = 9 and 16 rounds). Errors accumulate, defect stars light up, and the MWPM decoder draws its matching chains through spacetime — the picture real decoders compute.',
    reading: [
      'Each glowing floor = one syndrome round of the d×d lattice; stacking floors upward IS the 4th dimension.',
      'Stars = syndrome defects (errors); dashed chains = the decoder\u2019s repairs through spacetime.',
      'A red flash marks a logical failure — the decoder paired defects the wrong way and the block restarts.',
    ],
    tryThis: 'Set noise to ~12% with d = 5 and watch matching chains start to mispair — the seeds of logical errors. Drop to 6% and the lattice cleans itself round after round.',
  },
  {
    id: 'terrain',
    label: 'Threshold Terrain 4D',
    icon: LandPlot,
    title: 'Threshold Terrain — 2,500+ Live Experiments (large-scale Monte Carlo)',
    blurb:
      'The big one: thousands of complete surface-code experiments run live in your browser — one bar per (noise level, code size) pair — building a 3-D map of how often each code fails. Watch the famous surface-code threshold appear from raw data: below it, bigger codes win; above it, they stop helping.',
    reading: [
      'Each bar = one measured logical error rate from ~120 complete experiments (2,520+ per run).',
      'Left → right: noise gets stronger. Front → back: code grows from d = 3 to d = 7.',
      'Green bars fail rarely; red bars fail often. The “hill” that flips the ordering is the threshold.',
    ],
    tryThis: 'Run it once and read the verdict line — then switch the noise model to Depolarizing and run again: the threshold moves. You are measuring real research-grade physics, live.',
  },
];

export default function QuantumLab3D() {
  const [sub, setSub] = useState('flight');
  const active = SUBTABS.find((s) => s.id === sub)!;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-slate-100">3D Quantum Lab — Real-Time Simulation Suite</h2>
        <p className="text-sm text-slate-500">
          Four physics-driven 3D/4D visualizers powered by the same verified QEC engine — from a single flying qubit to
          <span className="text-violet-300"> 2,500+ live Monte Carlo experiments</span>. Every simulation is a one-shot
          run: press Run, watch it play through, and it stops when complete. Orbit, zoom and export reports from any of them.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUBTABS.map((s) => {
          const Icon = s.icon;
          const on = s.id === sub;
          return (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium transition-all ${
                on
                  ? 'border-violet-400/60 bg-violet-600/25 text-violet-100 shadow-[0_0_18px_rgba(139,92,246,0.25)]'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-violet-400/40 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl glass border-white/8 px-4 py-3">
        <div className="text-sm font-semibold text-slate-100">{active.title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{active.blurb}</div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {active.reading.map((r) => (
            <div key={r} className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] p-2.5 text-[11px] leading-relaxed text-slate-300">{r}</div>
          ))}
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200/90">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><span className="font-semibold text-amber-200">Try this:</span> {active.tryThis}</span>
        </div>
      </div>

      {sub === 'flight' && <BlochFlight />}
      {sub === 'city' && <StateCityscape />}
      {sub === 'spacetime' && <SpacetimeLab />}
      {sub === 'terrain' && <ThresholdTerrain />}
    </div>
  );
}
