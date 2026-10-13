/**
 * Noise models for QEC simulation.
 *
 * SCOPE — exactly the three channels of all_with_noise_prob.py's
 * build_noise_model(noise_type, probability):
 *   1 = Bit-Flip Noise (X)   — pauli_error([("X", p), ("I", 1-p)])
 *   2 = Phase-Flip Noise (Z) — pauli_error([("Z", p), ("I", 1-p)])
 *   3 = Depolarizing Noise   — depolarizing_error(p, 1)  (X/Y/Z each p/3)
 *
 * In the Python file the error attaches to the "id" gate of the chosen error
 * qubit; here each model samples discrete error events per qubit
 * (quantum-trajectory style) and can also describe itself analytically.
 */

import { StateVector, RNG, GATES } from './engine';

export type NoiseModelId = 'bitflip' | 'phaseflip' | 'depolarizing';

export interface NoiseParams {
  /** main error probability (0..1) */
  p: number;
  /** syndrome readout error probability (0 by default — the Python file assumes perfect readout) */
  pMeas?: number;
}

/**
 * Build NoiseParams for the selected channel.
 * All three channels are driven by the single probability p.
 */
export function noiseParams(p: number, _noise?: NoiseModelId, opts?: { pMeas?: number }): NoiseParams {
  return {
    p,
    pMeas: opts?.pMeas,
  };
}

export type ErrorKind = 'X' | 'Y' | 'Z';

export interface NoiseEvent {
  qubit: number;
  kind: ErrorKind;
  prob: number;       // channel probability that produced this event
}

export interface NoiseModelInfo {
  id: NoiseModelId;
  name: string;
  short: string;
  /** the Python file's menu number (1/2/3) */
  pythonType: 1 | 2 | 3;
  description: string;
  math: string;
  mainParam: string;
}

export const NOISE_MODELS: NoiseModelInfo[] = [
  {
    id: 'bitflip',
    name: 'Bit-Flip Noise (X)',
    short: 'Bit-Flip (X)',
    pythonType: 1,
    description:
      'A spurious Pauli-X gate flips the qubit state: |0> becomes |1> and vice versa. ' +
      'Classically analogous to a bit flip, this is the simplest quantum error and the one ' +
      'the 3-qubit bit-flip code was designed to catch. Python: pauli_error([("X", p), ("I", 1-p)]).',
    math: 'E(ρ) = (1−p)·ρ + p·XρX',
    mainParam: 'Flip probability p',
  },
  {
    id: 'phaseflip',
    name: 'Phase-Flip Noise (Z)',
    short: 'Phase-Flip (Z)',
    pythonType: 2,
    description:
      'A Pauli-Z gate flips the relative phase of a superposition: |+> becomes |−>. ' +
      'This error has no classical analogue and is invisible to bit-flip codes — ' +
      'motivating the phase-flip code. Python: pauli_error([("Z", p), ("I", 1-p)]).',
    math: 'E(ρ) = (1−p)·ρ + p·ZρZ',
    mainParam: 'Phase-flip probability p',
  },
  {
    id: 'depolarizing',
    name: 'Depolarizing Noise',
    short: 'Depolarizing',
    pythonType: 3,
    description:
      'The standard benchmark channel: with probability p the qubit is hit by a randomly ' +
      'chosen Pauli error (X, Y or Z, each p/3). Fully depolarizes the qubit when p = 1. ' +
      'Python: depolarizing_error(p, 1).',
    math: 'E(ρ) = (1−p)·ρ + p/3·(XρX + YρY + ZρZ)',
    mainParam: 'Depolarizing probability p',
  },
];

export function getNoiseModel(id: NoiseModelId): NoiseModelInfo {
  return NOISE_MODELS.find((m) => m.id === id)!;
}

/**
 * Apply one noise layer to a state vector (quantum trajectories).
 * Returns the list of sampled error events for display.
 */
export function applyNoiseLayer(
  sv: StateVector,
  model: NoiseModelId,
  params: NoiseParams,
  rng: RNG,
  qubits?: number[]
): NoiseEvent[] {
  const qs = qubits ?? Array.from({ length: sv.n }, (_, i) => i);
  const events: NoiseEvent[] = [];
  const p = params.p;

  switch (model) {
    case 'bitflip':
      for (const q of qs) {
        if (rng() < p) {
          sv.applyGate1(q, GATES.X);
          events.push({ qubit: q, kind: 'X', prob: p });
        }
      }
      break;

    case 'phaseflip':
      for (const q of qs) {
        if (rng() < p) {
          sv.applyGate1(q, GATES.Z);
          events.push({ qubit: q, kind: 'Z', prob: p });
        }
      }
      break;

    case 'depolarizing':
      for (const q of qs) {
        const r = rng();
        if (r < p) {
          const which = rng();
          const kind: ErrorKind = which < 1 / 3 ? 'X' : which < 2 / 3 ? 'Y' : 'Z';
          sv.applyGate1(q, kind === 'X' ? GATES.X : kind === 'Y' ? GATES.Y : GATES.Z);
          events.push({ qubit: q, kind, prob: p / 3 });
        }
      }
      break;
  }

  return events;
}

/** Analytic fidelity of a bare (unprotected) single qubit under each noise model. */
export function bareQubitFidelity(model: NoiseModelId, params: NoiseParams, theta: number, phi: number): number {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  const p = params.p;
  const zExp = c * c - s * s;               // <Z>
  const xExp = 2 * c * s * Math.cos(phi);  // <X>
  switch (model) {
    case 'bitflip':
      // F = (1-p)*1 + p*<psi|X|psi>^2
      return (1 - p) + p * xExp * xExp;
    case 'phaseflip':
      return (1 - p) + p * zExp * zExp;
    case 'depolarizing':
      return 1 - (2 / 3) * p;
    default:
      return 1;
  }
}
