/**
 * Verification tests for pyqec.ts — the exact port of all_with_noise_prob.py.
 * Run: bun run scripts/test-pyqec.mjs
 */
import {
  runShotExact, runBatch, runStagedShot, buildCircuit,
  analyticSuccessRate, bareSuccessRate, sweepSuccessRate,
} from '../src/lib/qec/pyqec.ts';
import { makeRng } from '../src/lib/qec/engine.ts';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name} ${extra}`); }
}

console.log('\n=== 1. Circuit structure matches the Python file ===');
{
  const bf = buildCircuit(1, 1, 1);
  check('bit-flip: 8 stages', bf.stages.length === 8);
  check('bit-flip: input X present', bf.gates.some(g => g.kind === 'X' && g.stage === 1));
  check('bit-flip: encode CX(0,1),CX(0,2)', bf.gates.filter(g => g.stage === 2 && g.kind === 'CX').length === 2);
  check('bit-flip: ID on error qubit', bf.gates.some(g => g.kind === 'ID' && g.qubits[0] === 1 && g.stage === 3));
  const pf = buildCircuit(2, 0, 2);
  check('phase-flip: 12 stages', pf.stages.length === 12);
  check('phase-flip: 3 H stage4 + 3 H stage6', pf.gates.filter(g => g.kind === 'H' && g.stage === 4).length === 3 && pf.gates.filter(g => g.kind === 'H' && g.stage === 6).length === 3);
  check('phase-flip: decode order CX(0,2) then CX(0,1)', (() => {
    const dec = pf.gates.filter(g => g.stage === 10);
    return dec.length === 2 && dec[0].qubits[1] === 2 && dec[1].qubits[1] === 1;
  })());
  check('bit-flip: decode order CX(0,1) then CX(0,2)', (() => {
    const dec = buildCircuit(1, 0, 0).gates.filter(g => g.stage === 7);
    return dec.length === 2 && dec[0].qubits[1] === 1 && dec[1].qubits[1] === 2;
  })());
}

console.log('\n=== 2. Noise-free circuit always returns the input bit ===');
{
  let allOk = true;
  for (const qec of [1, 2]) for (const bit of [0, 1]) for (const eq of [0, 1, 2]) {
    const rng = makeRng(1000 + qec * 10 + bit * 3 + eq);
    let ok = 0;
    for (let i = 0; i < 500; i++) ok += runShotExact(qec, bit, eq, 1, 0, rng).success ? 1 : 0;
    if (ok !== 500) { allOk = false; check(`noiseless qec=${qec} bit=${bit} eq=${eq}`, false, `${ok}/500`); }
  }
  check('noiseless: all 12 configs return input 500/500', allOk);
}

console.log('\n=== 3. Monte-Carlo rates match hand-derived analytics (classical input) ===');
{
  // bit-flip QEC protects a classical bit perfectly against all three noises;
  // phase-flip QEC: Z matched 100% · X logical flip 1−p · depol 1−2p/3
  const cases = [
    { qec: 1, noise: 1, expected: 1.0 },
    { qec: 1, noise: 2, expected: 1.0 },
    { qec: 1, noise: 3, expected: 1.0 },
    { qec: 2, noise: 1, expected: 1 - 0.4 },
    { qec: 2, noise: 2, expected: 1.0 },
    { qec: 2, noise: 3, expected: 1 - (2 * 0.4) / 3 },
  ];
  for (const c of cases) {
    const rng = makeRng(77 + c.qec * 3 + c.noise);
    let ok = 0;
    const N = 30000;
    for (let i = 0; i < N; i++) ok += runShotExact(c.qec, 0, 1, c.noise, 0.4, rng).success ? 1 : 0;
    const mc = ok / N;
    const an = analyticSuccessRate(c.noise, c.qec, 0.4);
    check(`qec=${c.qec} noise=${c.noise}: MC ${(mc * 100).toFixed(2)}% ≈ analytic ${(an * 100).toFixed(2)}%`,
      Math.abs(mc - an) < 0.01, `diff=${(mc - an).toFixed(4)}`);
  }
  // input bit 1 must behave identically
  const rng = makeRng(555);
  let ok1 = 0;
  for (let i = 0; i < 30000; i++) ok1 += runShotExact(2, 1, 2, 1, 0.4, rng).success ? 1 : 0;
  check('phaseflip X noise input=1: 60% (same as input=0)', Math.abs(ok1 / 30000 - 0.6) < 0.01, `${(ok1/30000*100).toFixed(2)}%`);
}

console.log('\n=== 4. Counts + interpretation + performance (the Python output block) ===');
{
  const r = runBatch({ qecType: 1, inputBit: 1, errorQubit: 0, noiseType: 1, p: 0.25, shots: 1000, seed: 7 });
  check('total shots 1000', r.totalShots === 1000);
  check('success 100% (matched)', r.successRate === 100, `${r.successRate}`);
  check('counts sum to 1000', Object.values(r.counts).reduce((a, b) => a + b, 0) === 1000);
  check('all keys are 3-bit strings', Object.keys(r.counts).every(k => k.length === 3 && /^[01]{3}$/.test(k)));
  check('final bit always 1', Object.keys(r.counts).every(k => k[0] === '1'));
  check('syndromes only 00/01 (error on q0)', Object.keys(r.counts).every(k => k.slice(1) === '00' || k.slice(1) === '01'));
  check('interpretation rows = count keys', r.interpretation.length === Object.keys(r.counts).length);
  check('noiseFired ≈ 250', Math.abs(r.noiseFired - 250) < 40, `${r.noiseFired}`);
  check('corrections = fired', r.corrections === r.noiseFired, `${r.corrections} vs ${r.noiseFired}`);
  check('qec status MATCHED', r.qecStatus.status === 'MATCHED');

  const r2 = runBatch({ qecType: 2, inputBit: 0, errorQubit: 2, noiseType: 3, p: 0.6, shots: 5000, seed: 99 });
  const an = analyticSuccessRate(3, 2, 0.6) * 100;
  check('depol phaseflip: MC within 2% of analytic', Math.abs(r2.successRate - an) < 2, `mc=${r2.successRate.toFixed(2)} an=${an.toFixed(2)}`);
  check('depol phaseflip status DEPOLARIZING', r2.qecStatus.status === 'DEPOLARIZING');

  const r3 = runBatch({ qecType: 2, inputBit: 1, errorQubit: 1, noiseType: 1, p: 0.5, shots: 4000, seed: 123 });
  check('phaseflip + X noise: ~50% success', Math.abs(r3.successRate - 50) < 2, `${r3.successRate.toFixed(2)}`);
  check('phaseflip + X noise status NOT MATCHED', r3.qecStatus.status === 'NOT MATCHED');
}

console.log('\n=== 5. Staged shot snapshots ===');
{
  const { snapshots: sBF } = runStagedShot(1, 1, 0, 1, 0.5, makeRng(5));
  check('bit-flip: exactly 8 stage snapshots', sBF.length === 8, `${sBF.length}`);
  const { shot, snapshots } = runStagedShot(2, 0, 1, 2, 0.5, makeRng(5));
  check('phase-flip: exactly 12 stage snapshots', snapshots.length === 12, `${snapshots.length}`);
  check('last snapshot reports success/fail', snapshots[snapshots.length - 1].note.includes('SUCCESS') || snapshots[snapshots.length - 1].note.includes('FAILED'));
  check('syndrome snapshot exists at stage 8', snapshots.some(s => s.stage === 8 && s.syndrome !== undefined));
  const bf = runStagedShot(1, 1, 0, 1, 1.0, makeRng(6)); // p=1 always fires
  check('p=1 bitflip: error always corrected on q0', bf.shot.success === true && bf.shot.correctedQubit === 0);
  check('noise snapshot recorded', bf.snapshots.some(s => s.stage === 3 && s.noiseKind === 'X'));
}

console.log('\n=== 6. Bare qubit baseline ===');
{
  check('bare + X noise: 1-p', Math.abs(bareSuccessRate(1, 0.3) - 0.7) < 1e-9);
  check('bare + Z noise: 1.0 (basis state)', bareSuccessRate(2, 0.3) === 1);
  check('bare + depol: 1-2p/3', Math.abs(bareSuccessRate(3, 0.3) - (1 - 0.2)) < 1e-9);
}

console.log('\n=== 7. Sweep produces sane curves ===');
{
  const pts = sweepSuccessRate(2, 3, 3000, 11, [0, 0.15, 0.3, 0.6]);
  check('sweep: p=0 → 100%', pts[0].successQEC === 100);
  check('sweep: decreasing', pts[3].successQEC < pts[1].successQEC, `${pts[3].successQEC} vs ${pts[1].successQEC}`);
  const an = analyticSuccessRate(3, 2, 0.6) * 100;
  check('sweep: p=0.6 near analytic', Math.abs(pts[3].successQEC - an) < 3, `mc=${pts[3].successQEC.toFixed(1)} an=${an.toFixed(1)}`);
  check('sweep bare ≈ QEC for phaseflip+depol (analytically equal)', Math.abs(pts[3].successBare - pts[3].successQEC) < 3, `bare=${pts[3].successBare.toFixed(1)} qec=${pts[3].successQEC.toFixed(1)}`);
  const ptsBF = sweepSuccessRate(1, 3, 3000, 21, [0, 0.3, 0.6]);
  check('sweep: bitflip QEC strictly beats bare under depol', ptsBF[2].successQEC > ptsBF[2].successBare + 5, `qec=${ptsBF[2].successQEC.toFixed(1)} bare=${ptsBF[2].successBare.toFixed(1)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
