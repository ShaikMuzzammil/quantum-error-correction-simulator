/**
 * Verification suite for the focused QEC engine.
 *
 * Scope = exactly all_with_noise_prob.py: 2 codes (bit-flip, phase-flip) ×
 * 3 noise channels (X, Z, depolarizing). Run: bun scripts/test-qec.mjs
 */
import { makeRng, StateVector, GATES, fidelityFromRho, blochFromRho } from '../src/lib/qec/engine.ts';
import { CODE_3BITFLIP, CODE_3PHASEFLIP, SV_CODES, getSVCode, buildCorrectionTable, lookupCorrection, runShot, syndromeOfError, buildPythonCircuit } from '../src/lib/qec/codes.ts';
import { NOISE_MODELS, applyNoiseLayer, noiseParams, bareQubitFidelity } from '../src/lib/qec/noise.ts';
import { runTrace, mcRun, sweepSV, prepareEncodedState, runLiveRound, runBareRound, readLogicalBloch } from '../src/lib/qec/pipeline.ts';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name);
  }
}

function approx(a, b, tol = 0.02) {
  return Math.abs(a - b) < tol;
}

/* ------------------------------------------------------------------ */
/* 1. Engine core                                                      */
/* ------------------------------------------------------------------ */
{
  const sv = new StateVector(1);
  check('engine: |0> init', sv.probOne(0) === 0);
  sv.applyGate1(0, GATES.X);
  check('engine: X flips |0> to |1>', approx(sv.probOne(0), 1, 1e-12));
  sv.applyGate1(0, GATES.H);
  check('engine: H on |1> → 50/50', approx(sv.probOne(0), 0.5, 1e-12));
  const rho = sv.partialTraceQ0();
  check('engine: rho of |+> is maximally mixed', approx(rho[0], 0.5, 1e-12) && approx(rho[6], 0.5, 1e-12));

  const sv2 = new StateVector(1);
  sv2.prepareQubit0(Math.PI / 3, Math.PI / 5);
  check('engine: fidelity of state with itself = 1', approx(fidelityFromRho(sv2.partialTraceQ0(), Math.PI / 3, Math.PI / 5), 1, 1e-12));
  const bl = blochFromRho(sv2.partialTraceQ0());
  check('engine: Bloch vector length 1 for pure state', approx(Math.hypot(bl.x, bl.y, bl.z), 1, 1e-9));

  // CNOT correctness on 2 qubits
  const sv3 = new StateVector(2);
  sv3.applyGate1(0, GATES.X);
  sv3.applyCNOT(0, 1);
  check('engine: CNOT|10> = |11>', approx(sv3.probOne(0), 1) && approx(sv3.probOne(1), 1));
}

/* ------------------------------------------------------------------ */
/* 2. Registry & codes                                                 */
/* ------------------------------------------------------------------ */
{
  check('registry: exactly 2 codes', SV_CODES.length === 2);
  check('registry: bit-flip code present', !!getSVCode('code-3bitflip'));
  check('registry: phase-flip code present', !!getSVCode('code-3phaseflip'));
  check('registry: bit-flip pythonType=1', CODE_3BITFLIP.pythonType === 1);
  check('registry: phase-flip pythonType=2', CODE_3PHASEFLIP.pythonType === 2);
  check('registry: both [[3,1,3]]', CODE_3BITFLIP.n === 3 && CODE_3BITFLIP.k === 1 && CODE_3BITFLIP.d === 3 && CODE_3PHASEFLIP.n === 3);

  check('noise: exactly 3 models', NOISE_MODELS.length === 3);
  check('noise: ids = bitflip/phaseflip/depolarizing', NOISE_MODELS.map((m) => m.id).join(',') === 'bitflip,phaseflip,depolarizing');
  check('noise: pythonTypes 1/2/3', NOISE_MODELS.map((m) => m.pythonType).join(',') === '1,2,3');

  // correction tables match the Python file's mapping
  const bf = buildCorrectionTable(CODE_3BITFLIP);
  // engine syndrome order = [Z0Z1, Z1Z2]; the Python file prints [q4, q3] = [Z1Z2, Z0Z1]
  // so engine '10' == python display '01' — same physics, different string order.
  check('bit-flip table: engine 10 (py 01) → X(q0)', bf.get('10')?.x[0] === 0 && (bf.get('10')?.z.length ?? 1) === 0);
  check('bit-flip table: engine 11 (py 11) → X(q1)', bf.get('11')?.x[0] === 1);
  check('bit-flip table: engine 01 (py 10) → X(q2)', bf.get('01')?.x[0] === 2);
  check('bit-flip table: Z errors invisible (no Z entries)', ![...bf.values()].some((c) => c.z.length > 0));
  const pf = buildCorrectionTable(CODE_3PHASEFLIP);
  check('phase-flip table: engine 10 (py 01) → Z(q0)', pf.get('10')?.z[0] === 0);
  check('phase-flip table: engine 11 (py 11) → Z(q1)', pf.get('11')?.z[0] === 1);
  check('phase-flip table: engine 01 (py 10) → Z(q2)', pf.get('01')?.z[0] === 2);

  // syndrome of errors
  // engine order [Z0Z1, Z1Z2]: X@q0 trips Z0Z1 only → '10'
  check('syndrome: X@q0 on bit-flip code = engine 10 (py 01)', syndromeOfError(CODE_3BITFLIP, 0, 'X').join('') === '10');
  check('syndrome: X@q1 on bit-flip code = 11', syndromeOfError(CODE_3BITFLIP, 1, 'X').join('') === '11');
  check('syndrome: X@q2 on bit-flip code = engine 01 (py 10)', syndromeOfError(CODE_3BITFLIP, 2, 'X').join('') === '01');
  check('syndrome: Z@q0 on bit-flip code = 00 (invisible)', syndromeOfError(CODE_3BITFLIP, 0, 'Z').join('') === '00');
  check('syndrome: Z@q0 on phase-flip code = engine 10 (py 01)', syndromeOfError(CODE_3PHASEFLIP, 0, 'Z').join('') === '10');
}

/* ------------------------------------------------------------------ */
/* 3. Encoding circuits                                                */
/* ------------------------------------------------------------------ */
{
  // bit-flip encoder: |ψ>|00> → α|000> + β|111>
  const sv = new StateVector(3);
  sv.prepareQubit0(Math.PI / 3, Math.PI / 5);
  for (const op of CODE_3BITFLIP.encoding) sv.applyGateOp(op.gate, op.qubits, op.param);
  // probability of |111> (index 7, little-endian) = |β|² = sin²(θ/2)
  const p111 = sv.data[14] ** 2 + sv.data[15] ** 2;
  check('encode: P(111) = sin²(θ/2)', approx(p111, Math.sin(Math.PI / 6) ** 2, 1e-9));
  check('encode: GHZ structure (q0==q1==q2 always)', (() => {
    // any basis state with nonzero amplitude must have all bits equal
    for (let i = 0; i < 8; i++) {
      const pr = sv.data[2 * i] ** 2 + sv.data[2 * i + 1] ** 2;
      if (pr > 1e-12) {
        const b0 = (i >> 0) & 1, b1 = (i >> 1) & 1, b2 = (i >> 2) & 1;
        if (!(b0 === b1 && b1 === b2)) return false;
      }
    }
    return true;
  })());

  // decode(encode(ψ)) = ψ
  const sv2 = new StateVector(3);
  sv2.prepareQubit0(Math.PI / 3, Math.PI / 5);
  for (const op of CODE_3BITFLIP.encoding) sv2.applyGateOp(op.gate, op.qubits, op.param);
  for (const op of CODE_3BITFLIP.decoding) sv2.applyGateOp(op.gate, op.qubits, op.param);
  check('bit-flip: decode∘encode = identity', approx(fidelityFromRho(sv2.partialTraceQ0(), Math.PI / 3, Math.PI / 5), 1, 1e-9));

  const sv3 = new StateVector(3);
  sv3.prepareQubit0(Math.PI / 3, Math.PI / 5);
  for (const op of CODE_3PHASEFLIP.encoding) sv3.applyGateOp(op.gate, op.qubits, op.param);
  for (const op of CODE_3PHASEFLIP.decoding) sv3.applyGateOp(op.gate, op.qubits, op.param);
  check('phase-flip: decode∘encode = identity', approx(fidelityFromRho(sv3.partialTraceQ0(), Math.PI / 3, Math.PI / 5), 1, 1e-9));

  // phase-flip encoded state: (|+++> + |--->)/√2 in the X basis — equivalently
  // α|+++> + β|---> — check via H-conjugated GHZ: apply H on all qubits of the
  // encoded state and expect the bit-flip GHZ structure back
  const sv4 = new StateVector(3);
  sv4.prepareQubit0(0, 0); // |0>
  for (const op of CODE_3PHASEFLIP.encoding) sv4.applyGateOp(op.gate, op.qubits, op.param);
  sv4.applyGate1(0, GATES.H); sv4.applyGate1(1, GATES.H); sv4.applyGate1(2, GATES.H);
  // now (|000> + |111>)/sqrt(2) — the bit-flip GHZ structure
  const pGHZ0 = sv4.data[0] ** 2 + sv4.data[1] ** 2;
  const pGHZ7 = sv4.data[14] ** 2 + sv4.data[15] ** 2;
  check('phase-flip: H-conjugated encoding gives bit-flip GHZ', approx(pGHZ0, 0.5, 1e-9) && approx(pGHZ7, 0.5, 1e-9));
}

/* ------------------------------------------------------------------ */
/* 4. Single-shot pipeline (matched pairs recover perfectly)           */
/* ------------------------------------------------------------------ */
{
  // bit-flip code + X error on each qubit, |0> input
  for (let q = 0; q < 3; q++) {
    const r = runShot(CODE_3BITFLIP, { theta: 0, phi: 0, noise: 'bitflip', params: { p: 0 }, forcedErrors: [{ qubit: q, x: true }] }, makeRng(1));
    check(`bit-flip: X@q${q} fully corrected (F=1)`, approx(r.fidelity, 1, 1e-9));
    check(`bit-flip: X@q${q} detected`, r.detected);
  }
  // phase-flip code + Z error on each qubit, |0> input
  for (let q = 0; q < 3; q++) {
    const r = runShot(CODE_3PHASEFLIP, { theta: 0, phi: 0, noise: 'phaseflip', params: { p: 0 }, forcedErrors: [{ qubit: q, z: true }] }, makeRng(1));
    check(`phase-flip: Z@q${q} fully corrected (F=1)`, approx(r.fidelity, 1, 1e-9));
  }
  // phase-flip code cannot see X errors: X@q1 acts as a LOGICAL X (invisible, state flips)
  const inv = runShot(CODE_3PHASEFLIP, { theta: 0, phi: 0, noise: 'bitflip', params: { p: 0 }, forcedErrors: [{ qubit: 1, x: true }] }, makeRng(1));
  check('phase-flip: X@q1 on |0> invisible but LOGICAL flip (F≈0)', !inv.detected && inv.fidelity < 0.2);

  // double error on bit-flip code → mis-correction (F = 0 for |0>)
  const dbl = runShot(CODE_3BITFLIP, { theta: 0, phi: 0, noise: 'bitflip', params: { p: 0 }, forcedErrors: [{ qubit: 0, x: true }, { qubit: 2, x: true }] }, makeRng(1));
  check('bit-flip: 2 X errors → logical flip (F≈0)', dbl.fidelity < 0.2);

  // |+> input through phase-flip code with a Z: perfect recovery of superposition
  const sup = runShot(CODE_3PHASEFLIP, { theta: Math.PI / 2, phi: 0, noise: 'phaseflip', params: { p: 0 }, forcedErrors: [{ qubit: 0, z: true }] }, makeRng(1));
  check('phase-flip: Z@q0 on |+> corrected (F=1)', approx(sup.fidelity, 1, 1e-9));

  // depolarizing single X component is corrected on the matched code
  const dep = runShot(CODE_3BITFLIP, { theta: 0, phi: 0, noise: 'depolarizing', params: { p: 0 }, forcedErrors: [{ qubit: 2, x: true }] }, makeRng(1));
  check('bit-flip: X@q2 under depolarizing flagged & fixed', approx(dep.fidelity, 1, 1e-9));
}

/* ------------------------------------------------------------------ */
/* 5. Monte Carlo vs analytic theory                                   */
/* ------------------------------------------------------------------ */
{
  // bit-flip code under X noise, |0> input:
  // F = P(0 errors) + P(1 error) = (1-p)^3 + 3p(1-p)^2
  const theoryF = (p) => (1 - p) ** 3 + 3 * p * (1 - p) ** 2;
  for (const p of [0.05, 0.1, 0.2]) {
    const r = mcRun(CODE_3BITFLIP, 'bitflip', { p }, 0, 0, 6000, 77 + Math.floor(p * 1000));
    check(`MC: bit-flip code F matches theory at p=${p}`, approx(r.fidelityQEC, theoryF(p), 0.02));
    // bare qubit under X noise on |0>: F = 1-p
    check(`MC: bare F = 1-p at p=${p}`, approx(r.fidelityBefore, 1 - p, 0.02));
    check(`MC: QEC beats bare at p=${p}`, r.fidelityQEC > r.fidelityBefore);
  }

  // phase-flip code under Z noise on |+>: F = (1-p)^3 + 3p(1-p)^2 as well
  for (const p of [0.05, 0.1]) {
    const r = mcRun(CODE_3PHASEFLIP, 'phaseflip', { p }, Math.PI / 2, 0, 6000, 55);
    check(`MC: phase-flip code on |+> matches theory at p=${p}`, approx(r.fidelityQEC, theoryF(p), 0.02));
  }

  // NOT MATCHED: bit-flip code under Z noise — Z is invisible; bare F = (1-p) + p<Z>²,
  // code F identical (Z passes through) → improvement ≈ 1 (no harm, no help)
  {
    const r = mcRun(CODE_3BITFLIP, 'phaseflip', { p: 0.1 }, 0, 0, 4000, 21);
    check('MC: NOT MATCHED (Z noise, bit-flip code) ≈ bare', approx(r.fidelityQEC, r.fidelityBefore, 0.01));
  }

  // depolarizing on bit-flip code, |0>: theory for the repetition code
  // F = sum over error patterns the code can fix: 0 errors + exactly one X
  //   (1-p)^3 + 3 · (p/3) · (1-p)^2  + patterns with one Y (acts as Z, invisible, F=1 for |0>)
  // full analysis: P(correct) = (1-p)^3 + p(1-p)^2 (single X) + p(1-p)^2 (single Z invisible) + p(1-p)^2 (single Y: Z invisible, X fixed...) — complex; just check QEC > bare and F > 0.9 at p=0.05
  {
    const r = mcRun(CODE_3BITFLIP, 'depolarizing', { p: 0.05 }, 0, 0, 6000, 31);
    check('MC: depolarizing p=0.05 → QEC F > 0.9', r.fidelityQEC > 0.9);
    check('MC: depolarizing p=0.05 → QEC beats bare', r.fidelityQEC > r.fidelityBefore);
  }

  // Python-file headline: MATCHED pairing at the error-qubit level never fails
  // (single error on the chosen qubit is always corrected) — verify via MC with
  // forced single-qubit noise like the Python id-gate placement
  {
    let success = 0;
    const n = 3000;
    const rng = makeRng(99);
    for (let i = 0; i < n; i++) {
      const r = runShot(CODE_3BITFLIP, { theta: 0, phi: 0, noise: 'bitflip', params: { p: 0 }, forcedErrors: [{ qubit: 1, x: rng() < 0.3 }] }, rng);
      if (r.fidelity > 0.999) success++;
    }
    check('Python semantics: id-gate X on q1 always corrected → 100% success', success === n);
  }

  // sweep machinery
  const pts = sweepSV(CODE_3BITFLIP, 'bitflip', { p: 0.1 }, 0, 0, 1500, 5, [0.05, 0.1, 0.15]);
  check('sweep: 3 points returned', pts.length === 3);
  check('sweep: monotonic-ish F decrease', pts[0].fidelityQEC > pts[2].fidelityQEC);
  check('sweep: improvement > 1 at low p', pts[0].improvement > 1.5);

  // bare-qubit analytics
  check('bare: X noise on |0> → 1-p', approx(bareQubitFidelity('bitflip', { p: 0.2 }, 0, 0), 0.8, 1e-9));
  check('bare: depolarizing → 1-2p/3', approx(bareQubitFidelity('depolarizing', { p: 0.3 }, 0, 0), 0.8, 1e-9));
  check('bare: Z noise on |+> → 1-p', approx(bareQubitFidelity('phaseflip', { p: 0.25 }, Math.PI / 2, 0), 0.75, 1e-9));
}

/* ------------------------------------------------------------------ */
/* 6. Live multi-round pipeline (3D labs)                              */
/* ------------------------------------------------------------------ */
{
  const sv = prepareEncodedState(CODE_3BITFLIP, 0, 0);
  const rng = makeRng(7);
  let fSum = 0;
  let sawCorrection = false;
  const rounds = 200;
  for (let i = 0; i < rounds; i++) {
    const r = runLiveRound(CODE_3BITFLIP, sv, 'bitflip', { p: 0.15 }, rng, 0, 0, true);
    fSum += r.fidelity;
    if (r.correction.x.length > 0) sawCorrection = true;
  }
  // The persistent trajectory is a telegraph process: double errors flip |0_L> ↔ |1_L>
  // (rate P(≥2 errors) ≈ 0.0608/round) and later double errors flip it back.
  let sawFail = false, sawRecover = false;
  let prevFail = false;
  for (let i = 0; i < rounds; i++) {
    const r = runLiveRound(CODE_3BITFLIP, sv, 'bitflip', { p: 0.15 }, rng, 0, 0, true);
    fSum += r.fidelity;
    if (r.correction.x.length > 0) sawCorrection = true;
    if (r.fidelity < 0.5) { sawFail = true; prevFail = true; }
    else if (prevFail && r.fidelity > 0.99) sawRecover = true;
  }
  check('live: failures occur (double-error rounds)', sawFail);
  check('live: trajectory recovers to the right logical state afterwards', sawRecover);
  check('live: corrections actually happened', sawCorrection);

  // QEC off → state degrades
  const sv2 = prepareEncodedState(CODE_3BITFLIP, 0, 0);
  const rng2 = makeRng(7);
  let degraded = false;
  for (let i = 0; i < 40; i++) {
    const r = runLiveRound(CODE_3BITFLIP, sv2, 'bitflip', { p: 0.2 }, rng2, 0, 0, false);
    if (r.fidelity < 0.9) degraded = true;
  }
  check('live: QEC OFF degrades the state', degraded);

  // readLogicalBloch: non-destructive readout returns |0> for encoded |0>
  const sv3 = prepareEncodedState(CODE_3BITFLIP, 0, 0);
  const ro1 = readLogicalBloch(CODE_3BITFLIP, sv3, 0, 0);
  check('readLogicalBloch: encoded |0> reads z≈+1', ro1.bloch.z > 0.999);
  // state still intact for engine use (non-destructive)
  const r4 = runLiveRound(CODE_3BITFLIP, sv3, 'bitflip', { p: 0 }, rng, 0, 0, true);
  check('readLogicalBloch: non-destructive (round after read still F=1)', approx(r4.fidelity, 1, 1e-9));

  // bare round
  const bare = new StateVector(1);
  bare.prepareQubit0(0, 0);
  const br = runBareRound(bare, 'bitflip', { p: 0.5 }, makeRng(3), 0, 0);
  check('bareRound: returns valid bloch', Math.hypot(br.bloch.x, br.bloch.y, br.bloch.z) <= 1.0001);
}

/* ------------------------------------------------------------------ */
/* 7. Noise channel sampling sanity                                    */
/* ------------------------------------------------------------------ */
{
  // bit-flip channel: exactly p fraction of qubits flip on average
  const sv = new StateVector(9);
  const rng = makeRng(1234);
  let flips = 0;
  const trials = 3000;
  for (let i = 0; i < trials; i++) {
    const ev = applyNoiseLayer(sv, 'bitflip', { p: 0.3 }, rng);
    for (const e of ev) {
      if (e.kind === 'X') flips++;
      // undo for the next trial
      sv.applyGate1(e.qubit, GATES.X);
    }
  }
  check('noise: bitflip event rate ≈ p', approx(flips / (trials * 9), 0.3, 0.02));

  // depolarizing: X/Y/Z equally likely
  const counts = { X: 0, Y: 0, Z: 0 };
  const sv2 = new StateVector(9);
  const rng2 = makeRng(5678);
  for (let i = 0; i < 12000; i++) {
    const ev = applyNoiseLayer(sv2, 'depolarizing', { p: 1 }, rng2);
    for (const e of ev) {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      sv2.applyGate1(e.qubit, e.kind === 'X' ? GATES.X : e.kind === 'Y' ? GATES.Y : GATES.Z);
    }
  }
  const total = counts.X + counts.Y + counts.Z;
  check('noise: depolarizing uniform thirds (X)', approx(counts.X / total, 1 / 3, 0.03));
  check('noise: depolarizing uniform thirds (Y)', approx(counts.Y / total, 1 / 3, 0.03));
  check('noise: depolarizing uniform thirds (Z)', approx(counts.Z / total, 1 / 3, 0.03));

  // phase-flip event rate
  const sv3 = new StateVector(9);
  const rng3 = makeRng(4321);
  let zFlips = 0;
  for (let i = 0; i < 2000; i++) {
    const ev = applyNoiseLayer(sv3, 'phaseflip', { p: 0.25 }, rng3);
    zFlips += ev.length;
    for (const e of ev) sv3.applyGate1(e.qubit, GATES.Z);
  }
  check('noise: phaseflip event rate ≈ p', approx(zFlips / 18000, 0.25, 0.02));
}

/* ------------------------------------------------------------------ */
/* 8. Trace (Simulator Lab UI payload)                                 */
/* ------------------------------------------------------------------ */
{
  const tr = runTrace(CODE_3BITFLIP, 'bitflip', { p: 0.1 }, 0, 0, 42, [{ qubit: 1, x: true, z: false }]);
  check('trace: code name carried', tr.codeName === '3-Qubit Bit-Flip Code');
  check('trace: noise name carried', tr.noiseName === 'Bit-Flip Noise (X)');
  check('trace: X@q1 → syndrome 11 → correction q1', tr.syndrome.every((s) => (s.label === 'Z0 Z1' ? s.bit === 1 : s.label === 'Z1 Z2' ? s.bit === 1 : true)) && tr.correction.x[0] === 1);
  check('trace: recovered', tr.recovered && approx(tr.fidelity, 1, 1e-9));
  check('trace: measured outcome = 0', tr.measuredOutcome === 0);
  check('trace: detection note mentions correction', tr.detectionNote.includes('flags'));
  check('trace: no projection encoding flag', tr.projectionEncoding === undefined);

  // clean shot
  const tr2 = runTrace(CODE_3PHASEFLIP, 'phaseflip', { p: 0.0 }, 0, 0, 5, null);
  check('trace: clean shot has trivial syndrome', tr2.syndrome.every((s) => s.bit === 0));
  check('trace: clean shot F=1', approx(tr2.fidelity, 1, 1e-9));
}

/* ------------------------------------------------------------------ */
/* 9. Python circuit definitions (exact file match)                    */
/* ------------------------------------------------------------------ */
{
  const c1 = buildPythonCircuit(1, 1, 1);
  check('py circuit: title = bit_flip_qec', c1.title === 'bit_flip_qec(input_bit, error_qubit)');
  check('py circuit: 5 qubits + 3 classical bits', c1.nQ === 5 && c1.nC === 3);
  const gates1 = c1.ops.filter((o) => o.kind === 'cnot').length;
  check('py circuit: bit-flip has 8 CNOTs (2 encode + 4 syndrome + 2 decode)', gates1 === 8);
  check('py circuit: 1 id gate on error qubit', c1.ops.filter((o) => o.kind === 'gate' && o.gate === 'ID').length === 1 && c1.ops.find((o) => o.kind === 'gate' && o.gate === 'ID')?.qubit === 1);
  check('py circuit: input X present for input_bit=1', c1.ops.some((o) => o.kind === 'gate' && o.gate === 'X' && o.qubit === 0));
  check('py circuit: 3 measurements', c1.ops.filter((o) => o.kind === 'measure').length === 3);
  check('py circuit: 3 conditional corrections', c1.ops.filter((o) => o.kind === 'ifx').length === 3);
  const ifx = c1.ops.filter((o) => o.kind === 'ifx');
  check('py circuit: if_test mapping 01→q0, 11→q1, 10→q2', ifx[0].regValue === 1 && ifx[0].target === 0 && ifx[1].regValue === 3 && ifx[1].target === 1 && ifx[2].regValue === 2 && ifx[2].target === 2);

  const c2 = buildPythonCircuit(2, 0, 2);
  const hCount = c2.ops.filter((o) => o.kind === 'gate' && o.gate === 'H').length;
  check('py circuit: phase-flip has 8 H gates (1+3+3+1)', hCount === 8);
  check('py circuit: no input X for input_bit=0', !c2.ops.some((o) => o.kind === 'gate' && o.gate === 'X'));
  check('py circuit: id gate on q2', c2.ops.find((o) => o.kind === 'gate' && o.gate === 'ID')?.qubit === 2);
  // decode order (file): cx(0,2) then cx(0,1)
  const decodes = c2.ops.filter((o) => o.kind === 'cnot').slice(-2);
  check('py circuit: phase-flip decode order cx(0,2)→cx(0,1)', decodes[0].control === 0 && decodes[0].target === 2 && decodes[1].target === 1);
}

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('FAILURES:');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('ALL GREEN');
