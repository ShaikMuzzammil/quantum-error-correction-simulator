/**
 * UI-facing registry: combines codes, noise models and engine capabilities
 * into a single source of truth for the interface.
 *
 * SCOPE — exactly the two QEC codes and three noise models of
 * all_with_noise_prob.py.
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
  engine: 'statevector';
  stabilizerCount: number;
  rate: string;
  compat: NoiseModelId[];
  /** 1 = bit-flip QEC, 2 = phase-flip QEC (Python file's qec_type) */
  pythonType: 1 | 2;
  color: string;
}

const SV_COMPAT: NoiseModelId[] = ['bitflip', 'phaseflip', 'depolarizing'];

export const CODE_REGISTRY: CodeMeta[] = SV_CODES.map((c: SVCodeDef) => ({
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
  pythonType: c.pythonType,
  color: 'violet',
}));

export function getCodeMeta(id: string): CodeMeta {
  const c = CODE_REGISTRY.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown code ${id}`);
  return c;
}

export { NOISE_MODELS };
export type { NoiseModelId };
