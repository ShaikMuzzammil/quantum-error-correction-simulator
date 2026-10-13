'use client';

/**
 * Advanced live 3D/4D visualizers for the Quantum Lab — all driven by the
 * same verified QEC engine as the rest of the app (no canned animation),
 * all strictly about THIS project's two codes and three noise channels:
 *
 *  - StateCityscape    : live 3-D amplitude cityscape of an encoded
 *                        3-qubit block — watch noise push amplitude into
 *                        error basis states and QEC pull it back.
 *
 *  - SyndromeSpacetime : 4-D spacetime view of the 3-Qubit Bit-Flip code —
 *                        3 data qubits + 2 syndrome checks stacked over T
 *                        correction rounds (time = 4th dimension), with
 *                        noise hits, syndrome defects and decoder
 *                        corrections drawn as they happen.
 *
 *  - BlochSphere3D     : interactive 3-D Bloch sphere walkthrough of the
 *                        pipeline on the logical qubit — input → encode →
 *                        noise → syndrome → correct → decode, with the
 *                        bare-qubit ghost for comparison.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Play, RotateCcw, FileText, Braces, MousePointer2 } from 'lucide-react';
import { makeRng, StateVector, GATES } from '@/lib/qec/engine';
import { getSVCode, SVCodeDef, lookupCorrection } from '@/lib/qec/codes';
import { NoiseModelId, applyNoiseLayer, noiseParams } from '@/lib/qec/noise';
import { prepareEncodedState, runLiveRound, readLogicalBloch } from '@/lib/qec/pipeline';
import {
  Cam, Vec3, useOrbitCam, proj, fitCanvas, stroke3D, dot3D, label3D,
  drawWireSphere, drawArrow3D,
} from './three-d';
import { downloadJSON, downloadCSV, openPrintableReport, runId, nowStamp, TEAM_NAMES } from '@/lib/report';

const NOISE_LABELS: Record<string, string> = {
  bitflip: 'Bit-Flip Noise (X)',
  phaseflip: 'Phase-Flip Noise (Z)',
  depolarizing: 'Depolarizing Noise',
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
    <div className="rounded-lg border border-violet-500/15 bg-[#181430] px-3 py-2">
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

function ExportButtons({ onReport, onJSON, onCSV }: { onReport: () => void; onJSON: () => void; onCSV?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10" onClick={onReport}>
        <FileText className="mr-1 h-3.5 w-3.5" /> Report
      </Button>
      <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10" onClick={onJSON}>
        <Braces className="mr-1 h-3.5 w-3.5" /> JSON
      </Button>
      {onCSV && (
        <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={onCSV}>
          <Braces className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
      )}
    </div>
  );
}

/* ==================================================================== */
/* State Cityscape — live 3D amplitude landscape of an encoded block    */
/* ==================================================================== */

interface CityHistoryRow {
  round: number;
  events: string[];
  detected: boolean;
  corrected: boolean;
  dominant: string;
  dominantProb: number;
}

const BASIS3 = ['|000⟩', '|001⟩', '|010⟩', '|011⟩', '|100⟩', '|101⟩', '|110⟩', '|111⟩'];

export function StateCityscape() {
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
  const { cam, canvasRef, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useOrbitCam({ dist: 3.4 }, () => wakeRef.current());

  const svRef = useRef<ReturnType<typeof prepareEncodedState> | null>(null);
  const rngRef = useRef(makeRng(7));
  const dispRef = useRef(new Float64Array(16)); // lerped [re,im]×8
  const tgtRef = useRef(new Float64Array(16));
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

  const code = getSVCode(codeId);

  const reset = () => {
    svRef.current = prepareEncodedState(code, Math.PI / 3, Math.PI / 5);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot simulation reset on config change
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
        const r = runLiveRound(cdef, sv, c.noise, noiseParams(c.p), rngRef.current, Math.PI / 3, Math.PI / 5);
        events = r.noiseEvents;
        detected = r.detected;
        corrected = r.correction.x.length > 0 || r.correction.z.length > 0;
      } else {
        events = applyNoiseLayer(sv, c.noise, noiseParams(c.p), rngRef.current);
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

    const phaseColor = (re: number, im: number) => {
      const hue = ((Math.atan2(im, re) * 180) / Math.PI + 360) % 360;
      return `hsl(${hue.toFixed(0)}, 85%, 62%)`;
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
          for (let i = 0; i < 8; i++) {
            const pr = dispRef.current[2 * i] ** 2 + dispRef.current[2 * i + 1] ** 2;
            if (pr > domP) { domP = pr; dom = i; }
          }
          if (historyRef.current.length) {
            historyRef.current[historyRef.current.length - 1].dominant = BASIS3[dom];
            historyRef.current[historyRef.current.length - 1].dominantProb = domP;
          }
          setHud({
            round: roundRef.current,
            corrections: correctionsRef.current,
            detected: detectedRef.current,
            dominant: BASIS3[dom],
            dominantProb: domP,
          });
        }
      }

      // ----- targets from live state vector (all 8 amplitudes)
      const data = svRef.current.data;
      for (let i = 0; i < 8; i++) {
        tgtRef.current[2 * i] = data[2 * i];
        tgtRef.current[2 * i + 1] = data[2 * i + 1];
      }
      const k = 1 - Math.exp(-dt * 7);
      for (let i = 0; i < 16; i++) dispRef.current[i] += (tgtRef.current[i] - dispRef.current[i]) * k;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.54;
      const scale = Math.min(w, h) * 0.36;

      // floor grid (Re axis = x, Im axis = z)
      const floorY = -0.78;
      for (let g = -4; g <= 4; g++) {
        const t = g / 4.4;
        stroke3D(ctx, [{ x: t, y: floorY, z: -0.62 }, { x: t, y: floorY, z: 0.62 }], cam.current, cx, cy, scale, 'rgba(96,88,150,0.25)', 0.7);
        stroke3D(ctx, [{ x: -0.62, y: floorY, z: t }, { x: 0.62, y: floorY, z: t }], cam.current, cx, cy, scale, 'rgba(96,88,150,0.25)', 0.7);
      }
      label3D(ctx, 'Re', { x: 0.78, y: floorY, z: 0 }, cam.current, cx, cy, scale, '#67e8f9', '10px monospace', 0, 0);
      label3D(ctx, 'Im', { x: 0, y: floorY, z: -0.78 }, cam.current, cx, cy, scale, '#a78bfa', '10px monospace');

      // amplitude bars — single row of 8 along the Re axis
      const n = 8;
      const spacing = 1.24 / (n - 1);
      const barW = spacing * 0.52;
      for (let i = 0; i < n; i++) {
        const x = -0.62 + i * spacing;
        const re = dispRef.current[2 * i];
        const im = dispRef.current[2 * i + 1];
        const prob = re * re + im * im;
        const height = Math.min(1.9, Math.sqrt(prob) * 2.05);
        const color = phaseColor(re, im);
        const logical = i === 0 || i === 7;

        const y0 = floorY;
        const y1 = floorY + height;
        // 4 bottom corners → 4 top corners (box)
        const corners: Vec3[] = [
          { x: x - barW, y: y0, z: -barW }, { x: x + barW, y: y0, z: -barW },
          { x: x + barW, y: y0, z: barW }, { x: x - barW, y: y0, z: barW },
        ];
        const tCorners = corners.map((cc) => proj(cc.x, y1, cc.z, cam.current, cx, cy, scale));
        const bCorners = corners.map((cc) => proj(cc.x, y0, cc.z, cam.current, cx, cy, scale));

        const face = (a: number, b: number, alpha: number) => {
          ctx.beginPath();
          ctx.moveTo(bCorners[a].x, bCorners[a].y);
          ctx.lineTo(bCorners[b].x, bCorners[b].y);
          ctx.lineTo(tCorners[b].x, tCorners[b].y);
          ctx.lineTo(tCorners[a].x, tCorners[a].y);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(10,8,22,0.65)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        };
        face(0, 1, 0.85);
        face(1, 2, 0.6);
        face(2, 3, 0.4);
        face(3, 0, 0.6);
        // top cap
        ctx.beginPath();
        ctx.moveTo(tCorners[0].x, tCorners[0].y);
        for (let cc = 1; cc < 4; cc++) ctx.lineTo(tCorners[cc].x, tCorners[cc].y);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.stroke();

        if (logical) {
          dot3D(ctx, { x, y: floorY, z: 0 }, cam.current, cx, cy, scale, 'rgba(34,211,238,0.85)', 2.4, 8);
        }

        label3D(ctx, BASIS3[i], { x, y: floorY, z: barW + 0.08 }, cam.current, cx, cy, scale, 'rgba(148,163,184,0.9)', '9px monospace', 0, 4);
        if (prob > 0.004) {
          label3D(ctx, `${(prob * 100).toFixed(prob > 0.1 ? 0 : 1)}%`, { x, y: y1 + 0.05, z: 0 }, cam.current, cx, cy, scale, color, '9px monospace', 0, -2);
        }
      }

      // phase legend
      ctx.save();
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(148,163,184,0.75)';
      ctx.fillText('bar height = |amplitude|   ·   color = phase(arg a)   ·   ○ cyan = logical basis states', 12, h - 12);
      ctx.restore();

      // keep animating ONLY while the run is playing or bars are settling
      let settled = true;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(dispRef.current[i] - tgtRef.current[i]) > 0.004) { settled = false; break; }
      }
      return phaseRef.current === 'playing' || !settled;
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
            ['QEC code', code.name],
            ['[[n,k,d]]', `[[${code.n},${code.k},${code.d}]] (Python QEC ${code.pythonType})`],
            ['Encoding', 'Unitary encoding circuit'],
            ['Noise model', NOISE_LABELS[noise] ?? noise],
            ['Noise strength p', p.toFixed(3)],
            ['Rounds flown', `${hud.round} (one-shot run — stopped at completion)`],
            ['QEC correction', qecOn ? 'ON every round' : 'OFF (raw decoherence observed)'],
            ['Generated at', nowStamp()],
          ],
        },
        {
          heading: 'Outputs — Skyline Statistics',
          cards: [
            { label: 'Rounds flown', value: String(hud.round) },
            { label: 'Syndrome detections', value: String(hud.detected) },
            { label: 'Corrections applied', value: String(hud.corrections), tone: 'good' },
            { label: 'Dominant state now', value: `${hud.dominant} (${(hud.dominantProb * 100).toFixed(1)}%)` },
          ],
        },
        {
          heading: 'Per-Round Ledger (last 120 rounds)',
          table: {
            headers: ['Round', 'Noise events', 'Syndrome', 'Correction', 'Dominant state'],
            rows: rows.map((r) => [r.round, r.events.join(' ') || 'none', r.detected ? 'flagged' : 'trivial', r.corrected ? 'applied' : '—', `${r.dominant} (${(r.dominantProb * 100).toFixed(1)}%)`]),
          },
          note: 'A healthy encoded block keeps exactly two dominant towers (the codespace pair, e.g. |000⟩ and |111⟩); noise sprouts error towers and every correction cycle flattens them back.',
        },
        {
          heading: 'Methodology',
          text: `The encoded state vector of the ${code.name} is kept alive across rounds: each round samples the selected noise channel on all 3 data qubits, measures both stabilizer generators projectively, applies the decoder correction and re-reads all 8 basis amplitudes for the cityscape. Team: ${TEAM_NAMES.join(', ')} — Amrita Vishwa Vidyapeetham.`,
        },
      ]
    );
  };

  const exportJSONData = () => {
    downloadJSON(`state-cityscape-${codeId}-${runId()}.json`, {
      experiment: 'State Cityscape 3D — encoded-block amplitudes',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      institution: 'Amrita Vishwa Vidyapeetham',
      inputs: { code: codeId, noise, p, rounds, qecOn },
      totals: hud,
      rounds: historyRef.current,
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card className="border-violet-500/20 bg-[#141126]">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Cityscape Controls</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              The encoded 3-qubit block drawn as a city of amplitudes. Run a fixed number of correction rounds, then
              the simulation stops.
            </p>
          </div>
          <Field label="QEC Code">
            <Select value={codeId} onValueChange={setCodeId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="code-3bitflip">3-Qubit Bit-Flip · [[3,1,3]]</SelectItem>
                <SelectItem value="code-3phaseflip">3-Qubit Phase-Flip · [[3,1,3]]</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Noise Model">
            <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NOISE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <LabeledSlider label="Noise strength p" value={Math.round(p * 500)} display={p.toFixed(3)} min={0} max={250} step={1} onChange={(v) => setP(v / 500)} />
          <LabeledSlider label="Rounds to run" value={rounds} display={`${rounds} rounds`} min={10} max={60} step={2} onChange={(v) => setRounds(v)} />
          <div className="flex items-center justify-between rounded-lg border border-violet-500/20 px-3 py-2">
            <span className="text-[11px] text-slate-400">{qecOn ? 'QEC ON — decoder cleans every round' : 'QEC OFF — raw decoherence'}</span>
            <Switch checked={qecOn} onCheckedChange={setQecOn} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="bg-violet-600 text-white hover:bg-violet-500" onClick={runCity} disabled={phase === 'playing'}>
              <Play className="mr-1 h-3.5 w-3.5" /> {phase === 'done' ? 'Run again' : 'Run city'}
            </Button>
            <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300" onClick={reset} disabled={phase === 'playing'}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-violet-500/20 px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {phase === 'idle' ? 'idle — press Run city' : phase === 'playing' ? `running — round ${hud.round} / ${rounds}` : 'complete — simulation stopped'}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'playing' ? 'animate-pulse bg-amber-400' : phase === 'done' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Round" value={String(hud.round)} />
            <StatChip label="Corrections" value={String(hud.corrections)} tone="good" />
            <StatChip label="Dominant" value={hud.dominant} />
            <StatChip label="Dominant prob" value={`${(hud.dominantProb * 100).toFixed(1)}%`} />
          </div>
          <ExportButtons onReport={exportReport} onJSON={exportJSONData} />
          <OrbitHint />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-violet-500/20 bg-gradient-to-b from-[#0e0b1e] to-[#130f28]">
        <CardContent className="relative p-2">
          <canvas
            ref={canvasRef}
            className="h-[560px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
          <Badge className="absolute right-4 top-4 bg-violet-600/25 text-violet-200 hover:bg-violet-600/25">3D · live amplitudes</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

/* ==================================================================== */
/* Syndrome Spacetime 4D — the 3-Qubit Bit-Flip code over time          */
/* ==================================================================== */

interface StRound {
  round: number;
  xHits: number[];        // qubits hit by X (or Y) noise this round
  syndrome: [number, number];
  correction: number;     // qubit corrected, -1 = none
  logicalFail: boolean;
  fidelity: number;
}

const WIRE_LABELS = ['q0', 'q1', 'q2', 'Z0Z1', 'Z1Z2'];

export function SyndromeSpacetime() {
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.1);
  const [rounds, setRounds] = useState(14);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [hud, setHud] = useState({ round: 0, defects: 0, corrections: 0, failures: 0, fidelity: 1 });

  const rafRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const phaseRef = useRef<'idle' | 'playing' | 'done'>('idle');
  const { cam, canvasRef, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useOrbitCam({ dist: 3.6, pitch: 0.5 }, () => wakeRef.current());

  const svRef = useRef<ReturnType<typeof prepareEncodedState> | null>(null);
  const codeRef = useRef<SVCodeDef>(getSVCode('code-3bitflip'));
  const rngRef = useRef(makeRng(11));
  const roundRef = useRef(0);
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const historyRef = useRef<StRound[]>([]);
  const cfgRef = useRef({ noise, p, rounds });
  const countersRef = useRef({ defects: 0, corrections: 0, failures: 0 });

  useEffect(() => {
    cfgRef.current = { noise, p, rounds };
  }, [noise, p, rounds]);

  const reset = () => {
    codeRef.current = getSVCode('code-3bitflip');
    svRef.current = prepareEncodedState(codeRef.current, 0, 0); // protect |0⟩
    rngRef.current = makeRng(11 + Math.floor(Math.random() * 1e6));
    roundRef.current = 0;
    historyRef.current = [];
    countersRef.current = { defects: 0, corrections: 0, failures: 0 };
    phaseRef.current = 'idle';
    setPhase('idle');
    setHud({ round: 0, defects: 0, corrections: 0, failures: 0, fidelity: 1 });
    wakeRef.current();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot simulation reset on mount
    reset();
  }, []);

  const runSt = () => {
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
      const r = runLiveRound(codeRef.current, sv, c.noise, noiseParams(c.p), rngRef.current, 0, 0, true);
      const xHits = r.noiseEvents.filter((e) => e.kind === 'X' || e.kind === 'Y').map((e) => e.qubit);
      const correction = r.correction.x.length > 0 ? r.correction.x[0] : -1;
      rowRef.current = {
        round: roundRef.current + 1,
        xHits,
        syndrome: [r.syndrome[0]?.bit ?? 0, r.syndrome[1]?.bit ?? 0],
        correction,
        logicalFail: r.fidelity < 0.5,
        fidelity: r.fidelity,
      };
      historyRef.current.push(rowRef.current);
      if (historyRef.current.length > 400) historyRef.current.shift();
      roundRef.current++;
      if (rowRef.current.syndrome[0] || rowRef.current.syndrome[1]) countersRef.current.defects++;
      if (correction >= 0) countersRef.current.corrections++;
      if (rowRef.current.logicalFail) countersRef.current.failures++;
    };
    const rowRef = { current: null as StRound | null };

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

      if (phaseRef.current === 'playing') {
        accRef.current += dt;
        const interval = 1 / 2.5; // 2.5 rounds per second — readable spacetime growth
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
          const last = historyRef.current[historyRef.current.length - 1];
          setHud({
            round: roundRef.current,
            defects: countersRef.current.defects,
            corrections: countersRef.current.corrections,
            failures: countersRef.current.failures,
            fidelity: last ? last.fidelity : 1,
          });
        }
      }

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.52;
      const scale = Math.min(w, h) * 0.34;
      const hist = historyRef.current;
      const T = Math.max(hist.length, 1);
      const H = 1.55; // total height of the stack
      const yOfRound = (r: number) => -0.75 + (r / Math.max(c.rounds, 1)) * H;
      const xOfWire = (wire: number) => (wire - 2) * 0.62; // 5 wires: q0 q1 q2 Z0Z1 Z1Z2
      const zData = -0.28;
      const zCheck = 0.42;

      // base grid
      stroke3D(ctx, [{ x: xOfWire(0) - 0.3, y: -0.75, z: 0 }, { x: xOfWire(4) + 0.3, y: -0.75, z: 0 }], cam.current, cx, cy, scale, 'rgba(96,88,150,0.35)', 1);
      stroke3D(ctx, [{ x: xOfWire(0) - 0.3, y: yOfRound(c.rounds), z: 0 }, { x: xOfWire(4) + 0.3, y: yOfRound(c.rounds), z: 0 }], cam.current, cx, cy, scale, 'rgba(96,88,150,0.2)', 0.8, [4, 3]);

      // wire worldlines through all flown rounds
      for (let wire = 0; wire < 5; wire++) {
        const z = wire < 3 ? zData : zCheck;
        stroke3D(
          ctx,
          [{ x: xOfWire(wire), y: -0.75, z }, { x: xOfWire(wire), y: yOfRound(T), z }],
          cam.current, cx, cy, scale,
          wire < 3 ? 'rgba(139,92,246,0.4)' : 'rgba(34,211,238,0.3)',
          1, [6, 4]
        );
      }
      // wire labels at the base
      for (let wire = 0; wire < 5; wire++) {
        label3D(ctx, WIRE_LABELS[wire], { x: xOfWire(wire), y: -0.86, z: wire < 3 ? zData : zCheck }, cam.current, cx, cy, scale, wire < 3 ? '#a78bfa' : '#67e8f9', '10px monospace', 0, 0);
      }
      label3D(ctx, 'time ↑', { x: xOfWire(4) + 0.55, y: yOfRound(T) + 0.06, z: 0 }, cam.current, cx, cy, scale, '#8b85ad', '10px monospace', 0, 0);

      // per-round markers
      for (const r of hist) {
        const y = yOfRound(r.round - 1);
        // logical failure = red translucent floor
        if (r.logicalFail) {
          const corners: Vec3[] = [
            { x: xOfWire(0) - 0.3, y, z: -0.5 }, { x: xOfWire(4) + 0.3, y, z: -0.5 },
            { x: xOfWire(4) + 0.3, y, z: 0.6 }, { x: xOfWire(0) - 0.3, y, z: 0.6 },
          ];
          ctx.beginPath();
          const pts = corners.map((cc) => proj(cc.x, cc.y, cc.z, cam.current, cx, cy, scale));
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(244,63,94,0.16)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(244,63,94,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        // noise hits on data wires
        for (const q of r.xHits) {
          dot3D(ctx, { x: xOfWire(q), y, z: zData }, cam.current, cx, cy, scale, 'rgba(251,113,133,0.95)', 3.4, 9);
        }
        // syndrome defects on check wires
        if (r.syndrome[0]) dot3D(ctx, { x: xOfWire(3), y, z: zCheck }, cam.current, cx, cy, scale, 'rgba(251,191,36,0.95)', 4, 12);
        if (r.syndrome[1]) dot3D(ctx, { x: xOfWire(4), y, z: zCheck }, cam.current, cx, cy, scale, 'rgba(251,191,36,0.95)', 4, 12);
        // correction ring on the data wire
        if (r.correction >= 0) {
          dot3D(ctx, { x: xOfWire(r.correction), y, z: zData }, cam.current, cx, cy, scale, 'rgba(74,222,128,0.95)', 4.4, 12);
        }
      }

      // legend
      ctx.save();
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(251,113,133,1)';
      ctx.fillText('● noise hit (X)', 14, 22);
      ctx.fillStyle = 'rgba(251,191,36,1)';
      ctx.fillText('● syndrome defect', 130, 22);
      ctx.fillStyle = 'rgba(74,222,128,1)';
      ctx.fillText('● decoder correction', 258, 22);
      ctx.fillStyle = 'rgba(244,63,94,0.85)';
      ctx.fillText('▨ logical-failure round', 396, 22);
      ctx.restore();

      return phaseRef.current === 'playing';
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
    const rows = historyRef.current.slice(-150);
    openPrintableReport(
      { title: 'Syndrome Spacetime 4D — 3-Qubit Bit-Flip Code Over Time', runKind: 'Real-Time 4D Visualizer' },
      [
        {
          heading: 'Inputs',
          kv: [
            ['QEC code', '3-Qubit Bit-Flip Code [[3,1,3]] (Python QEC 1)'],
            ['Protected state', "|0⟩ (X errors are the code's target)"],
            ['Noise model', NOISE_LABELS[noise] ?? noise],
            ['Noise strength p', p.toFixed(3)],
            ['Rounds flown', `${hud.round} (one-shot run — stopped at completion)`],
            ['Generated at', nowStamp()],
          ],
        },
        {
          heading: 'Outputs — Spacetime Statistics',
          cards: [
            { label: 'Rounds flown', value: String(hud.round) },
            { label: 'Rounds with defects', value: String(hud.defects) },
            { label: 'Corrections applied', value: String(hud.corrections), tone: 'good' },
            { label: 'Logical failures', value: String(hud.failures), tone: hud.failures ? 'bad' : 'good' },
          ],
        },
        {
          heading: 'Per-Round Ledger (last 150 rounds)',
          table: {
            headers: ['Round', 'X noise hits', 'Syndrome (Z0Z1, Z1Z2)', 'Correction', 'Logical F'],
            rows: rows.map((r) => [
              r.round,
              r.xHits.length ? r.xHits.map((q) => `q${q}`).join(' ') : 'none',
              `${r.syndrome[0]}${r.syndrome[1]}`,
              r.correction >= 0 ? `X on q${r.correction}` : '—',
              (r.fidelity * 100).toFixed(2) + '%',
            ]),
          },
          note: 'Each round applies the same pipeline as the Python file: noise on the data qubits → syndrome checks (q3, q4) → conditional X correction → readout. Time stacks upward — the fourth dimension.',
        },
        {
          heading: 'Methodology',
          text: `The encoded block stays alive across rounds; every round samples fresh noise, measures both Z-parity stabilizers projectively and applies the decoder correction. Logical failures (red floors) are rounds where the fidelity collapsed below 50% — caused by multi-error patterns beyond the code's distance. Team: ${TEAM_NAMES.join(', ')} — Amrita Vishwa Vidyapeetham.`,
        },
      ]
    );
  };

  const exportJSONData = () => {
    downloadJSON(`syndrome-spacetime-${runId()}.json`, {
      experiment: 'Syndrome Spacetime 4D — bit-flip code over rounds',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      institution: 'Amrita Vishwa Vidyapeetham',
      inputs: { code: 'code-3bitflip', noise, p, rounds },
      totals: hud,
      rounds: historyRef.current,
    });
  };

  const exportCSVData = () => {
    downloadCSV(
      `syndrome-spacetime-${runId()}.csv`,
      ['round', 'xHits', 'syndromeZ0Z1', 'syndromeZ1Z2', 'correctionQubit', 'logicalFail', 'fidelity'],
      historyRef.current.map((r) => [r.round, r.xHits.join(' '), r.syndrome[0], r.syndrome[1], r.correction, r.logicalFail ? 1 : 0, r.fidelity.toFixed(6)])
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card className="border-violet-500/20 bg-[#141126]">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Spacetime Controls</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              The 3-Qubit Bit-Flip code protecting |0⟩, round after round. Wires run left-right; correction rounds
              stack upward — that stacking is the 4th dimension.
            </p>
          </div>
          <Field label="Noise Model">
            <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NOISE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <LabeledSlider label="Noise strength p" value={Math.round(p * 500)} display={p.toFixed(3)} min={0} max={300} step={1} onChange={(v) => setP(v / 500)} />
          <LabeledSlider label="Rounds to run" value={rounds} display={`${rounds} rounds`} min={6} max={30} step={1} onChange={(v) => setRounds(v)} />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="bg-violet-600 text-white hover:bg-violet-500" onClick={runSt} disabled={phase === 'playing'}>
              <Play className="mr-1 h-3.5 w-3.5" /> {phase === 'done' ? 'Run again' : 'Run spacetime'}
            </Button>
            <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300" onClick={reset} disabled={phase === 'playing'}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-violet-500/20 px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {phase === 'idle' ? 'idle — press Run spacetime' : phase === 'playing' ? `building — round ${hud.round} / ${rounds}` : 'complete — simulation stopped'}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'playing' ? 'animate-pulse bg-amber-400' : phase === 'done' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Round" value={String(hud.round)} />
            <StatChip label="Defect rounds" value={String(hud.defects)} />
            <StatChip label="Corrections" value={String(hud.corrections)} tone="good" />
            <StatChip label="Failures" value={String(hud.failures)} tone={hud.failures ? 'bad' : 'good'} />
          </div>
          <ExportButtons onReport={exportReport} onJSON={exportJSONData} onCSV={exportCSVData} />
          <OrbitHint />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-violet-500/20 bg-gradient-to-b from-[#0e0b1e] to-[#130f28]">
        <CardContent className="relative p-2">
          <canvas
            ref={canvasRef}
            className="h-[560px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
          <Badge className="absolute right-4 top-4 bg-cyan-600/25 text-cyan-200 hover:bg-cyan-600/25">4D · wires × rounds</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

/* ==================================================================== */
/* Bloch Sphere 3D — interactive pipeline walkthrough on the logical qubit */
/* ==================================================================== */

interface StageSnapshot {
  stage: string;
  detail: string;
  bloch: Vec3;
  fidelity: number;
}

const STAGE_NAMES = ['Input |ψ⟩', 'Encoded', 'After noise', 'Syndrome', 'Corrected', 'Decoded'];

export function BlochSphere3D() {
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.15);
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(Math.PI / 5);
  const [qecOn, setQecOn] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [hud, setHud] = useState({ stage: '—', detail: 'Press Run to walk the pipeline.', fidelity: 1, syndrome: '—', correction: '—' });

  const rafRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const { cam, canvasRef, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useOrbitCam({ dist: 3.0 }, () => wakeRef.current());

  const snapsRef = useRef<StageSnapshot[]>([]);
  const ghostSnapsRef = useRef<StageSnapshot[]>([]);
  const dispRef = useRef<Vec3>({ x: 0, y: 1, z: 0 });
  const dispGRef = useRef<Vec3>({ x: 0, y: 1, z: 0 });
  const stageIdxRef = useRef(-1);
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const syndromeRef = useRef<string>('—');
  const correctionRef = useRef<string>('—');
  const cfgRef = useRef({ noise, p, theta, phi, qecOn });

  useEffect(() => {
    cfgRef.current = { noise, p, theta, phi, qecOn };
  }, [noise, p, theta, phi, qecOn]);

  // keep the rAF loop's view of phase in sync with React state
  const phaseStateRef = useRef<'idle' | 'playing' | 'done'>('idle');
  useEffect(() => {
    phaseStateRef.current = phase;
  }, [phase]);

  const reset = () => {
    snapsRef.current = [];
    ghostSnapsRef.current = [];
    stageIdxRef.current = -1;
    accRef.current = 0;
    syndromeRef.current = '—';
    correctionRef.current = '—';
    const v: Vec3 = { x: Math.sin(cfgRef.current.theta) * Math.cos(cfgRef.current.phi), y: Math.cos(cfgRef.current.theta), z: Math.sin(cfgRef.current.theta) * Math.sin(cfgRef.current.phi) };
    dispRef.current = { ...v };
    dispGRef.current = { ...v };
    setPhase('idle');
    setHud({ stage: '—', detail: 'Press Run to walk the pipeline.', fidelity: 1, syndrome: '—', correction: '—' });
    wakeRef.current();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot simulation reset on mount
    reset();
  }, []);

  const run = () => {
    // ---- build the full pipeline snapshots up-front (deterministic one-shot)
    const c = cfgRef.current;
    const code = getSVCode('code-3bitflip');
    const rng = makeRng(Math.floor(Math.random() * 1e9));
    const snaps: StageSnapshot[] = [];
    const ghosts: StageSnapshot[] = [];

    // engine Bloch vector (standard maths coords: z = |0>/|1> axis)
    const blochOf = (rho: number[]): { x: number; y: number; z: number } => {
      const b = { x: 2 * rho[2], y: -2 * rho[3], z: rho[0] - rho[6] };
      const n = Math.hypot(b.x, b.y, b.z) || 1;
      return { x: b.x / n, y: b.y / n, z: b.z / n };
    };
    // scene mapping: Bloch z (|0>) points UP on screen; scene y = up
    const toScene = (b: { x: number; y: number; z: number }): Vec3 => ({ x: b.x, y: b.z, z: -b.y });

    // bare qubit timeline
    const bare = new StateVector(1);
    bare.prepareQubit0(c.theta, c.phi);
    ghosts.push({ stage: 'Input |ψ⟩', detail: 'bare qubit', bloch: toScene(blochOf(bare.partialTraceQ0())), fidelity: 1 });

    // logical timeline
    const sv = new StateVector(code.n);
    sv.prepareQubit0(c.theta, c.phi);
    snaps.push({ stage: 'Input |ψ⟩', detail: 'logical qubit before encoding', bloch: toScene(readLogicalBloch(code, sv, c.theta, c.phi).bloch), fidelity: 1 });

    // encode
    for (const op of code.encoding) sv.applyGateOp(op.gate, op.qubits, op.param);
    snaps.push({ stage: 'Encoded', detail: 'α|000⟩ + β|111⟩ codespace', bloch: toScene(readLogicalBloch(code, sv, c.theta, c.phi).bloch), fidelity: 1 });

    // noise (on the whole block / on the bare qubit with the same rng stream)
    applyNoiseLayer(sv, c.noise, noiseParams(c.p), rng);
    const bareEvents = applyNoiseLayer(bare, c.noise, noiseParams(c.p), rng);
    snaps.push({ stage: 'After noise', detail: 'sampled channel hit the block', bloch: toScene(readLogicalBloch(code, sv, c.theta, c.phi).bloch), fidelity: readLogicalBloch(code, sv, c.theta, c.phi).fidelity });
    ghosts.push({ stage: 'After noise', detail: `${bareEvents.length} hit(s)`, bloch: toScene(blochOf(bare.partialTraceQ0())), fidelity: 0 });

    // syndrome
    const bits: number[] = [];
    for (const st of code.stabilizers) {
      const { outcome } = sv.measurePauli(st.paulis, rng, false);
      bits.push(outcome === -1 ? 1 : 0);
    }
    syndromeRef.current = `${bits[0]}${bits[1]}`;
    snaps.push({ stage: 'Syndrome', detail: `Z0Z1=${bits[0]}  Z1Z2=${bits[1]}`, bloch: snaps[snaps.length - 1].bloch, fidelity: snaps[snaps.length - 1].fidelity });

    // correction — via the engine's syndrome→correction table (single source of truth)
    let corr = '—';
    if (c.qecOn && (bits[0] || bits[1])) {
      const dec = lookupCorrection(code, bits);
      if (dec.x.length > 0) {
        sv.applyGate1(dec.x[0], GATES.X);
        corr = `X on q${dec.x[0]}`;
      } else if (dec.z.length > 0) {
        sv.applyGate1(dec.z[0], GATES.Z);
        corr = `Z on q${dec.z[0]}`;
      }
    } else if (!c.qecOn) {
      corr = 'skipped (QEC OFF)';
    }
    correctionRef.current = corr;
    const afterC = readLogicalBloch(code, sv, c.theta, c.phi);
    snaps.push({ stage: 'Corrected', detail: corr, bloch: toScene(afterC.bloch), fidelity: afterC.fidelity });

    // decode
    for (const op of code.decoding) sv.applyGateOp(op.gate, op.qubits, op.param);
    const rho = sv.partialTraceQ0();
    const cth = Math.cos(c.theta / 2), sth = Math.sin(c.theta / 2);
    const term = rho[2] * Math.cos(c.phi) - rho[3] * Math.sin(c.phi);
    const fid = cth * cth * rho[0] + sth * sth * rho[6] + 2 * cth * sth * term;
    snaps.push({ stage: 'Decoded', detail: 'pipeline complete', bloch: toScene(blochOf(rho)), fidelity: fid });

    snapsRef.current = snaps;
    ghostSnapsRef.current = ghosts;
    stageIdxRef.current = 0;
    accRef.current = 0;
    setPhase('playing');
    wakeRef.current();
  };

  useEffect(() => {
    lastRef.current = performance.now();

    const draw = () => {
      const cv = canvasRef.current;
      if (!cv) return phaseStateRef.current === 'playing';
      const fit = fitCanvas(cv);
      if (!fit) return phaseStateRef.current === 'playing';
      const { w, h, ctx } = fit;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;

      const snaps = snapsRef.current;
      const ghosts = ghostSnapsRef.current;

      // ---- stage playback: advance every 1.1 s
      if (phaseStateRef.current === 'playing' && snaps.length > 0) {
        accRef.current += dt;
        if (accRef.current > 1.1) {
          accRef.current = 0;
          stageIdxRef.current++;
          if (stageIdxRef.current >= snaps.length) {
            stageIdxRef.current = snaps.length - 1;
            phaseStateRef.current = 'done';
            setPhase('done');
          }
          const s = snaps[stageIdxRef.current];
          setHud({
            stage: s.stage,
            detail: s.detail,
            fidelity: s.fidelity,
            syndrome: syndromeRef.current,
            correction: correctionRef.current,
          });
        }
      }

      // targets
      const idx = Math.max(0, stageIdxRef.current);
      const tgtQ = snaps[idx]?.bloch ?? { x: 0, y: 1, z: 0 };
      const tgtB = ghosts[Math.min(idx, ghosts.length - 1)]?.bloch ?? tgtQ;
      const k = 1 - Math.exp(-dt * 6);
      const lerp = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
      dispRef.current = lerp(dispRef.current, tgtQ);
      dispGRef.current = lerp(dispGRef.current, tgtB);

      // render
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.47;
      const scale = Math.min(w, h) * 0.33;
      const camO = cam.current as Cam;

      drawWireSphere(ctx, camO, cx, cy, scale);

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

      // past stage markers (faded)
      for (let i = 0; i < idx; i++) {
        dot3D(ctx, snaps[i].bloch, camO, cx, cy, scale, 'rgba(167,139,250,0.35)', 3, 0);
        label3D(ctx, snaps[i].stage, snaps[i].bloch, camO, cx, cy, scale, 'rgba(167,139,250,0.55)', '9px monospace', 6, -4);
      }
      // ghost markers
      for (let i = 0; i < Math.min(idx + 1, ghosts.length); i++) {
        if (ghosts[i].stage !== 'Input |ψ⟩') {
          dot3D(ctx, ghosts[i].bloch, camO, cx, cy, scale, 'rgba(244,114,182,0.5)', 2.6, 0);
        }
      }

      // main vectors
      drawArrow3D(ctx, dispGRef.current, camO, cx, cy, scale, '#f472b6', 2.2, true);
      drawArrow3D(ctx, dispRef.current, camO, cx, cy, scale, '#a78bfa', 3);

      // legend
      ctx.save();
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(167,139,250,1)';
      ctx.fillText('— logical qubit (this pipeline stage)', 14, 22);
      ctx.fillStyle = 'rgba(244,114,182,1)';
      ctx.fillText('- - bare qubit ghost (same noise, no protection)', 14, 38);
      ctx.restore();

      const settled =
        Math.abs(dispRef.current.x - tgtQ.x) < 0.004 &&
        Math.abs(dispRef.current.y - tgtQ.y) < 0.004 &&
        Math.abs(dispRef.current.z - tgtQ.z) < 0.004;
      return phaseStateRef.current === 'playing' || !settled;
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
    const snaps = snapsRef.current;
    openPrintableReport(
      { title: 'Bloch Sphere 3D — Logical-Qubit Pipeline Walkthrough', runKind: 'Interactive 3D Visualizer' },
      [
        {
          heading: 'Inputs',
          kv: [
            ['QEC code', '3-Qubit Bit-Flip Code [[3,1,3]] (Python QEC 1)'],
            ['Input state', `|ψ⟩ at θ = ${cfgRef.current.theta.toFixed(2)} rad, φ = ${cfgRef.current.phi.toFixed(2)} rad`],
            ['Noise model', NOISE_LABELS[cfgRef.current.noise] ?? cfgRef.current.noise],
            ['Noise strength p', cfgRef.current.p.toFixed(3)],
            ['QEC correction', cfgRef.current.qecOn ? 'ON' : 'OFF'],
            ['Generated at', nowStamp()],
          ],
        },
        {
          heading: 'Outputs — Stage-by-Stage Logical State',
          table: {
            headers: ['Stage', 'Detail', 'Logical fidelity'],
            rows: snaps.map((s) => [s.stage, s.detail, (s.fidelity * 100).toFixed(2) + '%']),
          },
          note: snaps.length ? `Final syndrome: ${syndromeRef.current} · Correction: ${correctionRef.current}.` : 'Run the pipeline first.',
        },
        {
          heading: 'Methodology',
          text: `Each stage snapshot decodes a CLONE of the live encoded state to read the logical Bloch vector without destroying the pipeline — encode, noise, projective syndrome measurement, conditional correction and final decode all run on the real engine. The pink ghost is a bare qubit hit by the same noise stream. Team: ${TEAM_NAMES.join(', ')} — Amrita Vishwa Vidyapeetham.`,
        },
      ]
    );
  };

  const exportJSONData = () => {
    downloadJSON(`bloch-sphere3d-${runId()}.json`, {
      experiment: 'Bloch Sphere 3D — pipeline walkthrough',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      institution: 'Amrita Vishwa Vidyapeetham',
      inputs: cfgRef.current,
      syndrome: syndromeRef.current,
      correction: correctionRef.current,
      stages: snapsRef.current,
      bareGhost: ghostSnapsRef.current,
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card className="border-violet-500/20 bg-[#141126]">
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Bloch Sphere Controls</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Watch the logical qubit move through every pipeline stage on a real 3D Bloch sphere — one arrow per
              stage, bare-qubit ghost alongside.
            </p>
          </div>
          <Field label="Noise Model">
            <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NOISE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <LabeledSlider label="Noise strength p" value={Math.round(p * 500)} display={p.toFixed(3)} min={0} max={300} step={1} onChange={(v) => setP(v / 500)} />
          <LabeledSlider label="θ polar angle" value={Math.round((theta / Math.PI) * 100)} display={`${theta.toFixed(2)} rad`} min={0} max={100} step={1} onChange={(v) => setTheta((v / 100) * Math.PI)} />
          <LabeledSlider label="φ azimuth" value={Math.round((phi / (2 * Math.PI)) * 100)} display={`${phi.toFixed(2)} rad`} min={0} max={100} step={1} onChange={(v) => setPhi((v / 100) * 2 * Math.PI)} />
          <div className="flex items-center justify-between rounded-lg border border-violet-500/20 px-3 py-2">
            <span className="text-[11px] text-slate-400">{qecOn ? 'QEC ON — decoder corrects' : 'QEC OFF — noise stays'}</span>
            <Switch checked={qecOn} onCheckedChange={setQecOn} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="bg-violet-600 text-white hover:bg-violet-500" onClick={run} disabled={phase === 'playing'}>
              <Play className="mr-1 h-3.5 w-3.5" /> {phase === 'done' ? 'Run again' : 'Run pipeline'}
            </Button>
            <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300" onClick={reset} disabled={phase === 'playing'}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-violet-500/20 px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {phase === 'idle' ? 'idle — press Run pipeline' : phase === 'playing' ? `playing — ${hud.stage}` : 'complete — simulation stopped'}
            </span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'playing' ? 'animate-pulse bg-amber-400' : phase === 'done' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </div>
          <div className="rounded-lg border border-violet-500/15 bg-[#181430] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Current stage</div>
            <div className="font-mono text-sm font-semibold text-violet-300">{hud.stage}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{hud.detail}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Syndrome" value={hud.syndrome} />
            <StatChip label="Correction" value={hud.correction} tone="good" />
          </div>
          <StatChip label="Logical fidelity (now)" value={`${(hud.fidelity * 100).toFixed(2)}%`} tone={hud.fidelity > 0.99 ? 'good' : hud.fidelity > 0.9 ? 'neutral' : 'bad'} />
          <ExportButtons onReport={exportReport} onJSON={exportJSONData} />
          <OrbitHint />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-violet-500/20 bg-gradient-to-b from-[#0e0b1e] to-[#130f28]">
        <CardContent className="relative p-2">
          <canvas
            ref={canvasRef}
            className="h-[560px] w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
          <Badge className="absolute right-4 top-4 bg-fuchsia-600/25 text-fuchsia-200 hover:bg-fuchsia-600/25">3D · interactive Bloch sphere</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
