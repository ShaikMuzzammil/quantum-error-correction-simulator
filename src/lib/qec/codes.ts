/**
 * Quantum Error Correction codes (state-vector engine).
 *
 * SCOPE — this prototype implements exactly what our Python reference
 * (all_with_noise_prob.py) implements, nothing more:
 *   1. 3-Qubit Bit-Flip QEC   (bit_flip_qec)
 *   2. 3-Qubit Phase-Flip QEC (phase_flip_qec)
 *
 * Each code defines:
 *  - encoding / decoding circuits (real unitary circuits, visualized in the UI)
 *  - stabilizer generators (syndrome extracted via projective Pauli measurements —
 *    the ancilla-free equivalent of the Python file's q3/q4 ancilla checks)
 *  - an auto-generated syndrome -> correction lookup table (single-error optimal,
 *    nearest-match fallback for uncorrectable multi-error syndromes)
 *
 * The exact Python-file circuits (5 qubits + 3 classical bits, mid-circuit
 * syndrome measurement and conditional corrections) are defined in
 * buildPythonCircuit() and rendered 1:1 in the Simulator Lab.
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
  /** 1 = bit-flip QEC, 2 = phase-flip QEC — the Python file's qec_type */
  pythonType: 1 | 2;
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
 * First occurrence wins; errors with a trivial (all-zero) syndrome are invisible
 * to the code (degenerate with identity) and must NOT be corrected.
 */
export function buildCorrectionTable(code: Omit<SVCodeDef, 'correctionTable'>): Map<string, Correction> {
  const table = new Map<string, Correction>();
  // Order matters: pure X and Z errors take priority over Y in the lookup table.
  // The repetition-style 3-qubit codes cannot distinguish Y from its X/Z component,
  // so the pure correction is the right choice (matches the Python file's X fixes).
  for (let q = 0; q < code.n; q++) {
    for (const err of ['X', 'Z', 'Y'] as Pauli[]) {
      const bits = syndromeOfError(code as SVCodeDef, q, err);
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
// Code definitions — EXACTLY the two codes from all_with_noise_prob.py
// ---------------------------------------------------------------------------

function pauliStr(spec: string): Pauli[] {
  return spec.replace(/ /g, '').split('') as Pauli[];
}

function reverseOps(ops: GateOp[]): GateOp[] {
  return [...ops].reverse();
}

// --- 3-qubit bit-flip code (python_type = 1) --------------------------------
// Python: qc.cx(0,1); qc.cx(0,2)  — encodes |psi> into alpha|000> + beta|111>

const enc3b: GateOp[] = [
  { gate: 'CNOT', qubits: [0, 1], comment: 'copy q0 into q1' },
  { gate: 'CNOT', qubits: [0, 2], comment: 'copy q0 into q2' },
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
    'Encodes |psi> into alpha|000> + beta|111>. Majority voting via two Z-parity checks ' +
    '(q3 checks q0,q1 and q4 checks q1,q2 in the Python circuit) localizes a single bit-flip. ' +
    'This is the workhorse introductory QEC code and the exact scheme in all_with_noise_prob.py.',
  logicalX: pauliStr('XXX'),
  logicalZ: pauliStr('ZZZ'),
  encoding: enc3b,
  decoding: reverseOps(enc3b),
  stabilizers: [
    { paulis: pauliStr('ZZI'), label: 'Z0 Z1', type: 'Z' as const },
    { paulis: pauliStr('IZZ'), label: 'Z1 Z2', type: 'Z' as const },
  ],
  pythonType: 1 as const,
};

export const CODE_3BITFLIP: SVCodeDef = {
  ...code3BitflipBase,
  correctionTable: buildCorrectionTable(code3BitflipBase as SVCodeDef),
};

// --- 3-qubit phase-flip code (python_type = 2) --------------------------------
// Python: H(0); CX(0,1); CX(0,2); H(0),H(1),H(2) — convert to phase basis,
// protect against Z flips with X-parity checks, then convert back.

const enc3p: GateOp[] = [
  { gate: 'H', qubits: [0], comment: 'convert to phase basis' },
  { gate: 'CNOT', qubits: [0, 1] },
  { gate: 'CNOT', qubits: [0, 2] },
  { gate: 'H', qubits: [0], comment: 'encode into |+++>/|--- basis' },
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
    'Demonstrates that phase errors require a different detection strategy — the second ' +
    'circuit in all_with_noise_prob.py.',
  logicalX: pauliStr('XXX'),
  logicalZ: pauliStr('ZZZ'),
  encoding: enc3p,
  decoding: reverseOps(enc3p),
  stabilizers: [
    { paulis: pauliStr('XXI'), label: 'X0 X1', type: 'X' as const },
    { paulis: pauliStr('IXX'), label: 'X1 X2', type: 'X' as const },
  ],
  pythonType: 2 as const,
};

export const CODE_3PHASEFLIP: SVCodeDef = {
  ...code3PhaseflipBase,
  correctionTable: buildCorrectionTable(code3PhaseflipBase as SVCodeDef),
};

export const SV_CODES: SVCodeDef[] = [CODE_3BITFLIP, CODE_3PHASEFLIP];

export function getSVCode(id: string): SVCodeDef {
  const c = SV_CODES.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown code ${id}`);
  return c;
}

// ---------------------------------------------------------------------------
// The EXACT circuits from all_with_noise_prob.py (5 qubits + 3 classical bits)
// ---------------------------------------------------------------------------
// These mirror the Python file operation-by-operation, including the q3/q4
// syndrome ancillas, the id-gate noise insertion point, mid-circuit measurement,
// conditional (if_test) corrections and the decode + final measurement.

export type PyOp =
  | { kind: 'gate'; gate: 'H' | 'X' | 'ID'; qubit: number; comment?: string }
  | { kind: 'cnot'; control: number; target: number; comment?: string }
  | { kind: 'measure'; qubit: number; clbit: number; comment?: string }
  | {
      kind: 'ifx';
      /** value the classical register must equal for the X to fire (Python if_test) */
      regValue: number;
      /** syndrome bit string, e.g. '01' */
      syndrome: string;
      target: number;
      comment?: string;
    };

export interface PythonCircuit {
  title: string;
  /** quantum wires (5) + classical wires (3) */
  nQ: number;
  nC: number;
  ops: PyOp[];
  /** stage boundaries for the labelled bands: [startOpIndex, label] */
  stages: { at: number; label: string }[];
}

export function buildPythonCircuit(pythonType: 1 | 2, inputBit: 0 | 1, errorQubit: 0 | 1 | 2): PythonCircuit {
  const ops: PyOp[] = [];
  const stages: { at: number; label: string }[] = [];
  const mark = (label: string) => stages.push({ at: ops.length, label });

  mark(inputBit === 1 ? '1. INPUT (X on q0)' : '1. INPUT |0⟩');
  if (inputBit === 1) ops.push({ kind: 'gate', gate: 'X', qubit: 0, comment: 'input_bit = 1' });

  if (pythonType === 1) {
    mark('2. QEC ENCODING');
    ops.push({ kind: 'cnot', control: 0, target: 1, comment: 'qc.cx(0,1)' });
    ops.push({ kind: 'cnot', control: 0, target: 2, comment: 'qc.cx(0,2)' });

    mark('3. NOISE INSERTION (id gate)');
    ops.push({ kind: 'gate', gate: 'ID', qubit: errorQubit, comment: `qc.id(${errorQubit}) — noise attaches here` });

    mark('4. SYNDROME DETECTION');
    ops.push({ kind: 'cnot', control: 0, target: 3, comment: 'q3 checks q0,q1' });
    ops.push({ kind: 'cnot', control: 1, target: 3 });
    ops.push({ kind: 'cnot', control: 1, target: 4, comment: 'q4 checks q1,q2' });
    ops.push({ kind: 'cnot', control: 2, target: 4 });

    mark('5. MEASURE SYNDROME');
    ops.push({ kind: 'measure', qubit: 3, clbit: 0, comment: 'qc.measure(3,0)' });
    ops.push({ kind: 'measure', qubit: 4, clbit: 1, comment: 'qc.measure(4,1)' });

    mark('6. ERROR CORRECTION (if_test)');
    ops.push({ kind: 'ifx', regValue: 1, syndrome: '01', target: 0, comment: '01 -> q0 error' });
    ops.push({ kind: 'ifx', regValue: 3, syndrome: '11', target: 1, comment: '11 -> q1 error' });
    ops.push({ kind: 'ifx', regValue: 2, syndrome: '10', target: 2, comment: '10 -> q2 error' });

    mark('7. DECODE');
    ops.push({ kind: 'cnot', control: 0, target: 1, comment: 'qc.cx(0,1)' });
    ops.push({ kind: 'cnot', control: 0, target: 2, comment: 'qc.cx(0,2)' });

    mark('8. FINAL MEASUREMENT');
    ops.push({ kind: 'measure', qubit: 0, clbit: 2, comment: 'qc.measure(0,2)' });
  } else {
    mark('2. CONVERT TO PHASE BASIS');
    ops.push({ kind: 'gate', gate: 'H', qubit: 0, comment: 'qc.h(0)' });

    mark('3. QEC ENCODING');
    ops.push({ kind: 'cnot', control: 0, target: 1, comment: 'qc.cx(0,1)' });
    ops.push({ kind: 'cnot', control: 0, target: 2, comment: 'qc.cx(0,2)' });
    ops.push({ kind: 'gate', gate: 'H', qubit: 0, comment: 'convert encoded state' });
    ops.push({ kind: 'gate', gate: 'H', qubit: 1, comment: 'to phase basis' });
    ops.push({ kind: 'gate', gate: 'H', qubit: 2 });

    mark('4. NOISE INSERTION (id gate)');
    ops.push({ kind: 'gate', gate: 'ID', qubit: errorQubit, comment: `qc.id(${errorQubit}) — noise attaches here` });

    mark('5. CONVERT BACK');
    ops.push({ kind: 'gate', gate: 'H', qubit: 0 });
    ops.push({ kind: 'gate', gate: 'H', qubit: 1 });
    ops.push({ kind: 'gate', gate: 'H', qubit: 2 });

    mark('6. SYNDROME DETECTION');
    ops.push({ kind: 'cnot', control: 0, target: 3, comment: 'q3 checks q0,q1' });
    ops.push({ kind: 'cnot', control: 1, target: 3 });
    ops.push({ kind: 'cnot', control: 1, target: 4, comment: 'q4 checks q1,q2' });
    ops.push({ kind: 'cnot', control: 2, target: 4 });

    mark('7. MEASURE SYNDROME');
    ops.push({ kind: 'measure', qubit: 3, clbit: 0, comment: 'qc.measure(3,0)' });
    ops.push({ kind: 'measure', qubit: 4, clbit: 1, comment: 'qc.measure(4,1)' });

    mark('8. ERROR CORRECTION (if_test)');
    ops.push({ kind: 'ifx', regValue: 1, syndrome: '01', target: 0, comment: '01 -> q0 error' });
    ops.push({ kind: 'ifx', regValue: 3, syndrome: '11', target: 1, comment: '11 -> q1 error' });
    ops.push({ kind: 'ifx', regValue: 2, syndrome: '10', target: 2, comment: '10 -> q2 error' });

    mark('9. DECODE');
    ops.push({ kind: 'cnot', control: 0, target: 2, comment: 'qc.cx(0,2)' });
    ops.push({ kind: 'cnot', control: 0, target: 1, comment: 'qc.cx(0,1)' });

    mark('10. RETURN TO ORIGINAL BASIS');
    ops.push({ kind: 'gate', gate: 'H', qubit: 0, comment: 'qc.h(0)' });

    mark('11. FINAL MEASUREMENT');
    ops.push({ kind: 'measure', qubit: 0, clbit: 2, comment: 'qc.measure(0,2)' });
  }

  return {
    title: pythonType === 1 ? 'bit_flip_qec(input_bit, error_qubit)' : 'phase_flip_qec(input_bit, error_qubit)',
    nQ: 5,
    nC: 3,
    ops,
    stages,
  };
}

/** The Python file's QEC STATUS selection logic (verbatim wording). */
export function pythonQecStatus(noiseType: 1 | 2 | 3, qecType: 1 | 2): { status: 'MATCHED' | 'DEPOLARIZING' | 'NOT MATCHED'; lines: string[] } {
  if (noiseType === 1 && qecType === 1) {
    return {
      status: 'MATCHED',
      lines: ['Bit-flip noise is being tested', 'using the 3-qubit Bit-Flip QEC.'],
    };
  }
  if (noiseType === 2 && qecType === 2) {
    return {
      status: 'MATCHED',
      lines: ['Phase-flip noise is being tested', 'using the 3-qubit Phase-Flip QEC.'],
    };
  }
  if (noiseType === 3) {
    return {
      status: 'DEPOLARIZING',
      lines: ['Depolarizing noise is being tested', 'with the selected QEC code.'],
    };
  }
  return {
    status: 'NOT MATCHED',
    lines: ['The selected QEC code is not', 'specifically matched to this noise.'],
  };
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
  for (const op of code.encoding) sv.applyGateOp(op.gate, op.qubits, op.param);

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

  // decode (inverse encoding circuit) + logical readout
  for (const op of code.decoding) sv.applyGateOp(op.gate, op.qubits, op.param);
  const rho = sv.partialTraceQ0();

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
