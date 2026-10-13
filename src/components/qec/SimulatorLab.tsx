'use client';

/**
 * Simulator Lab: single-shot QEC pipeline visualization.
 * Implements exactly the pipeline of all_with_noise_prob.py — 3-Qubit
 * Bit-Flip / Phase-Flip QEC under Bit-Flip (X), Phase-Flip (Z) or
 * Depolarizing noise — with the full stage walkthrough (encode → noise →
 * syndrome → correct → decode → measure), the exact Python circuit view,
 * the Python "QEC STATUS" verdict and PDF/JSON/CSV exports (report
 * includes the real circuit diagram).
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Play, Dices, Zap, CircleCheck, CircleX, Info, FileText, Braces, Orbit } from 'lucide-react';
import { runTrace, ShotTrace } from '@/lib/qec/pipeline';
import { getSVCode, pythonQecStatus } from '@/lib/qec/codes';
import { NoiseModelId, NoiseParams, noiseParams } from '@/lib/qec/noise';
import { CODE_REGISTRY, getCodeMeta } from '@/lib/qec/registry';
import { makeRng } from '@/lib/qec/engine';
import { downloadJSON, downloadCSV, openPrintableReport, runId, nowStamp, TEAM_NAMES } from '@/lib/report';
import BlochSphere from './BlochSphere';
import CircuitDiagram from './CircuitDiagram';
import PythonCircuitCard, { pythonCircuitSVG } from './PythonCircuit';
import { buildPythonCircuit } from '@/lib/qec/codes';
import { GuideField, HowToCard, ResultTabs, StepList, MeaningCard, TryBox, GuideInfo } from './Guide';

const NOISE_LABELS: Record<string, string> = {
  bitflip: 'Bit-Flip Noise (X)',
  phaseflip: 'Phase-Flip Noise (Z)',
  depolarizing: 'Depolarizing Noise',
};

/* per-qubit manual injection state: 0=I, 1=X, 2=Z, 3=Y */
type CellState = 0 | 1 | 2 | 3;

/* Python file menu numbers */
const NOISE_PYTYPE: Record<string, 1 | 2 | 3> = { bitflip: 1, phaseflip: 2, depolarizing: 3 };

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
  how: "Pick one of the two codes from the dropdown — both run live in your browser and both come straight from all_with_noise_prob.py: 1) the 3-Qubit Bit-Flip code and 2) the 3-Qubit Phase-Flip code.",
  example: 'Choosing 3-Qubit Bit-Flip [[3,1,3]] uses 3 physical qubits to protect 1 logical qubit and can fix any single bit-flip (X) error.',
};

const NOISE_INFO: GuideInfo = {
  what: 'The physical disturbance applied to your qubits. The Python reference implements exactly three channels: 1. Bit-Flip Noise (X), 2. Phase-Flip Noise (Z) and 3. Depolarizing Noise — and so does this simulator.',
  how: 'Choose a channel from the dropdown. Not sure? Keep Bit-Flip (X): it is the classic, easiest-to-follow example and it MATCHES the bit-flip code.',
  example: 'Bit-Flip Noise at 10%: on every shot, each qubit independently has a 10% chance of flipping |0⟩↔|1⟩.',
};

const P_INFO: GuideInfo = {
  what: 'The strength of the selected noise — the probability that each qubit is hit during one shot (0.100 = 10%). For coherent rotation the slider sets the error rotation angle instead.',
  how: 'Drag the slider. 10% is the Phase-1 example. Raise it to stress-test the code: at some point protection breaks down — that tipping point is the pseudo-threshold.',
  example: 'p = 0.10 with the 3-qubit bit-flip code → single errors are detected and corrected; the logical qubit survives nearly every shot.',
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
  what: 'Instead of letting the random number generator decide, you place the error yourself — deterministic and repeatable, exactly like choosing an error qubit in the Python program.',
  how: 'Switch ON, then click the qubit buttons (they cycle I → X → Z → Y). Your errors are injected in every shot and the sampled noise is disabled.',
  example: 'Turn ON, set q1 = X on the 3-qubit code, then Run Shot → the syndrome flags exactly that qubit and the decoder fixes it.',
};

const SEED_INFO: GuideInfo = {
  what: 'The starting point of the pseudo-random number generator. Same seed + same settings = the exact same “random” outcome — this is what makes every experiment reproducible.',
  how: 'Leave it, drag it, or press the dice button to reroll a fresh seed before each shot. Note the value down if you need identical results in a report later.',
  example: 'Seed 42 on the default setup always produces the same noise event — run it twice and compare.',
};

export default function SimulatorLab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [codeId, setCodeId] = useState('code-3bitflip');
  const [noise, setNoise] = useState<NoiseModelId>('bitflip');
  const [p, setP] = useState(0.1);
  const [theta, setTheta] = useState(0);
  const [phi, setPhi] = useState(0);
  const [statePreset, setStatePreset] = useState('|0⟩');
  const [seed, setSeed] = useState(42);
  const [manualMode, setManualMode] = useState(false);
  const [manualErrors, setManualErrors] = useState<Map<string, CellState>>(new Map());
  const [trace, setTrace] = useState<ShotTrace | null>(null);
  const [running, setRunning] = useState(false);
  /* Python circuit reference view: input bit + error qubit (all_with_noise_prob.py inputs) */
  const [pyBit, setPyBit] = useState<0 | 1>(0);
  const [pyErr, setPyErr] = useState<0 | 1 | 2>(0);

  const codeMeta = useMemo(() => getCodeMeta(codeId), [codeId]);
  const svCode = useMemo(() => getSVCode(codeId), [codeId]);
  const compatNoise = useMemo(() => codeMeta.compat, [codeMeta]);

  const switchCode = (id: string) => {
    setCodeId(id);
    setTrace(null);
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

  const params: NoiseParams = noiseParams(p);

  const runShot = () => {
    setRunning(true);
    try {
      const forced = manualMode
        ? [...manualErrors.entries()].map(([k, st]) => ({
            qubit: Number(k.split(',')[1]),
            x: st === 1 || st === 3,
            z: st === 2 || st === 3,
          }))
        : null;
      const tr = runTrace(svCode, noise, params, theta, phi, seed, forced);
      setTrace(tr);
      // point the Python circuit view at the qubit this shot actually hit
      if (tr.noiseEvents.length > 0) setPyErr((tr.noiseEvents[0].qubit as 0 | 1 | 2) ?? 0);
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
      ['QEC code', `${codeMeta.name} — [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]] (Python QEC ${codeMeta.pythonType})`],
      ['Engine', 'Full state-vector simulator (all_with_noise_prob.py pipeline)'],
      ['Noise model', `${NOISE_LABELS[noise] ?? noise} (Python noise ${NOISE_PYTYPE[noise]})`],
      ['Noise strength p', p.toFixed(3)],
      ['QEC status', pythonQecStatus(NOISE_PYTYPE[noise], codeMeta.pythonType).status],
      ['Input state |ψ⟩', statePreset === 'Custom' ? `θ = ${theta.toFixed(2)} rad, φ = ${phi.toFixed(2)} rad` : statePreset],
    ];
    base.push(['RNG seed', String(seed)]);
    if (manualMode) {
      const desc = [...manualErrors.entries()].map(([k, st]) => `q${k.split(',')[1]}:${['I', 'X', 'Z', 'Y'][st]}`).join(' ') || 'none';
      base.push(['Manual error injection', `${manualMode ? 'ON' : 'OFF'} — ${desc}`]);
    }
    return [...base, ...extra];
  };

  const exportTraceReport = (t: ShotTrace) => {
    const pyCircuit = buildPythonCircuit(codeMeta.pythonType, pyBit, pyErr);
    openPrintableReport(
      { title: `Single-Shot QEC Pipeline — ${t.codeName}`, runKind: 'Simulator Lab · Single Shot' },
      [
        {
          heading: 'Inputs (Experiment Configuration)',
          kv: configRows([
            ['Encoded state label', t.stateLabel],
            ['Encoding method', 'Unitary encoding circuit'],
          ]),
        },
        {
          heading: 'Circuit — exact all_with_noise_prob.py implementation',
          svg: pythonCircuitSVG(pyCircuit).svg,
          note: `bit_flip/phase_flip_qec(${pyBit === 1 ? 'input_bit=1' : 'input_bit=0'}, error_qubit=${pyErr}) — 5 qubits + 3 classical bits, syndrome measurement and conditional corrections exactly as in the Python file.`,
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
          text: `The shot executes the complete pipeline of all_with_noise_prob.py: encode |ψ⟩ into the [[${codeMeta.n},${codeMeta.k},${codeMeta.d}]] codespace, sample the selected noise channel via quantum trajectories, measure every stabilizer generator projectively (the ancilla-free equivalent of the q3/q4 ancilla checks), apply the table-driven decoder correction, decode, and compute the logical fidelity against the target pure state. The bare-qubit baseline receives the identical noise. Team: ${TEAM_NAMES.join(', ')} — Amrita Vishwa Vidyapeetham.`,
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


  return (
    <div className="flex flex-col gap-4">
      <HowToCard
        steps={[
          { title: 'Choose code + noise', body: 'Configuration panel below — every option has a ? button explaining it in plain language. The defaults match our Phase-1 worked example (3-qubit bit-flip, 10%).' },
          { title: 'Press Run Shot', body: 'One full pipeline runs: encode → noise → syndrome → correction → decode → measure. The dice button rerolls the seed for a fresh random shot.' },
          { title: 'Read the Results tab', body: 'Green verdict = quantum information recovered. Fidelity near 100% means the state survived; the bare-qubit number shows what would happen without any protection.' },
          { title: 'Open the other two tabs', body: '“How it was computed” replays the pipeline with YOUR actual numbers; “What it means” interprets every value and suggests your next experiment.' },
        ]}
        tip="Every input below shows a one-line hint plus a ? button with the full story — no prior quantum knowledge needed."
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* ------------------------------ Control panel */}
      <div className="flex flex-col gap-4">
        <Card className="border-violet-500/20 bg-[#141126]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-violet-300">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <GuideField label="QEC Code" info={CODE_INFO} hint="One logical qubit protected by n physical ones. New here? Keep 3-Qubit Bit-Flip.">
              <Select value={codeId} onValueChange={switchCode}>
                <SelectTrigger className="w-full border-violet-500/30 bg-[#1c1836]"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="w-full border-violet-500/30 bg-[#1c1836]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {compatNoise.map((id) => (
                    <SelectItem key={id} value={id}>{NOISE_LABELS[id]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </GuideField>

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

            <GuideField
              label="Manual Error Injection"
              info={MANUAL_INFO}
              hint="Click qubit buttons to cycle I→X→Z→Y"
            >
              <div className="flex items-center justify-between rounded-lg border border-violet-500/20 px-3 py-2">
                <span className="text-[11px] text-slate-400">{manualMode ? 'ON — your errors override random noise' : 'OFF — noise is sampled randomly'}</span>
                <Switch checked={manualMode} onCheckedChange={setManualMode} />
              </div>
            </GuideField>

            {manualMode && svCode && (
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
        {!trace && (
          <Card className="border-dashed border-violet-500/30 bg-[#100d1e]">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
              <Zap className="h-10 w-10 text-violet-500/60" />
              <p className="max-w-sm text-sm text-slate-400">
                Configure a QEC code and noise model, then press <span className="text-violet-300">Run Shot</span> to
                step through the full error-correction pipeline — encoding, noise injection, syndrome extraction,
                correction, decoding and measurement, exactly as in our Phase-1 architecture.
              </p>
            </CardContent>
          </Card>
        )}

        {trace && (
          <SVTraceView
            trace={trace}
            codeMeta={codeMeta}
            pyBit={pyBit}
            pyErr={pyErr}
            setPyBit={setPyBit}
            setPyErr={setPyErr}
            onReport={exportTraceReport}
            onJSON={exportTraceJSON}
            onCSV={exportTraceCSV}
          />
        )}
      </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-200';
  return (
    <div className="rounded-lg border border-violet-500/15 bg-[#181430] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function SVTraceView({ trace, codeMeta, pyBit, pyErr, setPyBit, setPyErr, onReport, onJSON, onCSV }: {
  trace: ShotTrace;
  codeMeta: { pythonType: 1 | 2; name: string };
  pyBit: 0 | 1;
  pyErr: 0 | 1 | 2;
  setPyBit: (b: 0 | 1) => void;
  setPyErr: (q: 0 | 1 | 2) => void;
  onReport: (t: ShotTrace) => void;
  onJSON: (t: ShotTrace) => void;
  onCSV: (t: ShotTrace) => void;
}) {
  const steps = [
    { n: 1, title: 'Encoding', detail: 'Unitary encoding circuit applied', ok: true },
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
    { n: 5, title: 'Decoding', detail: 'Inverse encoding circuit applied', ok: true },
    { n: 6, title: 'Measurement', detail: `Logical outcome: |${trace.measuredOutcome}⟩ — ${trace.detectionNote}`, ok: trace.recovered },
  ];

  const pyCircuitTitle = codeMeta.pythonType === 1 ? 'bit_flip_qec(input_bit, error_qubit)' : 'phase_flip_qec(input_bit, error_qubit)';
  const pyStatus = pythonQecStatus(NOISE_PYTYPE[trace.noiseId] ?? 1, codeMeta.pythonType);
  const statusTone =
    pyStatus.status === 'MATCHED' ? 'border-emerald-500/50 text-emerald-300' : pyStatus.status === 'DEPOLARIZING' ? 'border-cyan-500/50 text-cyan-300' : 'border-amber-500/50 text-amber-300';

  return (
    <ResultTabs
      results={
        <>
      {/* verdict */}
      <Card className={`border ${trace.recovered ? 'border-emerald-500/40' : 'border-amber-500/40'} bg-[#101a14]`}>
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
              <span className={`mt-1.5 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${statusTone}`}>
                QEC STATUS: {pyStatus.status}
              </span>
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
        <Card className="border-violet-500/15 bg-[#141126]">
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
          </CardContent>
        </Card>

        {/* exact Python circuit (all_with_noise_prob.py) */}
        <Card className="border-violet-500/15 bg-[#141126] lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200">Exact Python Circuit — {pyCircuitTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">input_bit</span>
                {[0, 1].map((v) => (
                  <Button key={v} size="sm" variant={pyBit === v ? 'default' : 'outline'} className={pyBit === v ? 'h-7 bg-violet-600 px-2.5 hover:bg-violet-500' : 'h-7 border-violet-500/30 px-2.5 text-slate-300'} onClick={() => setPyBit(v as 0 | 1)}>
                    {v}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">error_qubit (noise attaches to its id gate)</span>
                {[0, 1, 2].map((v) => (
                  <Button key={v} size="sm" variant={pyErr === v ? 'default' : 'outline'} className={pyErr === v ? 'h-7 bg-amber-600 px-2.5 hover:bg-amber-500' : 'h-7 border-violet-500/30 px-2.5 text-slate-300'} onClick={() => setPyErr(v as 0 | 1 | 2)}>
                    {v}
                  </Button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500">
                Same 5-qubit + 3-bit circuit the Python file builds; the engine below runs its ancilla-free equivalent.
              </span>
            </div>
            <PythonCircuitCard pythonType={codeMeta.pythonType} inputBit={pyBit} errorQubit={pyErr} />
          </CardContent>
        </Card>

        {/* Bloch spheres */}
        <Card className="border-violet-500/15 bg-[#141126]">
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
        <Card className="border-violet-500/15 bg-[#141126]">
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
            <Separator className="my-3 bg-violet-500/15" />
            <div className="text-[11px] text-slate-500">{trace.detectionNote}</div>
            <Separator className="my-3 bg-violet-500/15" />
            <div className="text-[11px] font-semibold text-slate-300">Syndrome → error mapping (Python file)</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 font-mono text-[11px] text-slate-400 sm:grid-cols-4">
              <span className="rounded border border-slate-600/30 px-2 py-1">00 → No error</span>
              <span className="rounded border border-rose-500/40 px-2 py-1 text-rose-300">01 → q0 error</span>
              <span className="rounded border border-rose-500/40 px-2 py-1 text-rose-300">11 → q1 error</span>
              <span className="rounded border border-rose-500/40 px-2 py-1 text-rose-300">10 → q2 error</span>
            </div>
          </CardContent>
        </Card>

        {/* state inspector */}
        <Card className="border-violet-500/15 bg-[#141126]">
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
              <Card key={s.n} className="border-cyan-500/15 bg-[#101823]">
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
                : `The decoded state is close but imperfect. With Pauli channels this happens when SEVERAL errors hit the same block: the code's distance only guarantees correcting one, so the decoder picks the nearest single-error match and some damage remains. Engine note: ${trace.detectionNote}`}
            </MeaningCard>
            <MeaningCard tone="good" title="The syndrome — error clues without spying">
              Measuring the data qubits directly would destroy the superposition you are protecting. Stabilizer checks answer only “do these neighbours DISAGREE?” — enough to locate the error while the quantum information stays untouched. That indirectness is the central trick of quantum error correction.
            </MeaningCard>
          </div>
          <TryBox>
            Raise the noise slider until the QEC fidelity drops toward the bare number — that is this code&apos;s pain point. Then switch to the other QEC code at the same noise and compare (bit-flip code loves X noise, phase-flip code loves Z noise). For continuous protection, open the 3D Quantum Lab → Bloch Flight 4D and watch dozens of live correction rounds.
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

