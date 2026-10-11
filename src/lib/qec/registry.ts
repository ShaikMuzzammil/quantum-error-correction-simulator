/**
 * UI-facing registry: combines codes, noise models and engine capabilities
 * into a single source of truth for the interface.
 */
import { SV_CODES, SVCodeDef } from './codes';
import { NOISE_MODELS, NoiseModelId } from './noise';

export interface CodeMeta {
  id: string;
  name: string;
  short: string;
  n: number;
  k: number;
  d: number;
  family: string;
  corrects: string;
  description: string;
  engine: 'statevector' | 'surface';
  stabilizerCount: number;
  rate: string;
  compat: NoiseModelId[];
  color: string;
}

const SV_COMPAT: NoiseModelId[] = [
  'bitflip', 'phaseflip', 'depolarizing', 'amplitude-damping',
  'phase-damping', 'thermal-relaxation', 'coherent-rotation', 'crosstalk',
];
const SURFACE_COMPAT: NoiseModelId[] = ['bitflip', 'phaseflip', 'depolarizing'];

export const SURFACE_DISTANCES = [3, 5, 7];

export const CODE_REGISTRY: CodeMeta[] = [
  ...SV_CODES.map((c: SVCodeDef) => ({
    id: c.id,
    name: c.name,
    short: c.short,
    n: c.n,
    k: c.k,
    d: c.d,
    family: c.family,
    corrects: c.corrects,
    description: c.description,
    engine: 'statevector' as const,
    stabilizerCount: c.stabilizers.length,
    rate: `${c.k}/${c.n}`,
    compat: SV_COMPAT,
    color: 'violet',
  })),
  ...SURFACE_DISTANCES.map((d) => ({
    id: `surface-d${d}`,
    name: `Rotated Surface Code (d=${d})`,
    short: `Surface d=${d}`,
    n: d * d,
    k: 1,
    d,
    family: 'Topological (2D lattice)',
    corrects: `Any single-qubit error; scales exponentially with d (code-capacity model, MWPM decoder)`,
    description:
      `The leading architecture for fault-tolerant quantum computing. ${d * d} data qubits on a ` +
      `rotated ${d}×${d} lattice with ${(d * d - 1) / 2} X- and ${(d * d - 1) / 2} Z-stabilizers. ` +
      `Decoded via minimum-weight perfect matching on the stabilizer graph — the same approach used ` +
      `in lit. refs 3, 7 and 8. Sweep the noise to observe the famous threshold behaviour.`,
    engine: 'surface' as const,
    stabilizerCount: d * d - 1,
    rate: `1/${d * d}`,
    compat: SURFACE_COMPAT,
    color: 'cyan',
  })),
];

export function getCodeMeta(id: string): CodeMeta {
  const c = CODE_REGISTRY.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown code ${id}`);
  return c;
}

export { NOISE_MODELS };
export type { NoiseModelId };
