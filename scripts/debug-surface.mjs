import { getSurfaceLayout, buildMatchingGraph, matchDefects } from '../src/lib/qec/surface.ts';

const d = 3;
const layout = getSurfaceLayout(d);
console.log('Z-stabs:', layout.stabsZ.map((s) => `${s.label}: ${JSON.stringify(s.qubits)}`));
const g = buildMatchingGraph(layout, 'Z');
console.log('\nboundaryAdj indices:', g.distBoundary.map((v, i) => `${i}:${v}`).join(' '));
console.log('\npathB:', g.pathB.map((p, i) => `${i}: [${p.join(',')}]`).join('  '));

// single defect at each Z-stab
for (let i = 0; i < layout.stabsZ.length; i++) {
  const { pairs, toBoundary } = matchDefects(g, [i]);
  const corrected = new Array(d * d).fill(false);
  for (const [a, b] of pairs) for (const q of g.path[a][b]) corrected[q] = !corrected[q];
  for (const t of toBoundary) for (const q of g.pathB[t]) corrected[q] = !corrected[q];
  console.log(`defect at ${layout.stabsZ[i].label}: pairs=${JSON.stringify(pairs)} toB=${JSON.stringify(toBoundary)} correction qubits=[${corrected.map((c, q) => c ? `${Math.floor(q / d)},${q % d}` : null).filter(Boolean).join('; ')}]`);
}
