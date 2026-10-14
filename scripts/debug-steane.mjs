import { StateVector, makeRng } from '../src/lib/qec/engine.ts';
import { CODE_STEANE7, projectionEncode } from '../src/lib/qec/codes.ts';

// Encode |0> via the circuit
const sv = new StateVector(7);
sv.prepareQubit0(0, 0);
for (const op of CODE_STEANE7.encoding) sv.applyGateOp(op.gate, op.qubits, op.param);

console.log('Amplitudes after encoding |0>:');
for (const a of sv.topAmplitudes(0.01, 16)) {
  console.log(`  ${a.label}  amp=${a.re.toFixed(4)} ${a.im >= 0 ? '+' : ''}${a.im.toFixed(4)}i  p=${a.prob.toFixed(4)}`);
}

console.log('\nStabilizer expectations:');
for (const st of CODE_STEANE7.stabilizers) {
  console.log(`  ${st.label.padEnd(12)} <S> = ${sv.expectPauli(st.paulis).toFixed(6)}`);
}

// Compare with projection encoding reference
const ref = new StateVector(7);
projectionEncode(CODE_STEANE7, ref);
console.log('\nProjection-encoded |0_L> amplitudes:');
for (const a of ref.topAmplitudes(0.01, 16)) {
  console.log(`  ${a.label}  amp=${a.re.toFixed(4)} ${a.im >= 0 ? '+' : ''}${a.im.toFixed(4)}i  p=${a.prob.toFixed(4)}`);
}
console.log('\nRef stabilizer expectations:');
for (const st of CODE_STEANE7.stabilizers) {
  console.log(`  ${st.label.padEnd(12)} <S> = ${ref.expectPauli(st.paulis).toFixed(6)}`);
}
