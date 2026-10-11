'use client';

/**
 * Simulator Lab: single-shot QEC pipeline visualization.
 * State-vector codes show the full pipeline (encode → noise → syndrome →
 * correct → decode → measure); surface codes show the lattice with
 * click-to-inject error teaching mode.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Play, Dices, Zap, CircleCheck, CircleX, Info, FileText, Braces, Cpu, ScanSearch, Wand2, CornerDownLeft, Target, RotateCcw } from 'lucide-react';
import { runTrace, ShotTrace } from '@/lib/qec/pipeline';
import { getSVCode } from '@/lib/qec/codes';
import { NoiseModelId, NoiseParams, noiseParams } from '@/lib/qec/noise';
import { CODE_REGISTRY, getCodeMeta } from '@/lib/qec/registry';
import { runSurfaceShot, SurfaceNoise } from '@/lib/qec/surface';
import { makeRng } from '@/lib/qec/engine';
import { downloadJSON, downloadCSV, openPrintableReport, runId, nowStamp, TEAM_NAMES } from '@/lib/report';
import BlochSphere from './BlochSphere';
import CircuitDiagram from './CircuitDiagram';
import SurfaceGrid, { CellState } from './SurfaceGrid';
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

const STATE_PRESETS = [
  { label: '|0⟩', theta: 0, phi: 0 },
  { label: '|1⟩', theta: Math.PI, phi: 0 },
  { label: '|+⟩', theta: Math.PI / 2, phi: 0 },
  { label: '|−⟩', theta: Math.PI / 2, phi: Math.PI },
  { label: '|+i⟩', theta: Math.PI / 2, phi: Math.PI / 2 },
  { label: 'Custom', theta: -1, phi: -1 },
];

/* ---------------- simple-language guides for every input (v3) ---------------- */

const CODE_INFO: GuideInfo = {
  what: "A quantum error correction (QEC) code spreads ONE logical qubit's information across several physical qubits, so hardware errors can be detected and undone. The label [[n,k,d]] means: n = physical qubits used, k = logical qubits protected, d = code distance — the code fixes any ⌊(d−1)/2⌋ errors.",
  how: "Pick any code from the dropdown — every one runs live in your browser. New here? Start with '3-Qubit Bit-Flip', the same code as the Phase-1 worked example. Codes marked 'surface' switch to a 2-D lattice engine with a matching decoder.",
  example: 'Choosing 3-Qubit Bit-Flip [[3,1,3]] uses 3 physical qubits to protect 1 logical qubit and can fix any single bit-flip (X) error.',
};

const NOISE_INFO: GuideInfo = {
  what: 'The physical disturbance applied to your qubits. Real quantum hardware is never perfect: values flip (bit-flip X), phases flip (Z), energy leaks to the environment (amplitude damping), or errors arrive mixed (depolarizing). This simulator implements 8 channels.',
  how: "Choose a channel — the list only shows models compatible with the selected code (surface codes support Pauli-type noise only). Not sure? Keep Bit-Flip (X): it is the classic, easiest-to-follow example.",
  example: 'Bit-Flip (X) at 10%: on every shot, each qubit independently has a 10% chance of flipping |0⟩↔|1⟩.',
};

const P_INFO: GuideInfo = {
  what: 'The strength of the selected noise — the probability that each qubit is hit during one shot (0.100 = 10%). For coherent rotation the slider sets the error rotation angle instead.',
  how: 'Drag the slider. 10% is the Phase-1 example. Raise it to stress-test the code: at some point protection breaks down — that tipping point is the pseudo-threshold.',
  example: 'p = 0.10 with the 3-qubit bit-flip code → single errors are detected and corrected; the logical qubit survives nearly every shot.',
};

const CROSSTALK_INFO: GuideInfo = {
  what: 'An extra correlated error channel: a gate on one qubit accidentally disturbs its neighbour — a well-documented hardware problem in ion traps (literature ref 4).',
  how: 'Keep it small (1–5%). The main p slider still sets the base error rate; p_xtalk adds neighbour-pair errors on top.',
  example: 'p = 0.10, p_xtalk = 0.02 → besides the base noise, each neighbouring pair has a 2% chance of being corrupted together.',
};

const STATE_INFO: GuideInfo = {
  what: 'The quantum state your logical qubit starts in: |ψ⟩ = α|0⟩ + β|1⟩, drawn as an arrow on the Bloch sphere. θ (polar angle) sets the mix between |0⟩ and |1⟩; φ (azimuth) sets the complex phase between them.',
  how: 'Click a preset, or choose Custom and drag the θ / φ sliders. |0⟩ and |1⟩ are the sphere poles; |+⟩, |−⟩, |+i⟩ sit on the equator (equal mixes with different phase).',
  example: '|+⟩ = a 50/50 mix of |0⟩ and |1⟩ — measuring it would return 0 or 1 with equal probability.',
};

const THETA_INFO: GuideInfo = {
  what: 'Polar angle on the Bloch sphere: 0 = |0⟩ (north pole), π = |1⟩ (south pole), π/2 = equator (equal mix).',
  how: 'Drag to set how much |0⟩ vs |1⟩ your state contains.',
  example: 'θ = π/2 → an equal superposition of |0⟩ and |1⟩.',
};

const PHI_INFO: GuideInfo = {
  what: 'Azimuth angle around the vertical axis — the complex phase between the α and β amplitudes. Two states can share the same θ and still differ by phase.',
  how: 'Drag from 0 to 2π to spin the arrow around the equator.',
  example: 'φ = 0 → |+⟩; φ = π → |−⟩; φ = π/2 → |+i⟩.',
};

const MANUAL_INFO: GuideInfo = {
  what: 'Instead of letting the random number generator decide, you place the errors yourself — deterministic and repeatable, perfect for reproducing the Phase-1 worked example.',
  how: 'Switch ON, then click the qubit buttons (they cycle I → X → Z → Y), or for surface codes click lattice cells. Your errors are injected in every shot and the sampled noise is disabled.',
  example: 'Turn ON, set q1 = X on the 3-qubit code, then Run Shot → the syndrome flags exactly that qubit and the decoder fixes it.',
};

const SEED_INFO: GuideInfo = {
  what: 'The starting point of the pseudo-random number generator. Same seed + same settings = the exact same “random” outcome — this is what makes every experiment reproducible.',
  how: 'Leave it, drag it, or press the dice button to reroll a fresh seed before each shot. Note the value down if you need identical results in a report later.',
  example: 'Seed 42 on the default setup always produces the same noise event — run it twice and compare.',
};

interface SurfaceResult {
  logicalError: boolean;
  xErrors: [number, number][];
  zErrors: [number, number][];
  syndromeXDefects: [number, number][];
  syndromeZDefects: [number, number][];
  xCorrections: [number, number][];
  zCorrections: [number, number][];
  detected: boolean;
}

export default function SimulatorLab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [codeId, setCodeId] = useState('code-3bitflip');
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.1);
  const [pCrosstalk, setPCrosstalk] = useState(0.02);
  const [theta, setTheta] = useState(0);
  const [phi, setPhi] = useState(0);
  const [statePreset, setStatePreset] = useState('|0⟩');
  const [seed, setSeed] = useState(42);
  const [rotDeg, setRotDeg] = useState(10);
  const [t1, setT1] = useState(5);
  const [t2, setT2] = useState(5);
  const [manualMode, setManualMode] = useState(false);
  const [manualErrors, setManualErrors] = useState<Map<string, CellState>>(new Map());
  const [trace, setTrace] = useState<ShotTrace | null>(null);
  const [surfaceResult, setSurfaceResult] = useState<SurfaceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [playStage, setPlayStage] = useState<number | null>(null); // null idle · 0..5 playing · 6 done
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // one-shot pipeline playback: advances the rail stage every 420ms, then stops
  const startPlayback = () => {
    if (playRef.current) clearInterval(playRef.current);
    setPlayStage(0);
    let s = 0;
    playRef.current = setInterval(() => {
      s += 1;
      setPlayStage(Math.min(s, 6));
      if (s >= 6 && playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
    }, 420);
  };
  useEffect(() => () => { if (playRef.current) clearInterval(playRef.current); }, []);

  const codeMeta = useMemo(() => getCodeMeta(codeId), [codeId]);
  const isSurface = codeMeta.engine === 'surface';
  const d = isSurface ? codeMeta.d : 0;
  const svCode = useMemo(() => (isSurface ? null : getSVCode(codeId)), [isSurface, codeId]);
  const compatNoise = useMemo(() => codeMeta.compat, [codeMeta]);

  const switchCode = (id: string) => {
    setCodeId(id);
    const meta = getCodeMeta(id);
    if (!meta.compat.includes(noise)) setNoise(meta.compat[0]);
    setTrace(null);
    setSurfaceResult(null);
  };

  const applyPreset = (label: string) => {
    const preset = STATE_PRESETS.find((s) => s.label === label);
    if (!preset) return;
    setStatePreset(label);
    if (preset.theta >= 0) {
      setTheta(preset.theta);
      setPhi(preset.phi);
    }
  };

  const params: NoiseParams = noiseParams(p, noise, { rotDeg, T1: t1, T2: t2, pCrosstalk });

  const runShot = () => {
    setRunning(true);
    try {
      if (isSurface) {
        const forced: [number, number, CellState][] = manualMode
          ? [...manualErrors.entries()].map(([k, st]) => {
              const [r, c] = k.split(',').map(Number);
              return [r, c, st] as [number, number, CellState];
            })
          : [];
        if (manualMode) {
          // deterministic injection: run a modified shot by sampling with p=0 then applying errors
          const res = runWithInjection(d, forced);
          setSurfaceResult(res);
        } else {
          const res = runSurfaceShot(d, noise as SurfaceNoise, p, makeRng(seed));
          setSurfaceResult(res);
        }
        setTrace(null);
      } else {
        const forced = manualMode
          ? [...manualErrors.entries()].map(([k, st]) => ({
              qubit: Number(k.split(',')[1]),
              x: st === 1 || st === 3,
              z: st === 2 || st === 3,
            }))
          : null;
        const t = runTrace(svCode!, noise, params, theta, phi, seed, forced);
        setTrace(t);
        setSurfaceResult(null);
      }
      startPlayback();
    } finally {
      setRunning(false);
    }
  };

  const randomShot = () => {
    setSeed(Math.floor(Math.random() * 1e9));
    setTimeout(runShot, 0);
  };

  const toggleInject = (r: number, c: number, next: CellState) => {
    const q = `${r},${c}`;
    const nextMap = new Map(manualErrors);
    if (next === 0) nextMap.delete(q);
    else nextMap.set(q, next);
    setManualErrors(nextMap);
  };

  /* ---------------- export helpers (formal reports: inputs + outputs) */

  const configRows = (extra: [string, string][] = []): [string, string][] => {
    const base: [string, string][] = [
      ['QEC code', `${codeMeta.name} — [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]]`],
      ['Engine', codeMeta.engine === 'surface' ? 'Pauli-frame stabilizer + MWPM decoder' : 'Full state-vector simulator'],
      ['Noise model', NOISE_LABELS[noise] ?? noise],
      ['Noise strength p', p.toFixed(3)],
    ];
    if (!isSurface) base.push(['Input state |ψ⟩', statePreset === 'Custom' ? `θ = ${theta.toFixed(2)} rad, φ = ${phi.toFixed(2)} rad` : statePreset]);
    if (noise === 'coherent-rotation') base.push(['Error rotation angle', `${rotDeg.toFixed(1)}° (${(rotDeg * Math.PI / 180).toFixed(3)} rad per qubit)`]);
    if (noise === 'thermal-relaxation') base.push(['Thermal relaxation', `T1 = ${t1.toFixed(1)} gate times, T2 = ${t2.toFixed(1)} gate times`]);
    base.push(['RNG seed', String(seed)]);
    if (manualMode) {
      const desc = [...manualErrors.entries()].map(([k, st]) => `q${k.split(',')[1]}:${['I', 'X', 'Z', 'Y'][st]}`).join(' ') || 'none';
      base.push(['Manual error injection', `${manualMode ? 'ON' : 'OFF'} — ${desc}`]);
    }
    return [...base, ...extra];
  };

  const exportTraceReport = (t: ShotTrace) => {
    openPrintableReport(
      { title: `Single-Shot QEC Pipeline — ${t.codeName}`, runKind: 'Simulator Lab · Single Shot' },
      [
        {
          heading: 'Inputs (Experiment Configuration)',
          kv: configRows([
            ['Encoded state label', t.stateLabel],
            ['Encoding method', t.projectionEncoding ? 'Stabilizer projection onto codespace' : 'Unitary encoding circuit'],
          ]),
        },
        {
          heading: 'Outputs (Results)',
          cards: [
            { label: 'Fidelity with QEC', value: (t.fidelity * 100).toFixed(2) + '%', tone: t.fidelity > 0.99 ? 'good' : t.fidelity > 0.9 ? 'neutral' : 'bad' },
            { label: 'Fidelity bare qubit', value: (t.fidelityBefore * 100).toFixed(2) + '%', tone: 'bad' },
            { label: 'Logical outcome', value: '|' + t.measuredOutcome + '⟩' },
            { label: 'Recovered', value: t.recovered ? 'YES' : 'PARTIAL', tone: t.recovered ? 'good' : 'bad' },
            { label: 'Engine time', value: t.elapsedMs + ' ms' },
          ],
        },
        {
          heading: 'Pipeline Events',
          kv: [
            ['Noise events', t.noiseEvents.length ? t.noiseEvents.map((e) => e.detail).join('; ') : `None sampled at p = ${t.p.toFixed(3)}`],
            ['Syndrome', t.syndrome.map((s) => `${s.label}=${s.bit}`).join('  ')],
            ['Correction applied', t.correction.x.length || t.correction.z.length ? `X on q${t.correction.x.join(', q') || '—'} ; Z on q${t.correction.z.join(', q') || '—'}` : 'None needed'],
            ['Detection note', t.detectionNote],
          ],
        },
        {
          heading: 'Encoded State After Noise — Amplitudes',
          table: {
            headers: ['Basis state', 'Re', 'Im', 'Probability'],
            rows: t.afterNoiseAmps.map((a) => [a.label, a.re.toFixed(4), a.im.toFixed(4), (a.prob * 100).toFixed(2) + '%']),
          },
          note: 'Amplitudes below the 1% display threshold are omitted. Full data available via the JSON export.',
        },
        {
          heading: 'Methodology',
          text: `The shot executes the complete Phase-1 pipeline: encode |ψ⟩ into the [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]] codespace, sample the selected noise channel via quantum trajectories, measure every stabilizer generator projectively, apply the table-driven decoder correction, decode, and compute the logical fidelity against the target pure state. The bare-qubit baseline receives the identical noise. Team: ${TEAM_NAMES.join(', ')}.`,
        },
      ]
    );
  };

  const exportTraceJSON = (t: ShotTrace) => {
    downloadJSON(`shot-${t.codeId}-${runId()}.json`, {
      experiment: 'Single-shot QEC pipeline',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      inputs: Object.fromEntries(configRows()),
      outputs: {
        fidelity: t.fidelity,
        fidelityBare: t.fidelityBefore,
        recovered: t.recovered,
        measuredOutcome: t.measuredOutcome,
        noiseEvents: t.noiseEvents,
        syndrome: t.syndrome,
        correction: t.correction,
        decodedBloch: t.decodedBloch,
        beforeBloch: t.beforeBloch,
        amplitudesAfterNoise: t.afterNoiseAmps,
        elapsedMs: t.elapsedMs,
        detectionNote: t.detectionNote,
      },
    });
  };

  const exportTraceCSV = (t: ShotTrace) => {
    downloadCSV(
      `amplitudes-${t.codeId}-${runId()}.csv`,
      ['basis_state', 'real', 'imag', 'probability'],
      t.afterNoiseAmps.map((a) => [a.label, a.re.toFixed(6), a.im.toFixed(6), a.prob.toFixed(6)])
    );
  };

  const exportSurfaceReport = (res: SurfaceResult) => {
    openPrintableReport(
      { title: `Surface-Code Shot — d=${d} Rotated Lattice`, runKind: 'Simulator Lab · Single Shot' },
      [
        {
          heading: 'Inputs (Experiment Configuration)',
          kv: configRows([
            ['Decoder', 'Minimum-weight perfect matching (exact subset DP, boundary-terminating pairs)'],
            ['Model', 'Code-capacity Pauli frame'],
          ]),
        },
        {
          heading: 'Outputs (Results)',
          cards: [
            { label: 'Verdict', value: res.logicalError ? 'LOGICAL ERROR' : 'RECOVERED', tone: res.logicalError ? 'bad' : 'good' },
            { label: 'Physical errors', value: String(res.xErrors.length + res.zErrors.length) },
            { label: 'Syndrome defects', value: String(res.syndromeXDefects.length + res.syndromeZDefects.length) },
            { label: 'Corrections', value: String(res.xCorrections.length + res.zCorrections.length) },
          ],
        },
        {
          heading: 'Error / Defect / Correction Ledger',
          table: {
            headers: ['Category', 'Qubit positions (row, col)'],
            rows: [
              ['X errors (bit flips)', res.xErrors.map(([r, c]) => `(${r},${c})`).join(' ') || 'none'],
              ['Z errors (phase flips)', res.zErrors.map(([r, c]) => `(${r},${c})`).join(' ') || 'none'],
              ['Z-stabilizer defects', res.syndromeZDefects.map(([r, c]) => `(${r},${c})`).join(' ') || 'none'],
              ['X-stabilizer defects', res.syndromeXDefects.map(([r, c]) => `(${r},${c})`).join(' ') || 'none'],
              ['X corrections', res.xCorrections.map(([r, c]) => `(${r},${c})`).join(' ') || 'none'],
              ['Z corrections', res.zCorrections.map(([r, c]) => `(${r},${c})`).join(' ') || 'none'],
            ],
          },
          note: res.detected ? 'Syndrome defects were flagged and matched by the MWPM decoder.' : 'Trivial syndrome — no errors to correct this shot.',
        },
        {
          heading: 'Methodology',
          text: `Independent X and Z components were sampled per data qubit at rate p. Z-type stabilizers flag X components and vice versa; the decoder pairs defects through the stabilizer graph with minimum total weight (boundary pairs allowed). A residual error anticommuting with a logical operator after correction constitutes a logical error. Team: ${TEAM_NAMES.join(', ')}.`,
        },
      ]
    );
  };

  const exportSurfaceJSON = (res: SurfaceResult) => {
    downloadJSON(`surface-shot-d${d}-${runId()}.json`, {
      experiment: 'Surface-code single shot',
      generatedAt: nowStamp(),
      team: TEAM_NAMES,
      inputs: Object.fromEntries(configRows()),
      outputs: {
        logicalError: res.logicalError,
        detected: res.detected,
        xErrors: res.xErrors,
        zErrors: res.zErrors,
        syndromeZDefects: res.syndromeZDefects,
        syndromeXDefects: res.syndromeXDefects,
        xCorrections: res.xCorrections,
        zCorrections: res.zCorrections,
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <HowToCard
        steps={[
          { title: 'Choose code + noise', body: 'Configuration panel below — every option has a ? button explaining it in plain language. The defaults match our Phase-1 worked example (3-qubit bit-flip, 10%).' },
          { title: 'Press Run Shot', body: 'One full pipeline runs: encode → noise → syndrome → correction → decode → measure. The dice button rerolls the seed for a fresh random shot.' },
          { title: 'Read the Results tab', body: 'Green verdict = quantum information recovered. Fidelity near 100% means the state survived; the bare-qubit number shows what would happen without any protection.' },
          { title: 'Open the other two tabs', body: '“How it was computed” replays the pipeline with YOUR actual numbers; “What it means” interprets every value and suggests your next experiment.' },
        ]}
        tip="New to quantum error correction? Keep Guide Mode ON (top bar) — every input then shows a one-line hint plus a ? button with the full story."
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* ------------------------------ Control panel */}
      <div className="flex flex-col gap-4">
        <Card className="glass border-white/8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-violet-300">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <GuideField label="QEC Code" info={CODE_INFO} hint="One logical qubit protected by n physical ones. New here? Keep 3-Qubit Bit-Flip.">
              <Select value={codeId} onValueChange={switchCode}>
                <SelectTrigger className="w-full border-violet-400/25 bg-white/[0.04]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {CODE_REGISTRY.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.short} · [[{c.n},{c.k},{c.d}]]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="border-violet-500/40 text-violet-300">[[{codeMeta.n},{codeMeta.k},{codeMeta.d}]]</Badge>
                <Badge variant="outline" className="border-slate-500/40 text-slate-400">rate {codeMeta.rate}</Badge>
                <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">{codeMeta.stabilizerCount} stabilizers</Badge>
              </div>
            </GuideField>

            <GuideField label="Noise Model" info={NOISE_INFO} hint="How qubits get disturbed in this experiment. Bit-Flip (X) is the classic first example.">
              <Select value={noise} onValueChange={(v) => setNoise(v as NoiseModelId)}>
                <SelectTrigger className="w-full border-violet-400/25 bg-white/[0.04]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {compatNoise.map((id) => (
                    <SelectItem key={id} value={id}>{NOISE_LABELS[id]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {codeMeta.engine === 'surface' && (
                <p className="mt-1.5 text-[11px] text-slate-500">Surface code uses the Pauli-frame engine: Pauli noise models only.</p>
              )}
            </GuideField>

            {noise !== 'thermal-relaxation' && noise !== 'coherent-rotation' && (
              <GuideField
                label="Error probability p"
                info={P_INFO}
                hint="Chance each qubit is hit per shot. 10% is the Phase-1 example."
                right={<span className="font-mono text-violet-300">{p.toFixed(3)}</span>}
              >
                <Slider
                  value={[Math.round(p * 500)]}
                  min={0}
                  max={500}
                  step={1}
                  onValueChange={(v) => setP(v[0] / 500)}
                  className="text-violet-400"
                />
              </GuideField>
            )}

            {noise === 'coherent-rotation' && (
              <GuideField
                label="Error rotation angle"
                info={{ what: 'A coherent error is a small systematic rotation applied to every qubit (e.g. a miscalibrated gate). It is deterministic — the SAME rotation every shot — which makes it harder to correct than random noise.', how: 'Drag the angle from 0° to 90°. Small angles (1–15°) are realistic for hardware; large angles show how coherent errors accumulate.', example: '10° rotation on |0⟩ tilts the state slightly toward the equator — the syndrome sees it as a weak error each round.' }}
                hint="A miscalibrated gate = the same tilt every shot."
                right={<span className="font-mono text-violet-300">{rotDeg.toFixed(1)}°</span>}
              >
                <Slider value={[rotDeg]} min={0} max={90} step={0.5} onValueChange={(v) => setRotDeg(v[0])} className="text-violet-400" />
              </GuideField>
            )}

            {noise === 'thermal-relaxation' && (
              <>
                <GuideField
                  label="T₁ relaxation time"
                  info={{ what: 'T1 is the time over which a qubit loses its energy to the environment (|1⟩ decays toward |0⟩). Measured here in gate-time units: T1 = 5 means the qubit survives ~5 gates before significant decay.', how: 'Drag from 0.5 to 20. SMALL T1 = harsh hardware, LARGE T1 = good hardware.', example: 'T1 = 5 → about 18% amplitude damping per gate — noticeable but correctable.' }}
                  hint="Energy-loss time. Small = harsh hardware."
                  right={<span className="font-mono text-violet-300">{t1.toFixed(1)}</span>}
                >
                  <Slider value={[Math.round(t1 * 4)]} min={2} max={80} step={1} onValueChange={(v) => { const nv = v[0] / 4; setT1(nv); if (t2 > 2 * nv) setT2(2 * nv); }} className="text-violet-400" />
                </GuideField>
                <GuideField
                  label="T₂ dephasing time"
                  info={{ what: 'T2 is the time over which the qubit’s phase relationship (superposition) fades. Physically T2 can never exceed 2×T1 — the slider enforces this automatically.', how: 'Drag from 0.5 up to 2×T1. The gap T2 ≪ 2T1 means extra pure dephasing on top of energy loss.', example: 'T1 = 5, T2 = 5 → both decay and dephasing contribute each round.' }}
                  hint="How long superposition survives (≤ 2×T1)."
                  right={<span className="font-mono text-violet-300">{t2.toFixed(1)}</span>}
                >
                  <Slider value={[Math.round(t2 * 4)]} min={2} max={Math.round(2 * t1 * 4)} step={1} onValueChange={(v) => setT2(v[0] / 4)} className="text-violet-400" />
                </GuideField>
              </>
            )}

            {noise === 'crosstalk' && (
              <GuideField
                label="Crosstalk p_xtalk"
                info={CROSSTALK_INFO}
                hint="Extra neighbour-to-neighbour error on top of p."
                right={<span className="font-mono text-violet-300">{pCrosstalk.toFixed(3)}</span>}
              >
                <Slider value={[Math.round(pCrosstalk * 200)]} min={0} max={200} step={1} onValueChange={(v) => setPCrosstalk(v[0] / 200)} />
              </GuideField>
            )}

            {!isSurface && (
              <GuideField label="Input State |ψ⟩" info={STATE_INFO} hint="Where your qubit starts on the Bloch sphere. Presets are the classic points.">
                <div className="flex flex-wrap gap-1.5">
                  {STATE_PRESETS.map((s) => (
                    <Button
                      key={s.label}
                      size="sm"
                      variant={statePreset === s.label ? 'default' : 'outline'}
                      className={statePreset === s.label ? 'bg-violet-600 hover:bg-violet-500' : 'border-violet-500/30 text-slate-300'}
                      onClick={() => applyPreset(s.label)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                {statePreset === 'Custom' && (
                  <div className="mt-3 flex flex-col gap-3 rounded-lg border border-violet-500/20 p-3">
                    <GuideField label="θ (polar angle)" info={THETA_INFO} right={<span className="font-mono text-violet-300">{theta.toFixed(2)} rad</span>}>
                      <Slider value={[Math.round((theta / Math.PI) * 100)]} min={0} max={100} onValueChange={(v) => setTheta((v[0] / 100) * Math.PI)} />
                    </GuideField>
                    <GuideField label="φ (azimuth)" info={PHI_INFO} right={<span className="font-mono text-violet-300">{phi.toFixed(2)} rad</span>}>
                      <Slider value={[Math.round((phi / (2 * Math.PI)) * 100)]} min={0} max={100} onValueChange={(v) => setPhi((v[0] / 100) * 2 * Math.PI)} />
                    </GuideField>
                  </div>
                )}
              </GuideField>
            )}

            <GuideField
              label="Manual Error Injection"
              info={MANUAL_INFO}
              hint={isSurface ? 'Click lattice cells to cycle I→X→Z→Y' : 'Click qubit buttons to cycle I→X→Z→Y'}
            >
              <div className="flex items-center justify-between rounded-lg border border-violet-500/20 px-3 py-2">
                <span className="text-[11px] text-slate-400">{manualMode ? 'ON — your errors override random noise' : 'OFF — noise is sampled randomly'}</span>
                <Switch checked={manualMode} onCheckedChange={setManualMode} />
              </div>
            </GuideField>

            {manualMode && isSurface && (
              <SurfaceGrid
                d={d}
                cellStates={manualErrors}
                onCellClick={toggleInject}
                showStabs={false}
                size={300}
              />
            )}

            {manualMode && !isSurface && svCode && (
              <div className="rounded-lg border border-violet-500/20 p-3">
                <div className="mb-2 text-[11px] text-slate-400">Toggle error type per qubit (I → X → Z → Y):</div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: svCode.n }, (_, q) => {
                    const st = manualErrors.get(`0,${q}`) ?? 0;
                    const label = ['I', 'X', 'Z', 'Y'][st];
                    const color = st === 0 ? 'border-slate-500/40 text-slate-400' : st === 1 ? 'border-rose-500/60 text-rose-400' : st === 2 ? 'border-amber-500/60 text-amber-400' : 'border-fuchsia-500/60 text-fuchsia-400';
                    return (
                      <Button
                        key={q}
                        size="sm"
                        variant="outline"
                        className={`h-8 w-9 font-mono ${color}`}
                        onClick={() => toggleInject(0, q, ((st + 1) % 4) as CellState)}
                      >
                        <span className="text-[9px] text-slate-500 mr-0.5">q{q}</span>{label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <GuideField label="RNG Seed" info={SEED_INFO} hint="Same seed = same result. Use the dice for a fresh random shot." right={<span className="font-mono text-violet-300">{seed}</span>}>
              <Slider value={[seed % 1000]} min={0} max={999} step={1} onValueChange={(v) => setSeed(v[0] * 7919 + 13)} />
            </GuideField>

            <div className="flex gap-2">
              <Button onClick={runShot} disabled={running} className="flex-1 bg-violet-600 hover:bg-violet-500">
                <Play className="mr-1.5 h-4 w-4" /> Run Shot
              </Button>
              <Button onClick={randomShot} disabled={running} variant="outline" className="border-violet-500/40 text-violet-300">
                <Dices className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------ Results panel */}
      <div className="flex flex-col gap-4">
        {!trace && !surfaceResult && (
          <Card className="glass border-dashed border-violet-400/25">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
                <Zap className="h-8 w-8 text-violet-400/70" />
              </div>
              <p className="max-w-sm text-sm text-slate-400">
                Configure a QEC code and noise model, then press <span className="text-violet-300">Run Shot</span> to
                step through the full error-correction pipeline — encoding, noise injection, syndrome extraction,
                correction, decoding and measurement, exactly as in our Phase-1 architecture.
              </p>
            </CardContent>
          </Card>
        )}

        {trace && (
          <>
            <PipelineRail stage={playStage} onReplay={startPlayback} engine="statevector" />
            <div className="rise-in">
              <SVTraceView trace={trace} onReport={exportTraceReport} onJSON={exportTraceJSON} onCSV={exportTraceCSV} />
            </div>
          </>
        )}
        {surfaceResult && (
          <>
            <PipelineRail stage={playStage} onReplay={startPlayback} engine="surface" />
            <div className="rise-in">
              <SurfaceResultView res={surfaceResult} d={d} onReport={exportSurfaceReport} onJSON={exportSurfaceJSON} />
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PipelineRail — animated stage-by-stage playback of the 6 pipeline   */
/* phases (v5). Lights up one stage at a time after each Run Shot,     */
/* then rests in the "all complete" state. One-shot, never loops.      */
/* ------------------------------------------------------------------ */

const RAIL_STAGES = [
  { label: 'Encode', icon: Cpu, hint: 'spread |ψ⟩ across physical qubits' },
  { label: 'Noise', icon: Zap, hint: 'sample the selected error channel' },
  { label: 'Syndrome', icon: ScanSearch, hint: 'stabilizer checks flag defects' },
  { label: 'Correct', icon: Wand2, hint: 'decoder-applied recovery gates' },
  { label: 'Decode', icon: CornerDownLeft, hint: 'un-encode back to 1 qubit' },
  { label: 'Measure', icon: Target, hint: 'read out + score the fidelity' },
];

function PipelineRail({ stage, onReplay, engine }: {
  stage: number | null;
  onReplay: () => void;
  engine: 'statevector' | 'surface';
}) {
  const playing = stage !== null && stage < RAIL_STAGES.length;
  const done = stage !== null && stage >= RAIL_STAGES.length;
  return (
    <div className="glass relative overflow-hidden rounded-xl px-4 py-3">
      {playing && (
        <div aria-hidden className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
          <div className="sweep-x h-full w-1/4 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {engine === 'surface' ? 'MWPM pipeline' : 'Pipeline'} · {done ? 'complete' : playing ? 'running…' : 'replay'}
        </span>
        {RAIL_STAGES.map((s, i) => {
          const Icon = s.icon;
          const isDone = done || (stage !== null && i < stage);
          const isActive = stage === i;
          return (
            <span key={s.label} className="flex items-center gap-1">
              <span
                title={s.hint}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all duration-300 ${
                  isActive
                    ? 'stage-active border-cyan-300/70 bg-cyan-400/15 text-cyan-100'
                    : isDone
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                      : 'border-white/8 bg-white/[0.02] text-slate-500'
                }`}
              >
                {isDone && !isActive ? <CircleCheck className="h-3 w-3" /> : <Icon className={`h-3 w-3 ${isActive ? '' : 'opacity-70'}`} />}
                {s.label}
              </span>
              {i < RAIL_STAGES.length - 1 && (
                <span className={`h-px w-3 transition-colors duration-300 ${isDone ? 'bg-emerald-400/50' : 'bg-slate-700'}`} />
              )}
            </span>
          );
        })}
        <button
          onClick={onReplay}
          className="ml-auto flex items-center gap-1 rounded-md border border-violet-400/25 px-2 py-1 text-[10px] text-violet-300 transition-colors hover:bg-violet-500/15"
          aria-label="Replay pipeline animation"
        >
          <RotateCcw className="h-3 w-3" /> Replay
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-200';
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function SVTraceView({ trace, onReport, onJSON, onCSV }: {
  trace: ShotTrace;
  onReport: (t: ShotTrace) => void;
  onJSON: (t: ShotTrace) => void;
  onCSV: (t: ShotTrace) => void;
}) {
  const steps = [
    { n: 1, title: 'Encoding', detail: trace.projectionEncoding ? 'Stabilizer projection encoding onto the codespace' : 'Unitary encoding circuit applied', ok: true },
    {
      n: 2, title: 'Noise',
      detail: trace.noiseEvents.length
        ? trace.noiseEvents.map((e) => e.detail).join('  •  ')
        : `No error sampled this shot (p = ${trace.p.toFixed(3)} per qubit)`,
      ok: trace.noiseEvents.length === 0,
    },
    {
      n: 3, title: 'Syndrome Extraction',
      detail: trace.syndrome.some((s) => s.bit)
        ? `Defects: ${trace.syndrome.filter((s) => s.bit).map((s) => s.label).join(', ')}`
        : 'All stabilizers +1 — trivial syndrome',
      ok: !trace.syndrome.some((s) => s.bit),
    },
    {
      n: 4, title: 'Correction',
      detail: trace.correction.x.length || trace.correction.z.length
        ? `Applied X on q${trace.correction.x.join(', q')} ${trace.correction.z.length ? ` and Z on q${trace.correction.z.join(', q')}` : ''}`
        : 'No correction needed',
      ok: true,
    },
    { n: 5, title: 'Decoding', detail: trace.projectionEncoding ? 'Codespace readout of logical amplitudes' : 'Inverse encoding circuit applied', ok: true },
    { n: 6, title: 'Measurement', detail: `Logical outcome: |${trace.measuredOutcome}⟩ — ${trace.detectionNote}`, ok: trace.recovered },
  ];

  return (
    <ResultTabs
      results={
        <>
      {/* verdict */}
      <Card className={`border ${trace.recovered ? 'border-emerald-400/40 bg-emerald-400/[0.05]' : 'border-amber-400/40 bg-amber-400/[0.05]'}`}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            {trace.recovered ? <CircleCheck className="h-7 w-7 text-emerald-400" /> : <CircleX className="h-7 w-7 text-amber-400" />}
            <div>
              <div className="font-semibold text-slate-100">
                {trace.recovered ? 'Quantum information recovered' : 'Imperfect recovery (see fidelity)'}
              </div>
              <div className="text-xs text-slate-400">
                {trace.codeName} · {trace.noiseName} · p = {trace.p.toFixed(3)} · seed trace in {trace.elapsedMs} ms
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stat label="Fidelity (with QEC)" value={(trace.fidelity * 100).toFixed(2) + '%'} tone={trace.fidelity > 0.99 ? 'good' : trace.fidelity > 0.9 ? 'neutral' : 'bad'} />
            <Stat label="Fidelity (bare qubit)" value={(trace.fidelityBefore * 100).toFixed(2) + '%'} />
          </div>
          <div className="flex w-full flex-wrap gap-2 border-t border-violet-500/15 pt-3">
            <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10" onClick={() => onReport(trace)}>
              <FileText className="mr-1 h-3.5 w-3.5" /> Export Report (PDF)
            </Button>
            <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10" onClick={() => onJSON(trace)}>
              <Braces className="mr-1 h-3.5 w-3.5" /> JSON
            </Button>
            <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={() => onCSV(trace)}>
              <Braces className="mr-1 h-3.5 w-3.5" /> CSV (amplitudes)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* encoding circuit */}
        <Card className="glass border-white/8">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Encoding Circuit & Error Injection</CardTitle></CardHeader>
          <CardContent>
            <CircuitDiagram
              ops={getEncoding(trace.codeId)}
              nQubits={getN(trace.codeId)}
              noiseMarkers={trace.noiseEvents.map((e) => ({ qubit: e.qubit, kind: e.kind }))}
              correctionMarkers={[
                ...trace.correction.x.map((q) => ({ qubit: q, kind: 'X' as const })),
                ...trace.correction.z.map((q) => ({ qubit: q, kind: 'Z' as const })),
              ]}
            />
            {trace.projectionEncoding && (
              <p className="mt-2 text-[11px] text-slate-500">
                <Info className="mr-1 inline h-3 w-3" />This code is encoded by sequentially projecting onto each
                stabilizer&apos;s +1 eigenspace (mathematically exact); the syndrome table below shows the generators used.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Bloch spheres */}
        <Card className="glass border-white/8">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Logical State Comparison</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-around">
              <BlochSphere bloch={trace.decodedBloch} label={`After QEC — F = ${(trace.fidelity * 100).toFixed(1)}%`} color="#a78bfa" />
              <BlochSphere bloch={trace.beforeBloch} label={`Bare qubit — F = ${(trace.fidelityBefore * 100).toFixed(1)}%`} color="#f472b6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* syndrome table */}
        <Card className="glass border-white/8">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Syndrome Table</CardTitle></CardHeader>
          <CardContent>
            <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
              {trace.syndrome.map((s) => (
                <div
                  key={s.label}
                  className={`flex items-center justify-between rounded-md border px-2 py-1.5 font-mono text-xs ${
                    s.bit ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-slate-600/30 bg-slate-800/30 text-slate-400'
                  }`}
                >
                  <span>{s.label}</span>
                  <span className="font-semibold">{s.bit}</span>
                </div>
              ))}
            </div>
            <Separator className="my-3 bg-white/10" />
            <div className="text-[11px] text-slate-500">{trace.detectionNote}</div>
          </CardContent>
        </Card>

        {/* state inspector */}
        <Card className="glass border-white/8">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200">
              Encoded State After Noise — |ψ⟩ = {trace.stateLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1 font-mono text-xs">
              {trace.afterNoiseAmps.length === 0 && <div className="text-slate-500">All amplitude below display threshold.</div>}
              {trace.afterNoiseAmps.map((a) => (
                <div key={a.label} className="flex items-center gap-2">
                  <span className="w-24 text-cyan-300">{a.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                    <div className="h-full rounded bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${Math.min(100, a.prob * 100)}%` }} />
                  </div>
                  <span className="w-20 text-right text-slate-400">{(a.prob * 100).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
        </>
      }
      how={
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-slate-400">
            This is the exact sequence the engine executed for YOUR shot — every value below comes from this run
            ({trace.codeName} · {trace.noiseName} · p = {trace.p.toFixed(3)}).
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {steps.map((s) => (
              <Card key={s.n} className="glass border-white/8">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600/25 font-mono text-xs text-cyan-300">{s.n}</span>
                    <span className="text-slate-200">{s.title}</span>
                    {s.ok ? <CircleCheck className="ml-auto h-4 w-4 text-emerald-400" /> : <CircleX className="ml-auto h-4 w-4 text-rose-400" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs leading-relaxed text-slate-400">{s.detail}</CardContent>
              </Card>
            ))}
          </div>
          <MeaningCard tone="info" title="Where the numbers come from">
            <p>Fidelity is computed from the decoded quantum state itself: F = ⟨ψ_target|ρ_decoded|ψ_target⟩ — the squared overlap between what you asked for and what you got. The syndrome comes from projective stabilizer measurements; the correction comes from a pre-computed lookup table mapping each syndrome pattern to the most likely error. The encoded block and the bare qubit share the same random seed, so the before/after comparison is exact.</p>
            <p className="mt-2">Engine time for this shot: <span className="font-mono text-cyan-300">{trace.elapsedMs} ms</span> — everything ran locally in your browser.</p>
          </MeaningCard>
        </div>
      }
      meaning={
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <MeaningCard tone="info" title="Fidelity — your headline number">
              <p>Fidelity measures how close the recovered state is to what you asked for: 100% = identical, 0% = completely different. Rule of thumb: ≥ 99% excellent recovery · 90–99% good · 50–90% heavily damaged · below 50% the state was likely lost.</p>
              <p className="mt-2">This run: <span className="font-mono text-emerald-300">{(trace.fidelity * 100).toFixed(2)}%</span> {trace.fidelity > 0.99 ? '— excellent recovery.' : trace.fidelity > 0.9 ? '— good recovery with minor damage.' : '— significant damage; try a stronger code or less noise.'}</p>
            </MeaningCard>
            <MeaningCard tone="violet" title="QEC vs bare — the gap is the whole point">
              <p>The bare-qubit number is the SAME noise hitting ONE unprotected qubit. The gap between the two numbers is exactly what error correction bought you.</p>
              <p className="mt-2">This shot: <span className="font-mono text-emerald-300">{(trace.fidelity * 100).toFixed(1)}%</span> vs <span className="font-mono text-rose-300">{(trace.fidelityBefore * 100).toFixed(1)}%</span> — a difference of <span className="font-mono text-cyan-300">{((trace.fidelity - trace.fidelityBefore) * 100).toFixed(1)} points</span>.</p>
            </MeaningCard>
            <MeaningCard tone="warn" title={trace.recovered ? 'Full recovery — what happened' : 'Partial recovery — why it happens'}>
              {trace.recovered
                ? 'The decoder identified the exact error from the syndrome and cancelled it completely. The measured logical qubit equals your input state.'
                : `The decoded state is close but imperfect. This typically happens with non-Pauli channels (amplitude damping, coherent rotations, thermal relaxation), which nudge the state continuously instead of flipping it — Pauli-type codes can only fully reverse Pauli-type errors. Engine note: ${trace.detectionNote}`}
            </MeaningCard>
            <MeaningCard tone="good" title="The syndrome — error clues without spying">
              Measuring the data qubits directly would destroy the superposition you are protecting. Stabilizer checks answer only “do these neighbours DISAGREE?” — enough to locate the error while the quantum information stays untouched. That indirectness is the central trick of quantum error correction.
            </MeaningCard>
          </div>
          <TryBox>
            Raise the noise slider until the QEC fidelity drops toward the bare number — that is this code&apos;s pain point. Then switch the code to Shor [[9,1,3]] at the same noise and compare. For continuous protection, open the 3D Quantum Lab → Bloch Flight 4D and watch hundreds of live correction rounds.
          </TryBox>
        </>
      }
    />
  );
}

/* helpers to pull circuit data for the diagram */
import { SV_CODES } from '@/lib/qec/codes';
function getEncoding(codeId: string) {
  const c = SV_CODES.find((x) => x.id === codeId);
  return c?.encoding ?? [];
}
function getN(codeId: string) {
  const c = SV_CODES.find((x) => x.id === codeId);
  return c?.n ?? 1;
}

function SurfaceResultView({ res, d, onReport, onJSON }: {
  res: SurfaceResult;
  d: number;
  onReport: (res: SurfaceResult) => void;
  onJSON: (res: SurfaceResult) => void;
}) {
  return (
    <ResultTabs
      results={
        <>
      <Card className={`border ${res.logicalError ? 'border-rose-400/40 bg-rose-400/[0.05]' : 'border-emerald-400/40 bg-emerald-400/[0.05]'}`}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            {res.logicalError ? <CircleX className="h-7 w-7 text-rose-400" /> : <CircleCheck className="h-7 w-7 text-emerald-400" />}
            <div>
              <div className="font-semibold text-slate-100">
                {res.logicalError ? 'Logical error — residual error slipped past the decoder' : 'Recovery successful — logical qubit preserved'}
              </div>
              <div className="text-xs text-slate-400">
                Rotated surface code d={d} · {res.xErrors.length + res.zErrors.length} physical error(s) · {res.detected ? 'syndrome detected' : 'trivial syndrome'}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Stat label="Errors" value={String(res.xErrors.length + res.zErrors.length)} tone={res.xErrors.length + res.zErrors.length ? 'bad' : 'good'} />
            <Stat label="Defects" value={String(res.syndromeXDefects.length + res.syndromeZDefects.length)} />
            <Stat label="Verdict" value={res.logicalError ? 'FAIL' : 'OK'} tone={res.logicalError ? 'bad' : 'good'} />
          </div>
          <div className="flex w-full flex-wrap gap-2 border-t border-cyan-500/10 pt-3">
            <Button size="sm" variant="outline" className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10" onClick={() => onReport(res)}>
              <FileText className="mr-1 h-3.5 w-3.5" /> Export Report (PDF)
            </Button>
            <Button size="sm" variant="outline" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10" onClick={() => onJSON(res)}>
              <Braces className="mr-1 h-3.5 w-3.5" /> JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-white/8">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-200">Lattice — Errors, Syndrome & Matching Correction</CardTitle></CardHeader>
        <CardContent className="flex justify-center">
          <SurfaceGrid
            d={d}
            xErrors={res.xErrors}
            zErrors={res.zErrors}
            xCorrections={res.xCorrections}
            zCorrections={res.zCorrections}
            syndromeXDefects={res.syndromeXDefects}
            syndromeZDefects={res.syndromeZDefects}
            size={400}
          />
        </CardContent>
      </Card>
        </>
      }
      how={
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-slate-400">
            The Pauli-frame pipeline for the d = {d} rotated lattice — every value below comes from this shot.
          </p>
          <StepList
            steps={[
              {
                title: 'Error sampling — the lattice gets hit (or not)',
                body: res.xErrors.length + res.zErrors.length
                  ? <>This shot drew <span className="font-mono text-rose-300">{res.xErrors.length + res.zErrors.length} physical error(s)</span>: X (bit flips) at {res.xErrors.map(([r, c]) => `(${r},${c})`).join(' ') || '—'} · Z (phase flips) at {res.zErrors.map(([r, c]) => `(${r},${c})`).join(' ') || '—'}.</>
                  : 'The sampling drew no errors this round — a perfectly clean shot.',
              },
              {
                title: 'Syndrome — defects light up',
                body: res.detected
                  ? <>Z-type stabilizers flag X errors and vice versa. <span className="font-mono text-amber-300">{res.syndromeXDefects.length + res.syndromeZDefects.length} defect(s)</span> lit up at {[...res.syndromeXDefects, ...res.syndromeZDefects].map(([r, c]) => `(${r},${c})`).join(' ')}. Each defect means “an odd number of errors touches this plaquette”.</>
                  : 'A trivial syndrome — every stabilizer came back +1, so there was nothing for the decoder to do.',
              },
              {
                title: 'MWPM matching — pairing the clues',
                body: <>The decoder pairs defects along <span className="text-cyan-300">minimum-weight paths</span> through the stabilizer graph (boundary pairs allowed), computed exactly with subset dynamic programming. The matching chains imply the corrections: {res.xCorrections.length + res.zCorrections.length ? <>X at {res.xCorrections.map(([r, c]) => `(${r},${c})`).join(' ') || '—'} · Z at {res.zCorrections.map(([r, c]) => `(${r},${c})`).join(' ') || '—'}</> : 'none needed'}.</>,
              },
              {
                title: 'Logical check — the verdict',
                body: res.logicalError
                  ? 'Corrections were XOR-ed onto the residual error and what remained anticommuted with a logical operator — the decoder made the wrong call: LOGICAL ERROR.'
                  : 'Corrections cancelled the error pattern into a harmless loop on the lattice — the logical qubit is intact: RECOVERED.',
              },
            ]}
          />
        </div>
      }
      meaning={
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <MeaningCard tone={res.logicalError ? 'warn' : 'good'} title="Verdict — what OK / FAIL actually means">
              <p><span className="text-emerald-300">OK (recovered):</span> the corrections turned the error pattern into a loop that no logical operator can see — the encoded qubit is mathematically intact.</p>
              <p className="mt-2"><span className="text-rose-300">FAIL (logical error):</span> a residual error slipped past the decoder and anticommutes with a logical operator — at the physical level this corrupts the stored information. One failure does not mean the code is bad; statistics over many shots (Performance Lab) tell the real story.</p>
            </MeaningCard>
            <MeaningCard tone="info" title="Defects — the only visible signal">
              Data qubits are never measured during correction. Instead, each stabilizer plaquette reports whether an odd number of errors touches it. A single defect cannot be located uniquely — only PAIRS of defects (or a defect with the boundary) identify the error chain, which is exactly what the matching decoder computes.
            </MeaningCard>
            <MeaningCard tone="violet" title="Why bigger d wins — until the threshold">
              Distance d means the decoder must be fooled by at least ⌊d/2⌋ errors conspiring along one logical operator. Lower physical error rates therefore improve failure EXPONENTIALLY in d — but only while p stays below the ~10% threshold. Above it, adding qubits makes things worse.
            </MeaningCard>
            <MeaningCard tone="good" title="Reading the lattice picture">
              Red markers = X errors, amber = Z errors, glowing stars = syndrome defects, and the drawn chains = the decoder&apos;s matching corrections. When a chain connects two defects (or a defect and the boundary), the pair cancellation is what makes the error disappear.
            </MeaningCard>
          </div>
          <TryBox>
            Go to the Performance Lab and press “Sweep p” with a surface code: the d = 3/5/7 curves crossing near ~10% noise is the famous surface-code threshold, reproduced live by this engine. Then return here, turn on Manual Injection, and place two errors along one logical row — you can build a decoder failure by hand.
          </TryBox>
        </>
      }
    />
  );
}

/** deterministic surface shot with injected errors (p=0 + forced Paulis) */
function runWithInjection(d: number, forced: [number, number, CellState][]): SurfaceResult {
  const n2 = d * d;
  const xErr = new Array(n2).fill(false);
  const zErr = new Array(n2).fill(false);
  for (const [r, c, st] of forced) {
    if (st === 1 || st === 3) xErr[r * d + c] = true;
    if (st === 2 || st === 3) zErr[r * d + c] = true;
  }
  return decodeAndReport(d, xErr, zErr);
}

import { getSurfaceLayout, buildMatchingGraph, matchDefects, stabCenter } from '@/lib/qec/surface';

function decodeAndReport(d: number, xErr: boolean[], zErr: boolean[]): SurfaceResult {
  const layout = getSurfaceLayout(d);
  const n2 = d * d;
  const graphZ = buildMatchingGraph(layout, 'Z');
  const graphX = buildMatchingGraph(layout, 'X');
  const decode = (syndrome: number[], stabs: typeof layout.stabsZ, graph: typeof graphZ): [number, number][] => {
    const defects = syndrome.map((s, i) => (s === 1 ? i : -1)).filter((i) => i >= 0);
    if (defects.length === 0) return [];
    const { pairs, toBoundary } = matchDefects(graph, defects);
    const corrected = new Array(n2).fill(false);
    for (const [i, j] of pairs) for (const q of graph.path[i][j]) corrected[q] = !corrected[q];
    for (const i of toBoundary) for (const q of graph.pathB[i]) corrected[q] = !corrected[q];
    const out: [number, number][] = [];
    for (let q = 0; q < n2; q++) if (corrected[q]) out.push([Math.floor(q / d), q % d]);
    return out;
  };
  const syndromeZ = layout.stabsZ.map((st) => st.qubits.reduce((acc, [r, c]) => acc + (xErr[r * d + c] ? 1 : 0), 0) % 2);
  const syndromeX = layout.stabsX.map((st) => st.qubits.reduce((acc, [r, c]) => acc + (zErr[r * d + c] ? 1 : 0), 0) % 2);
  const xCorrections = decode(syndromeZ, layout.stabsZ, graphZ);
  const zCorrections = decode(syndromeX, layout.stabsX, graphX);
  const resX = [...xErr];
  const resZ = [...zErr];
  for (const [r, c] of xCorrections) resX[r * d + c] = !resX[r * d + c];
  for (const [r, c] of zCorrections) resZ[r * d + c] = !resZ[r * d + c];
  const xOnRow0 = layout.logicalZ.filter(([r, c]) => resX[r * d + c]).length;
  const zOnCol0 = layout.logicalX.filter(([r, c]) => resZ[r * d + c]).length;
  const toPos = (i: number): [number, number] => [Math.floor(i / d), i % d];
  return {
    logicalError: xOnRow0 % 2 === 1 || zOnCol0 % 2 === 1,
    xErrors: xErr.map((v, i) => (v ? toPos(i) : null)).filter(Boolean) as [number, number][],
    zErrors: zErr.map((v, i) => (v ? toPos(i) : null)).filter(Boolean) as [number, number][],
    syndromeZDefects: syndromeZ.map((s, i) => (s ? stabCenter(layout, layout.stabsZ[i]) : null)).filter(Boolean) as [number, number][],
    syndromeXDefects: syndromeX.map((s, i) => (s ? stabCenter(layout, layout.stabsX[i]) : null)).filter(Boolean) as [number, number][],
    xCorrections,
    zCorrections,
    detected: syndromeX.some((s) => s === 1) || syndromeZ.some((s) => s === 1),
  };
}
