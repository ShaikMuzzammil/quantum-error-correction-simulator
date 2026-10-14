/**
 * Engine verification suite — QEC Simulator (focused edition).
 * Scope: exactly the two codes × three channels of all_with_noise_prob.py.
 * Run: bun scripts/test-qec.mjs
 */
import { makeRng, StateVector, GATES } from '../src/lib/qec/engine.ts';
import { SV_CODES, getSVCode, buildCorrectionTable, runShot, lookupCorrection } from '../src/lib/qec/codes.ts';
import { NOISE_MODELS, applyNoiseLayer, noiseParams, bareQubitFidelity } from '../src/lib/qec/noise.ts';
import { runTrace, mcRun, sweepSV, prepareEncodedState, runLiveRound, runBareRound } from '../src/lib/qec/pipeline.ts';
import { CODE_REGISTRY } from '../src/lib/qec/registry.ts';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
}
function close(a, b, tol, name) {
  ok(Math.abs(a - b) <= tol, `${name} (${a.toFixed(4)} ≈ ${b.toFixed(4)} ±${tol})`);
}

console.log('\n--- Scope: registry matches all_with_noise_prob.py ---');
ok(SV_CODES.length === 2, 'exactly 2 QEC codes');
ok(SV_CODES.some((c) => c.id === 'code-3bitflip'), 'code-3bitflip present (bit_flip_qec)');
ok(SV_CODES.some((c) => c.id === 'code-3phaseflip'), 'code-3phaseflip present (phase_flip_qec)');
ok(NOISE_MODELS.length === 3, 'exactly 3 noise models');
ok(NOISE_MODELS.map((m) => m.id).join(',') === 'bitflip,phaseflip,depolarizing', 'noise ids = bitflip/phaseflip/depolarizing');
ok(CODE_REGISTRY.length === 2 && CODE_REGISTRY.every((c) => c.compat.length === 3), 'every code compatible with all 3 channels');
for (const c of SV_CODES) {
  ok(c.n === 3 && c.k === 1 && c.d === 3, `${c.id}: [[3,1,3]]`);
  ok(c.stabilizers.length === 2, `${c.id}: 2 stabilizer generators`);
}
{
  const bf = getSVCode('code-3bitflip');
  ok(bf.encoding.length === 2 && bf.encoding.every((o) => o.gate === 'CNOT'), 'bit-flip encoding = 2 CNOTs (matches bit_flip_qec)');
  const pf = getSVCode('code-3phaseflip');
  const ops = pf.encoding.map((o) => o.gate).join(',');
  ok(ops === 'H,CNOT,CNOT,H,H,H', `phase-flip encoding = H,CNOT,CNOT,H,H,H (matches phase_flip_qec): ${ops}`);
}

console.log('\n--- Engine sanity ---');
{
  const sv = new StateVector(1);
  sv.applyGate1(0, GATES.H);
  close(sv.probOne(0), 0.5, 1e-12, 'H|0> = 50/50');
  sv.applyGate1(0, GATES.X);
  close(sv.probOne(0), 0.5, 1e-12, 'X after H still 50/50');
  sv.applyGate1(0, GATES.Z);
  close(sv.probOne(0), 0.5, 1e-12, 'Z keeps populations');
}
{
  // Bell: H on q0, CNOT 0->1
  const sv = new StateVector(2);
  sv.applyGate1(0, GATES.H);
  sv.applyCNOT(0, 1);
  const amps = sv.topAmplitudes(0.01, 8);
  ok(amps.length === 2 && Math.abs(amps[0].prob - 0.5) < 1e-12 && Math.abs(amps[1].prob - 0.5) < 1e-12, 'CNOT entangles into Bell pair (|00>,|11>)');
}

console.log('\n--- Bit-flip code: single-X correction (the Python worked example) ---');
{
  const code = getSVCode('code-3bitflip');
  const expectedSyndrome = { 0: '10', 1: '11', 2: '01' }; // engine bit order: [Z0Z1, Z1Z2]
  for (let q = 0; q < 3; q++) {
    const t = runTrace(code, 'bitflip', { p: 0 }, 0, 0, 42, [{ qubit: q, x: true, z: false }]);
    ok(t.syndrome.map((s) => s.bit).join('') === expectedSyndrome[q], `X on q${q} → syndrome ${expectedSyndrome[q]}`);
    ok(t.fidelity > 0.999999, `X on q${q} fully corrected (F=100%)`);
    ok(t.correction.x.length === 1 && t.correction.x[0] === q, `correction applied on q${q}`);
    ok(t.recovered, `recovered flag true for q${q}`);
  }
  // Z error is invisible to the bit-flip code (trivial syndrome, no correction)
  const tz = runTrace(code, 'bitflip', { p: 0 }, 0, 0, 42, [{ qubit: 1, x: false, z: true }]);
  ok(tz.syndrome.every((s) => s.bit === 0), 'Z on bit-flip code → trivial syndrome (invisible)');
  ok(tz.fidelity > 0.999999, 'Z error on |0> leaves the state intact');
  // superposition input: Z is NOT invisible logically for |+>... it is: bit-flip code cannot correct Z, state |+> -> |->, F=0
  const tpx = runTrace(code, 'bitflip', { p: 0 }, Math.PI / 2, 0, 42, [{ qubit: 1, x: false, z: true }]);
  close(tpx.fidelity, 0, 1e-9, 'Z on |+> → |-> (F=0, undetectable by this code)');
}

console.log('\n--- Phase-flip code: single-Z correction ---');
{
  const code = getSVCode('code-3phaseflip');
  for (let q = 0; q < 3; q++) {
    const t = runTrace(code, 'phaseflip', { p: 0 }, Math.PI / 2, 0, 42, [{ qubit: q, x: false, z: true }]);
    ok(t.fidelity > 0.999999, `Z on q${q} fully corrected (F=100%, |+> input)`);
  }
  // X error on |0> input for phase-flip code: X commutes with the X-stabilizers → trivial syndrome → uncorrectable (correct physics)
  const t = runTrace(code, 'phaseflip', { p: 0 }, 0, 0, 42, [{ qubit: 1, x: true, z: false }]);
  ok(t.syndrome.every((s) => s.bit === 0), 'X on phase-flip code → trivial syndrome (this code targets Z errors, like the Python pairing)');
}

console.log('\n--- Syndrome→correction table integrity ---');
{
  for (const code of SV_CODES) {
    // every single-qubit detectable error has a correction entry
    const t01 = lookupCorrection(code, [1, 0]);
    const t11 = lookupCorrection(code, [1, 1]);
    const t10 = lookupCorrection(code, [0, 1]);
    ok(t01.x.length + t01.z.length + t11.x.length + t11.z.length + t10.x.length + t10.z.length > 0, `${code.id}: non-trivial syndromes map to corrections`);
    ok(lookupCorrection(code, [0, 0]).x.length === 0 && lookupCorrection(code, [0, 0]).z.length === 0, `${code.id}: trivial syndrome → no correction`);
  }
  const bf = getSVCode('code-3bitflip');
  const tbl = [...bf.correctionTable.entries()].sort();
  ok(tbl.length === 3, 'bit-flip table has exactly 3 syndromes (01→,11→,10→ in engine order 10,11,01)');
}

console.log('\n--- Noise sampling rates (quantum trajectories) ---');
{
  const N = 40000;
  const sv = new StateVector(1);
  let hits = 0;
  const rng = makeRng(7);
  for (let i = 0; i < N; i++) {
    const s = new StateVector(1);
    const ev = applyNoiseLayer(s, 'bitflip', { p: 0.3 }, rng);
    if (ev.length) hits++;
  }
  close(hits / N, 0.3, 0.01, 'bitflip p=0.3 → ~30% X hits');

  let xh = 0, yh = 0, zh = 0;
  const rng2 = makeRng(11);
  for (let i = 0; i < N; i++) {
    const s = new StateVector(1);
    const ev = applyNoiseLayer(s, 'depolarizing', { p: 0.3 }, rng2);
    if (ev.length) {
      if (ev[0].kind === 'X') xh++; else if (ev[0].kind === 'Y') yh++; else zh++;
    }
  }
  close((xh + yh + zh) / N, 0.3, 0.01, 'depolarizing p=0.3 → ~30% total hits');
  ok(Math.abs(xh / N - 0.1) < 0.01 && Math.abs(yh / N - 0.1) < 0.01 && Math.abs(zh / N - 0.1) < 0.01, 'depolarizing splits X/Y/Z ≈ p/3 each');
}

console.log('\n--- Bare-qubit analytic fidelity ---');
{
  close(bareQubitFidelity('bitflip', { p: 0.2 }, 0, 0), (1 - 0.2) + 0.2 * 0, 1e-12, 'bitflip |0> F = 1-p');
  close(bareQubitFidelity('phaseflip', { p: 0.2 }, 0, 0), 1, 1e-12, 'phaseflip |0> F = 1 (Z leaves populations)');
  close(bareQubitFidelity('depolarizing', { p: 0.3 }, Math.PI / 3, 0.5), 1 - (2 / 3) * 0.3, 1e-12, 'depolarizing F = 1 - 2p/3');
}

console.log('\n--- Monte Carlo vs theory (the Python success metric) ---');
{
  // bit-flip code + bitflip noise + |0>: success = P(0 or 1 errors) = (1-p)^3 + 3p(1-p)^2
  const code = getSVCode('code-3bitflip');
  const p = 0.1;
  const theory = (1 - p) ** 3 + 3 * p * (1 - p) ** 2; // 0.972
  const r = mcRun(code, 'bitflip', { p }, 0, 0, 20000, 123, 0);
  close(r.fidelityQEC, theory, 0.01, `bit-flip code MC success ≈ (1-p)^3+3p(1-p)^2 = ${theory.toFixed(4)}`);
  close(r.fidelityBefore, 1 - p, 0.01, 'bare qubit success = 1-p');
  ok(r.improvement > 1, 'QEC beats bare at p=0.1');
}
{
  // phase-flip code + phaseflip noise + |+>: same math by symmetry
  const code = getSVCode('code-3phaseflip');
  const p = 0.1;
  const theory = (1 - p) ** 3 + 3 * p * (1 - p) ** 2;
  const r = mcRun(code, 'phaseflip', { p }, Math.PI / 2, 0, 20000, 321, 0);
  close(r.fidelityQEC, theory, 0.01, `phase-flip code MC success ≈ ${theory.toFixed(4)}`);
}
{
  // depolarizing: QEC should still help at small p
  const code = getSVCode('code-3bitflip');
  const r = mcRun(code, 'depolarizing', { p: 0.05 }, 0, 0, 12000, 55, 0);
  ok(r.fidelityQEC > r.fidelityBefore, 'depolarizing p=0.05: QEC helps');
  ok(r.fidelityQEC > 0.97, 'depolarizing p=0.05: near-perfect recovery');
}

console.log('\n--- Sweep + live rounds (labs) ---');
{
  const code = getSVCode('code-3bitflip');
  const pts = sweepSV(code, 'bitflip', { p: 0.1 }, 0, 0, 400, 300, [0.05, 0.1, 0.2]);
  ok(pts.length === 3 && pts.every((pt) => pt.fidelityQEC >= pt.fidelityBefore - 0.02), 'sweep: QEC curve above bare at low p');
  const sv = prepareEncodedState(code, Math.PI / 3, Math.PI / 5);
  const r1 = runLiveRound(code, sv, 'bitflip', { p: 0.1 }, makeRng(9), Math.PI / 3, Math.PI / 5, true);
  ok(r1.fidelity > 0.5 && Math.abs(r1.bloch.x) <= 1.001 && Math.abs(r1.bloch.y) <= 1.001 && Math.abs(r1.bloch.z) <= 1.001, 'runLiveRound returns sane bloch + fidelity');
  const bare = new StateVector(1);
  bare.prepareQubit0(Math.PI / 3, Math.PI / 5);
  const rb = runBareRound(bare, 'bitflip', { p: 0.1 }, makeRng(9), Math.PI / 3, Math.PI / 5);
  ok(rb.fidelity >= -1e-9 && rb.fidelity <= 1 + 1e-9, 'runBareRound sane');
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
