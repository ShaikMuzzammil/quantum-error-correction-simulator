/**
 * Noise models for QEC simulation.
 * Each model samples discrete error events per qubit (quantum-trajectory style)
 * and can also describe itself analytically for UI display.
 */
import { StateVector, RNG, GATES, rx } from './engine';

export type NoiseModelId =
  | 'bitflip'
  | 'phaseflip'
  | 'depolarizing'
  | 'amplitude-damping'
  | 'phase-damping'
  | 'thermal-relaxation'
  | 'coherent-rotation'
  | 'crosstalk';

export interface NoiseParams {
  /** main error probability (0..1) */
  p: number;
  /** crosstalk correlated-pair probability */
  pCrosstalk?: number;
  /** coherent over-rotation angle in radians */
  theta?: number;
  /** T1 / T2 in units of gate time (for thermal relaxation) */
  T1?: number;
  T2?: number;
  /** syndrome readout error probability */
  pMeas?: number;
}

export type ErrorKind = 'X' | 'Y' | 'Z' | 'AMP' | 'XX' | 'ROT';

/**
 * Build NoiseParams correctly for the selected channel (v3 fix):
 *  - p-based channels (bitflip, phaseflip, depolarizing, amplitude/phase damping,
 *    crosstalk) use `p` directly.
 *  - coherent-rotation ignores `p` and uses `theta`; callers pass `rotDeg`.
 *  - thermal-relaxation ignores `p` and uses T1/T2 (gate-time units).
 * Keeping this in one place guarantees every lab drives the engine correctly.
 */
export function noiseParams(
  p: number,
  noise: NoiseModelId,
  opts?: { rotDeg?: number; T1?: number; T2?: number; pCrosstalk?: number; pMeas?: number }
): NoiseParams {
  return {
    p,
    pCrosstalk: opts?.pCrosstalk ?? 0.02,
    theta: noise === 'coherent-rotation' ? ((opts?.rotDeg ?? 10) * Math.PI) / 180 : 0.15,
    T1: opts?.T1 ?? 5,
    T2: opts?.T2 ?? 5,
    pMeas: opts?.pMeas,
  };
}

export interface NoiseEvent {
  qubit: number;      // for XX: first qubit of the pair
  qubit2?: number;    // for XX
  kind: ErrorKind;
  prob: number;       // channel probability that produced this event
}

export interface NoiseModelInfo {
  id: NoiseModelId;
  name: string;
  short: string;
  description: string;
  math: string;
  pauliOnly: boolean; // can be used with the surface-code Pauli-frame engine
  mainParam: string;
}

export const NOISE_MODELS: NoiseModelInfo[] = [
  {
    id: 'bitflip',
    name: 'Bit-Flip (X) Noise',
    short: 'Bit-flip',
    description:
      'A spurious Pauli-X gate flips the qubit state: |0> becomes |1> and vice versa. ' +
      'Classically analogous to a bit flip, this is the simplest quantum error and the one ' +
      'the 3-qubit repetition code was designed for.',
    math: 'E(ρ) = (1−p)·ρ + p·XρX',
    pauliOnly: true,
    mainParam: 'Flip probability p',
  },
  {
    id: 'phaseflip',
    name: 'Phase-Flip (Z) Noise',
    short: 'Phase-flip',
    description:
      'A Pauli-Z gate flips the relative phase of a superposition: |+> becomes |−>. ' +
      'This error has no classical analogue and is invisible to bit-flip codes — ' +
      'motivating phase-flip and Shor-type codes.',
    math: 'E(ρ) = (1−p)·ρ + p·ZρZ',
    pauliOnly: true,
    mainParam: 'Phase-flip probability p',
  },
  {
    id: 'depolarizing',
    name: 'Depolarizing Noise',
    short: 'Depolarizing',
    description:
      'The standard "gold standard" noise model: with probability p the qubit is hit by a ' +
      'randomly chosen Pauli error (X, Y or Z, each p/3). Fully depolarizes the qubit when p = 1.',
    math: 'E(ρ) = (1−p)·ρ + p/3·(XρX + YρY + ZρZ)',
    pauliOnly: true,
    mainParam: 'Depolarizing probability p',
  },
  {
    id: 'amplitude-damping',
    name: 'Amplitude Damping (Energy Loss)',
    short: 'Amplitude damping',
    description:
      'Models energy dissipation to the environment: |1> decays toward |0> with probability γ. ' +
      'A non-Pauli channel that also shrinks coherence — much harder for QEC codes to handle.',
    math: 'E0 = [[1,0],[0,√(1−γ)]],  E1 = [[0,√γ],[0,0]]',
    pauliOnly: false,
    mainParam: 'Damping probability γ',
  },
  {
    id: 'phase-damping',
    name: 'Phase Damping (Dephasing)',
    short: 'Phase damping',
    description:
      'Pure dephasing: the environment learns which path the superposition takes, destroying ' +
      'off-diagonal coherence without changing populations. Equivalent to a random-Z channel.',
    math: 'E(ρ): ρ01 → (1−2p)·ρ01   (random Z w.p. p)',
    pauliOnly: true,
    mainParam: 'Dephasing probability p',
  },
  {
    id: 'thermal-relaxation',
    name: 'Thermal Relaxation (T1/T2)',
    short: 'Thermal relaxation',
    description:
      'The realistic hardware model combining amplitude damping (T1 decay toward |0>) with ' +
      'pure dephasing (T2). Captured over one gate time t = 1 with configurable T1 and T2, ' +
      'following the standard composite-channel construction.',
    math: 'γ = 1−e^(−t/T1),  coherence × e^(−t/T2)',
    pauliOnly: false,
    mainParam: 'T1, T2 (gate-time units)',
  },
  {
    id: 'coherent-rotation',
    name: 'Coherent Over-Rotation',
    short: 'Coherent rotation',
    description:
      'A systematic control error: every qubit receives an unwanted Rx(θ) rotation. Unlike ' +
      'stochastic Pauli noise, coherent errors add constructively between qubits and rounds, ' +
      'which is why they are the hardest class for standard QEC (lit. refs 3, 5, 7).',
    math: 'U = ⊗ Rx(θ),  deterministic',
    pauliOnly: false,
    mainParam: 'Rotation angle θ',
  },
  {
    id: 'crosstalk',
    name: 'Crosstalk (Correlated XX)',
    short: 'Crosstalk',
    description:
      'Neighbouring qubits error together: besides the base single-qubit depolarizing noise, ' +
      'each adjacent pair (i, i+1) suffers a correlated XX error with probability p_xtalk. ' +
      'Correlated errors break the independence assumption of many decoders (lit. ref 4).',
    math: 'E = E_depol(p) + Σ_pairs p_xtalk·XX_ij',
    pauliOnly: true,
    mainParam: 'Base p + crosstalk p_xtalk',
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

    case 'phase-damping':
      for (const q of qs) {
        if (rng() < p) {
          sv.applyGate1(q, GATES.Z);
          events.push({ qubit: q, kind: 'Z', prob: p });
        }
      }
      break;

    case 'amplitude-damping': {
      const gamma = p;
      for (const q of qs) {
        const p1 = sv.probOne(q);
        const jumped = amplitudeDampingTrajectory(sv, q, gamma, rng);
        if (jumped) {
          events.push({ qubit: q, kind: 'AMP', prob: gamma * p1 });
        }
      }
      break;
    }

    case 'thermal-relaxation': {
      const t = 1;
      const T1 = Math.max(0.05, params.T1 ?? 5);
      const T2raw = Math.max(0.05, params.T2 ?? 5);
      const T2 = Math.min(T2raw, 2 * T1); // physical bound
      const gamma = 1 - Math.exp(-t / T1);
      const coherenceAfterAD = Math.exp(-t / (2 * T1));
      const target = Math.exp(-t / T2);
      let pz = (1 - target / coherenceAfterAD) / 2;
      pz = Math.max(0, pz);
      for (const q of qs) {
        const p1 = sv.probOne(q);
        const jumped = amplitudeDampingTrajectory(sv, q, gamma, rng);
        if (jumped) {
          events.push({ qubit: q, kind: 'AMP', prob: gamma * p1 });
        }
        if (rng() < pz) {
          sv.applyGate1(q, GATES.Z);
          events.push({ qubit: q, kind: 'Z', prob: pz });
        }
      }
      break;
    }

    case 'coherent-rotation': {
      const theta = params.theta ?? 0.1;
      for (const q of qs) {
        sv.applyGate1(q, rx(theta));
        events.push({ qubit: q, kind: 'ROT', prob: 1 }); // deterministic unitary
      }
      break;
    }

    case 'crosstalk': {
      const pXt = params.pCrosstalk ?? 0.02;
      // base layer: depolarizing
      for (const q of qs) {
        const r = rng();
        if (r < p) {
          const which = rng();
          const kind: ErrorKind = which < 1 / 3 ? 'X' : which < 2 / 3 ? 'Y' : 'Z';
          sv.applyGate1(q, kind === 'X' ? GATES.X : kind === 'Y' ? GATES.Y : GATES.Z);
          events.push({ qubit: q, kind, prob: p / 3 });
        }
      }
      // correlated XX pairs on neighbours (within the given qubit list, order-preserving)
      for (let i = 0; i < qs.length - 1; i++) {
        if (rng() < pXt) {
          const a = qs[i], b = qs[i + 1];
          sv.applyGate1(a, GATES.X);
          sv.applyGate1(b, GATES.X);
          events.push({ qubit: a, qubit2: b, kind: 'XX', prob: pXt });
        }
      }
      break;
    }
  }

  return events;
}

/**
 * Amplitude-damping quantum trajectory on qubit q.
 * Samples the jump / no-jump branch and applies the normalized Kraus operator.
 * Returns true if a decay event (|1> -> |0> emission) occurred.
 */
function amplitudeDampingTrajectory(sv: StateVector, q: number, gamma: number, rng: RNG): boolean {
  const bit = 1 << q;
  const p1 = sv.probOne(q);
  const pJump = gamma * p1;
  const old = sv.data.slice();
  const d = sv.data;
  if (rng() < pJump) {
    // Jump branch: E1|psi> / sqrt(gamma*p1): amp[q=0 basis] += amp[q=1 basis] / sqrt(p1)
    const inv = 1 / Math.sqrt(p1);
    for (let i = 0; i < sv.size; i++) {
      if (i & bit) {
        d[2 * i] = 0; d[2 * i + 1] = 0;
      } else {
        const j = i | bit;
        d[2 * i] = old[2 * j] * inv;
        d[2 * i + 1] = old[2 * j + 1] * inv;
      }
    }
    return true;
  } else {
    // No-jump branch: E0|psi> / sqrt(1 - gamma*p1)
    const inv = 1 / Math.sqrt(1 - pJump);
    const keep = Math.sqrt(1 - gamma) * inv;
    for (let i = 0; i < sv.size; i++) {
      if (i & bit) {
        d[2 * i] = old[2 * i] * keep;
        d[2 * i + 1] = old[2 * i + 1] * keep;
      } else {
        d[2 * i] = old[2 * i] * inv;
        d[2 * i + 1] = old[2 * i + 1] * inv;
      }
    }
    return false;
  }
}

/** Analytic fidelity of a bare (unprotected) single qubit under each noise model. */
export function bareQubitFidelity(model: NoiseModelId, params: NoiseParams, theta: number, phi: number): number {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  const p = params.p;
  const zExp = c * c - s * s;               // <Z>
  const xExp = 2 * c * s * Math.cos(phi);  // <X>
  const yExp = 2 * c * s * Math.sin(phi);  // <Y>
  switch (model) {
    case 'bitflip':
      // F = (1-p)*1 + p*<psi|X|psi>^2
      return (1 - p) + p * xExp * xExp;
    case 'phaseflip':
    case 'phase-damping':
      return (1 - p) + p * zExp * zExp;
    case 'depolarizing':
      return 1 - (2 / 3) * p;
    case 'amplitude-damping': {
      const gamma = p;
      // rho00 = c^2 + gamma s^2 ; rho11 = s^2 (1-gamma) ; rho01 = c s sqrt(1-gamma) e^{-i phi}
      return c * c * (c * c + gamma * s * s) + s * s * (s * s * (1 - gamma))
        + 2 * c * c * s * s * Math.sqrt(1 - gamma);
    }
    case 'thermal-relaxation': {
      const T1 = Math.max(0.05, params.T1 ?? 5);
      const T2raw = Math.max(0.05, params.T2 ?? 5);
      const T2 = Math.min(T2raw, 2 * T1);
      const gamma = 1 - Math.exp(-1 / T1);
      const coh = Math.exp(-1 / T2);
      return c * c * (c * c + gamma * s * s) + s * s * (s * s * (1 - gamma))
        + 2 * c * c * s * s * coh;
    }
    case 'coherent-rotation': {
      const thetaR = params.theta ?? 0.1;
      const n = [xExp, yExp, zExp];
      const ct = Math.cos(thetaR), st = Math.sin(thetaR);
      const y2 = n[1] * ct - n[2] * st;
      const z2 = n[1] * st + n[2] * ct;
      return 0.5 * (1 + n[0] * n[0] + y2 * n[1] + z2 * n[2]);
    }
    case 'crosstalk': {
      return 1 - (2 / 3) * p;
    }
    default:
      return 1;
  }
}
