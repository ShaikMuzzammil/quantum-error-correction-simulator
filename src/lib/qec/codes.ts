/**
 * Quantum Error Correction codes (state-vector engine).
 *
 * Each code defines:
 *  - encoding / decoding circuits (real unitary circuits, visualized in the UI)
 *  - stabilizer generators (syndrome extracted via projective Pauli measurements)
 *  - an auto-generated syndrome -> correction lookup table (single-error optimal,
 *    nearest-match fallback for uncorrectable multi-error syndromes)
 */

import { Pauli, RNG, StateVector, GATES, fidelityFromRho, blochFromRho } from './engine';
import { NoiseModelId, NoiseParams, applyNoiseLayer, NoiseEvent } from './noise';

export interface GateOp {
  gate: 'H' | 'X' | 'Y' | 'Z' | 'S' | 'CNOT' | 'CZ' | 'CH' | 'RX' | 'RY' | 'RZ';
  qubits: number[];
  param?: number;
  comment?: string;
}

export interface StabilizerDef {
  paulis: Pauli[]; // length n
  label: string;
  type: 'X' | 'Z'; // dominant type (used for grouping / display)
}

export interface Correction {
  x: number[]; // qubits to apply X
  z: number[]; // qubits to apply Z
}

export interface SVCodeDef {
  id: string;
  name: string;
  short: string;
  n: number;
  k: number;
  d: number;
  family: string;
  corrects: string;
  description: string;
  logicalX: Pauli[];
  logicalZ: Pauli[];
  encoding: GateOp[];
  decoding: GateOp[]; // inverse circuit
  stabilizers: StabilizerDef[];
  correctionTable: Map<string, Correction>; // key = syndrome bit string
  projectionEncoding?: boolean; // 5-qubit code: encoded via stabilizer projection
}

// ---------------------------------------------------------------------------
// Syndrome table construction
// ---------------------------------------------------------------------------

function syndromeKey(bits: number[]): string {
  return bits.join('');
}

/** anticommutes between single-qubit Pauli a and stabilizer generator s */
function pauliAnticommute(a: Pauli, s: Pauli): boolean {
  if (a === 'I' || s === 'I') return false;
  return a !== s; // X-Z, X-Y, Y-Z anticommute; same types commute
}

export function syndromeOfError(code: SVCodeDef, qubit: number, err: Pauli): number[] {
  return code.stabilizers.map((st) => (pauliAnticommute(err, st.paulis[qubit]) ? 1 : 0));
}

/**
 * Build the syndrome -> correction map by enumerating all single-qubit errors.
 * First occurrence wins (handles degenerate codes like Shor correctly:
 * any within-block Z correction is equivalent up to stabilizers).
 */
export function buildCorrectionTable(code: Omit<SVCodeDef, 'correctionTable'>): Map<string, Correction> {
  const table = new Map<string, Correction>();
  // Order matters: pure X and Z errors take priority over Y in the lookup table.
  // Codes that cannot correct Y (e.g. repetition codes) share syndromes between
  // Y and the correctable pure error — the pure correction is the right choice.
  // Codes that DO correct Y (Shor/Steane/5-qubit) have distinct Y syndromes, so
  // this ordering is harmless for them.
  for (let q = 0; q < code.n; q++) {
    for (const err of ['X', 'Z', 'Y'] as Pauli[]) {
      const bits = syndromeOfError(code as SVCodeDef, q, err);
      // Errors with an all-zero syndrome are invisible to this code (degenerate with
      // identity, e.g. Z errors on a bit-flip code) — they must NOT be corrected.
      if (bits.every((b) => b === 0)) continue;
      const key = syndromeKey(bits);
      if (!table.has(key)) {
        table.set(key, {
          x: err === 'X' || err === 'Y' ? [q] : [],
          z: err === 'Z' || err === 'Y' ? [q] : [],
        });
      }
    }
  }
  return table;
}

/** Lookup correction with nearest-syndrome fallback (minimum Hamming distance). */
export function lookupCorrection(code: SVCodeDef, syndrome: number[]): Correction {
  // trivial syndrome -> no correction (prevents mis-correcting invisible errors)
  if (syndrome.every((b) => b === 0)) return { x: [], z: [] };
  const key = syndromeKey(syndrome);
  const direct = code.correctionTable.get(key);
  if (direct) return direct;
  // nearest match
  let bestKey: string | null = null;
  let bestDist = Infinity;
  for (const k of code.correctionTable.keys()) {
    let dist = 0;
    for (let i = 0; i < syndrome.length; i++) {
      if (k[i] !== String(syndrome[i])) dist++;
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = k;
    }
  }
  if (bestKey && bestDist <= 2) return code.correctionTable.get(bestKey)!;
  return { x: [], z: [] }; // give up (uncorrectable)
}

// ---------------------------------------------------------------------------
// Code definitions
// ---------------------------------------------------------------------------

function pauliStr(spec: string): Pauli[] {
  return spec.replace(/ /g, '').split('') as Pauli[];
}

function reverseOps(ops: GateOp[]): GateOp[] {
  return [...ops].reverse();
}

// --- 3-qubit bit-flip code --------------------------------------------------

const enc3b: GateOp[] = [
  { gate: 'CNOT', qubits: [0, 1] },
  { gate: 'CNOT', qubits: [0, 2] },
];

const code3BitflipBase = {
  id: 'code-3bitflip',
  name: '3-Qubit Bit-Flip Code',
  short: '3-Qubit Bit-Flip',
  n: 3,
  k: 1,
  d: 3,
  family: 'Repetition (CSS-like)',
  corrects: '1 bit-flip (X) error',
  description:
    'Encodes |psi> into alpha|000> + beta|111>. Majority voting via two Z-parity stabilizers ' +
    'localizes a single bit-flip. The workhorse introductory QEC code and the exact scheme ' +
    'walked through in our Phase-1 architecture example.',
  logicalX: pauliStr('XXX'),
  logicalZ: pauliStr('ZZZ'),
  encoding: enc3b,
  decoding: reverseOps(enc3b),
  stabilizers: [
    { paulis: pauliStr('ZZI'), label: 'Z0 Z1', type: 'Z' as const },
    { paulis: pauliStr('IZZ'), label: 'Z1 Z2', type: 'Z' as const },
  ],
};

export const CODE_3BITFLIP: SVCodeDef = {
  ...code3BitflipBase,
  correctionTable: buildCorrectionTable(code3BitflipBase as SVCodeDef),
};

// --- 3-qubit phase-flip code -------------------------------------------------

const enc3p: GateOp[] = [
  { gate: 'H', qubits: [0] },
  { gate: 'CNOT', qubits: [0, 1] },
  { gate: 'CNOT', qubits: [0, 2] },
  { gate: 'H', qubits: [0] },
  { gate: 'H', qubits: [1] },
  { gate: 'H', qubits: [2] },
];

const code3PhaseflipBase = {
  id: 'code-3phaseflip',
  name: '3-Qubit Phase-Flip Code',
  short: '3-Qubit Phase-Flip',
  n: 3,
  k: 1,
  d: 3,
  family: 'H-conjugated repetition',
  corrects: '1 phase-flip (Z) error',
  description:
    'The Hadamard-conjugate of the bit-flip code: encodes into the GHZ-like state ' +
    '(|+++> + |--->)/sqrt(2) and corrects a single phase flip using X-parity checks. ' +
    'Demonstrates that phase errors require a different detection strategy.',
  logicalX: pauliStr('XXX'),
  logicalZ: pauliStr('ZZZ'),
  encoding: enc3p,
  decoding: reverseOps(enc3p),
  stabilizers: [
    { paulis: pauliStr('XXI'), label: 'X0 X1', type: 'X' as const },
    { paulis: pauliStr('IXX'), label: 'X1 X2', type: 'X' as const },
  ],
};

export const CODE_3PHASEFLIP: SVCodeDef = {
  ...code3PhaseflipBase,
  correctionTable: buildCorrectionTable(code3PhaseflipBase as SVCodeDef),
};

// --- Repetition-5 (bit-flip) --------------------------------------------------

function makeRepetition(n: number, id: string, name: string, short: string): SVCodeDef {
  const encoding: GateOp[] = [];
  for (let t = 1; t < n; t++) encoding.push({ gate: 'CNOT', qubits: [0, t] });
  const stabs: StabilizerDef[] = [];
  for (let i = 0; i < n - 1; i++) {
    const stab: Pauli[] = new Array(n).fill('I');
    stab[i] = 'Z'; stab[i + 1] = 'Z';
    stabs.push({ paulis: stab, label: `Z${i} Z${i + 1}`, type: 'Z' });
  }
  const logicalX: Pauli[] = new Array(n).fill('X');
  const logicalZ: Pauli[] = new Array(n).fill('Z');
  const base = {
    id,
    name,
    short,
    n,
    k: 1,
    d: n,
    family: 'Repetition',
    corrects: `floor(${n}/2) = ${(n - 1) / 2} bit-flip (X) errors`,
    description:
      `Generalized n-qubit repetition code encoding into alpha|0...0> + beta|1...1>. ` +
      `A chain of n-1 parity checks plus majority voting corrects up to ${(n - 1) / 2} bit flips, ` +
      `showing how the protected error fraction grows with code size.`,
    logicalX,
    logicalZ,
    encoding,
    decoding: reverseOps(encoding),
    stabilizers: stabs,
  };
  return { ...base, correctionTable: buildCorrectionTable(base as SVCodeDef) } as SVCodeDef;
}

export const CODE_REP5: SVCodeDef = makeRepetition(5, 'code-rep5', '5-Qubit Repetition Code', '5-Qubit Repetition');

// --- Shor 9-qubit code ---------------------------------------------------------

const encShor: GateOp[] = [
  { gate: 'CNOT', qubits: [0, 3], comment: 'split into 3 blocks' },
  { gate: 'CNOT', qubits: [0, 6] },
  { gate: 'H', qubits: [0], comment: 'inner phase encoding' },
  { gate: 'H', qubits: [3] },
  { gate: 'H', qubits: [6] },
  { gate: 'CNOT', qubits: [0, 1], comment: 'grow GHZ blocks' },
  { gate: 'CNOT', qubits: [0, 2] },
  { gate: 'CNOT', qubits: [3, 4] },
  { gate: 'CNOT', qubits: [3, 5] },
  { gate: 'CNOT', qubits: [6, 7] },
  { gate: 'CNOT', qubits: [6, 8] },
];

const shorStabs: StabilizerDef[] = [
  { paulis: pauliStr('ZZIIIIIII'), label: 'Z0 Z1', type: 'Z' },
  { paulis: pauliStr('IZZIIIIII'), label: 'Z1 Z2', type: 'Z' },
  { paulis: pauliStr('IIIZZIIII'), label: 'Z3 Z4', type: 'Z' },
  { paulis: pauliStr('IIIIZZIII'), label: 'Z4 Z5', type: 'Z' },
  { paulis: pauliStr('IIIIIIZZI'), label: 'Z6 Z7', type: 'Z' },
  { paulis: pauliStr('IIIIIIIZZ'), label: 'Z7 Z8', type: 'Z' },
  { paulis: pauliStr('XXXXXXIII'), label: 'X0..X5', type: 'X' },
  { paulis: pauliStr('IIIXXXXXX'), label: 'X3..X8', type: 'X' },
];

const codeShorBase = {
  id: 'code-shor9',
  name: 'Shor 9-Qubit Code',
  short: 'Shor [[9,1,3]]',
  n: 9,
  k: 1,
  d: 3,
  family: 'Concatenated CSS',
  corrects: '1 ARBITRARY single-qubit error (X, Y and Z)',
  description:
    'The first quantum error-correcting code (Shor, 1995). Concatenates phase-flip protection ' +
    'on top of three bit-flip blocks, correcting any single-qubit error — both bit flips AND ' +
    'phase flips — using 8 stabilizer generators arranged in a 3x3 block structure.',
  logicalX: pauliStr('XIIXIIXII'), // X on qubits 0, 3, 6 (one per block)
  logicalZ: pauliStr('ZZZIIIIII'),
  encoding: encShor,
  decoding: reverseOps(encShor),
  stabilizers: shorStabs,
};

export const CODE_SHOR9: SVCodeDef = {
  ...codeShorBase,
  correctionTable: buildCorrectionTable(codeShorBase as SVCodeDef),
} as SVCodeDef;

// --- Steane 7-qubit code ---------------------------------------------------------

const encSteane: GateOp[] = [
  // Prepare Hamming superposition variables c0=q4, c1=q5, c2=q6
  { gate: 'H', qubits: [4] },
  { gate: 'H', qubits: [5] },
  { gate: 'H', qubits: [6] },
  // Copy c2 into q3 (auxiliary) BEFORE any contamination
  { gate: 'CNOT', qubits: [6, 3], comment: 'copy c2' },
  // Spread the PURE data bit d from q0 into all qubits FIRST
  // (|1_L> = coset 1̅ + C2⊥; later gates build x(c) ⊕ d on every qubit)
  { gate: 'CNOT', qubits: [0, 1] },
  { gate: 'CNOT', qubits: [0, 2] },
  { gate: 'CNOT', qubits: [0, 3] },
  { gate: 'CNOT', qubits: [0, 4] },
  { gate: 'CNOT', qubits: [0, 5] },
  { gate: 'CNOT', qubits: [0, 6] },
  // Row r0 = 1010101 from c0 (q4)
  { gate: 'CNOT', qubits: [4, 0] },
  { gate: 'CNOT', qubits: [4, 2] },
  { gate: 'CNOT', qubits: [4, 6] },
  // Row r1 = 0110011 from c1 (q5)
  { gate: 'CNOT', qubits: [5, 1] },
  { gate: 'CNOT', qubits: [5, 2] },
  { gate: 'CNOT', qubits: [5, 6] },
  // Finish row r2 = 0001111 using the CLEAN c2 copy in q3
  { gate: 'CNOT', qubits: [3, 4] },
  { gate: 'CNOT', qubits: [3, 5] },
];

const steaneStabs: StabilizerDef[] = [
  { paulis: pauliStr('ZIZIZIZ'), label: 'Z0Z2Z4Z6', type: 'Z' },
  { paulis: pauliStr('IZZIIZZ'), label: 'Z1Z2Z5Z6', type: 'Z' },
  { paulis: pauliStr('IIIZZZZ'), label: 'Z3Z4Z5Z6', type: 'Z' },
  { paulis: pauliStr('XIXIXIX'), label: 'X0X2X4X6', type: 'X' },
  { paulis: pauliStr('IXXIIXX'), label: 'X1X2X5X6', type: 'X' },
  { paulis: pauliStr('IIIXXXX'), label: 'X3X4X5X6', type: 'X' },
];

const codeSteaneBase = {
  id: 'code-steane7',
  name: 'Steane 7-Qubit Code',
  short: 'Steane [[7,1,3]]',
  n: 7,
  k: 1,
  d: 3,
  family: 'CSS (Hamming [7,4])',
  corrects: '1 ARBITRARY single-qubit error (X, Y and Z)',
  description:
    'Built from the classical [7,4,3] Hamming code via the CSS construction. Its X and Z ' +
    'corrections decouple cleanly (classical Hamming decoding on each syndrome), making it ' +
    'a favourite for fault-tolerant schemes and ion-trap demonstrations (lit. ref 8).',
  logicalX: pauliStr('XXXXXXX'),
  logicalZ: pauliStr('ZZZZZZZ'),
  encoding: encSteane,
  decoding: reverseOps(encSteane),
  stabilizers: steaneStabs,
};

export const CODE_STEANE7: SVCodeDef = {
  ...codeSteaneBase,
  correctionTable: buildCorrectionTable(codeSteaneBase as SVCodeDef),
};

// --- 5-qubit perfect code (projection encoding) -----------------------------------

const fiveQStabs: StabilizerDef[] = [
  { paulis: pauliStr('XZZXI'), label: 'XZZXI', type: 'X' },
  { paulis: pauliStr('IXZZX'), label: 'IXZZX', type: 'X' },
  { paulis: pauliStr('XIXZZ'), label: 'XIXZZ', type: 'X' },
  { paulis: pauliStr('ZXIXZ'), label: 'ZXIXZ', type: 'X' },
];

const code5QBase = {
  id: 'code-5qubit',
  name: 'Five-Qubit Perfect Code',
  short: 'Perfect [[5,1,3]]',
  n: 5,
  k: 1,
  d: 3,
  family: 'Stabilizer (non-CSS)',
  corrects: '1 ARBITRARY error with the MINIMUM number of qubits (5)',
  description:
    'The smallest possible code correcting an arbitrary single-qubit error — provably optimal ' +
    '(quantum Hamming bound saturated). Non-CSS: each stabilizer mixes X and Z. Encoded here ' +
    'by stabilizer projection; decoded by codespace readout of the logical amplitudes.',
  logicalX: pauliStr('XXXXX'),
  logicalZ: pauliStr('ZZZZZ'),
  encoding: [] as GateOp[],
  decoding: [] as GateOp[],
  stabilizers: fiveQStabs,
  projectionEncoding: true,
};

export const CODE_5QUBIT: SVCodeDef = {
  ...code5QBase,
  correctionTable: buildCorrectionTable(code5QBase as SVCodeDef),
} as SVCodeDef;

export const SV_CODES: SVCodeDef[] = [
  CODE_3BITFLIP,
  CODE_3PHASEFLIP,
  CODE_REP5,
  CODE_SHOR9,
  CODE_STEANE7,
  CODE_5QUBIT,
];

export function getSVCode(id: string): SVCodeDef {
  const c = SV_CODES.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown code ${id}`);
  return c;
}

// ---------------------------------------------------------------------------
// Projection encoding (5-qubit code) + codespace readout decoding
// ---------------------------------------------------------------------------

/**
 * Encode |psi>|0...0> into the codespace by sequentially projecting onto each
 * stabilizer's +1 eigenspace (deterministic, exact):
 *   psi' = (psi + S psi) / sqrt(2(1+<S>))
 * The result equals P_code |psi>|0...0> up to normalization — the true encoded state.
 */
export function projectionEncode(code: SVCodeDef, sv: StateVector) {
  for (const st of code.stabilizers) {
    const s = sv.expectPauli(st.paulis);
    const denom = Math.sqrt(2 * (1 + s));
    if (denom < 1e-9) {
      throw new Error('Projection encoding failed: state has no overlap with the +1 eigenspace');
    }
    const svS = sv.clone();
    svS.applyPauliString(st.paulis);
    const d = sv.data, sd = svS.data;
    for (let i = 0; i < d.length; i++) d[i] = (d[i] + sd[i]) / denom;
  }
}

// cached |0_L>, |1_L> reference states for codespace readout decoding
const readoutCache = new Map<string, { ref0: Float64Array; ref1: Float64Array; size: number }>();

function getReadoutRefs(code: SVCodeDef) {
  let cached = readoutCache.get(code.id);
  if (!cached) {
    const ref0 = new StateVector(code.n);
    projectionEncode(code, ref0);
    const ref1 = new StateVector(code.n);
    ref1.prepareQubit0(Math.PI, 0); // |1>
    projectionEncode(code, ref1);
    cached = { ref0: ref0.data.slice(), ref1: ref1.data.slice(), size: ref0.size };
    readoutCache.set(code.id, cached);
  }
  return cached;
}

/**
 * Decode via codespace readout: project the (already corrected) state onto
 * |0_L> and |1_L> reference states to obtain the logical 1-qubit density matrix.
 */
export function codespaceReadout(code: SVCodeDef, sv: StateVector): number[] {
  const { ref0, ref1 } = getReadoutRefs(code);

  const inner = (ref: Float64Array) => {
    let re = 0, im = 0;
    for (let i = 0; i < sv.size; i++) {
      const rr = ref[2 * i], ri = ref[2 * i + 1];
      const pr = sv.data[2 * i], pi = sv.data[2 * i + 1];
      // conj(ref) * psi
      re += rr * pr + ri * pi;
      im += rr * pi - ri * pr;
    }
    return { re, im };
  };

  const a = inner(ref0); // <0_L|psi>
  const b = inner(ref1); // <1_L|psi>
  const rho = new Float64Array(8);
  rho[0] = a.re * a.re + a.im * a.im;
  rho[6] = b.re * b.re + b.im * b.im;
  rho[2] = a.re * b.re + a.im * b.im;              // a * conj(b), real part
  rho[3] = a.im * b.re - a.re * b.im;              // imaginary part
  rho[4] = rho[2];
  rho[5] = -rho[3];
  return Array.from(rho);
}

// ---------------------------------------------------------------------------
// Full single-shot pipeline (state-vector codes)
// ---------------------------------------------------------------------------

export interface ForcedError {
  qubit: number;
  x?: boolean;
  z?: boolean;
}

export interface ShotOptions {
  theta: number;
  phi: number;
  noise: NoiseModelId;
  params: NoiseParams;
  forcedErrors?: ForcedError[] | null; // manual error injection (skip random sampling)
  measureSyndrome?: boolean;           // if false, skip syndrome+correction (diagnostics)
  pMeas?: number;                      // syndrome readout error
}

export interface ShotResult {
  fidelity: number;
  rho: number[];
  bloch: { x: number; y: number; z: number };
  syndrome: number[];          // 1 = defect
  syndromeLabels: string[];
  correction: Correction;
  noiseEvents: NoiseEvent[];
  detected: boolean;
}

/** Run one noisy shot: encode -> noise -> syndrome -> correct -> decode -> readout */
export function runShot(code: SVCodeDef, opts: ShotOptions, rng: RNG): ShotResult {
  const sv = new StateVector(code.n);
  sv.prepareQubit0(opts.theta, opts.phi);

  // encode
  if (code.projectionEncoding) {
    projectionEncode(code, sv);
  } else {
    for (const op of code.encoding) sv.applyGateOp(op.gate, op.qubits, op.param);
  }

  // noise
  let noiseEvents: NoiseEvent[] = [];
  if (opts.forcedErrors && opts.forcedErrors.length > 0) {
    for (const fe of opts.forcedErrors) {
      if (fe.x) {
        sv.applyGate1(fe.qubit, GATES.X);
        noiseEvents.push({ qubit: fe.qubit, kind: 'X', prob: 1 });
      }
      if (fe.z) {
        sv.applyGate1(fe.qubit, GATES.Z);
        noiseEvents.push({ qubit: fe.qubit, kind: 'Z', prob: 1 });
      }
    }
  } else {
    noiseEvents = applyNoiseLayer(sv, opts.noise, opts.params, rng);
  }

  // syndrome extraction + correction
  const syndrome: number[] = [];
  const labels: string[] = [];
  let correction: Correction = { x: [], z: [] };
  if (opts.measureSyndrome !== false) {
    for (const st of code.stabilizers) {
      const { outcome } = sv.measurePauli(st.paulis, rng, (opts.pMeas ?? 0) > 0 && rng() < (opts.pMeas ?? 0));
      syndrome.push(outcome === -1 ? 1 : 0);
      labels.push(st.label);
    }
    correction = lookupCorrection(code, syndrome);
    for (const q of correction.x) sv.applyGate1(q, GATES.X);
    for (const q of correction.z) sv.applyGate1(q, GATES.Z);
  }

  // decode
  let rho: number[];
  if (code.projectionEncoding) {
    rho = codespaceReadout(code, sv);
  } else {
    for (const op of code.decoding) sv.applyGateOp(op.gate, op.qubits, op.param);
    rho = sv.partialTraceQ0();
  }

  return {
    fidelity: fidelityFromRho(rho, opts.theta, opts.phi),
    rho,
    bloch: blochFromRho(rho),
    syndrome,
    syndromeLabels: labels,
    correction,
    noiseEvents,
    detected: syndrome.some((s) => s === 1),
  };
}

// re-exports for downstream modules
export { fidelityFromRho, blochFromRho };
