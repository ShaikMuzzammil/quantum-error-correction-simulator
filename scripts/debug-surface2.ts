import { getSurfaceLayout, buildMatchingGraph, matchDefects } from '../src/lib/qec/surface.ts';

function testDecoder(d: number) {
  const layout = getSurfaceLayout(d);
  const graphZ = buildMatchingGraph(layout, 'Z');
  const n2 = d * d;
  let failures = [];
  // all weight-1 and weight-2 X-error patterns
  for (let q1 = 0; q1 < n2; q1++) {
    const patterns = [];
    for (let q2 = q1 + 1; q2 < n2; q2++) patterns.push([q1, q2]);
    patterns.push([q1]);
    for (const pat of patterns) {
      // syndrome from X errors
      const syndromeZ = layout.stabsZ.map((st) =>
        st.qubits.reduce((acc, [r, c]) => acc + (pat.includes(r * d + c) ? 1 : 0), 0) % 2);
      const defects = syndromeZ.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
      const { pairs, toBoundary } = matchDefects(graphZ, defects);
      const residual = new Array(n2).fill(false);
      for (const q of pat) residual[q] = true;
      for (const [i, j] of pairs) for (const q of graphZ.path[i][j]) residual[q] = !residual[q];
      for (const i of toBoundary) for (const q of graphZ.pathB[i]) residual[q] = !residual[q];
      // residual must commute with all Z stabs and have even row-0 overlap
      let ok = true;
      for (const st of layout.stabsZ) {
        const ov = st.qubits.filter(([r, c]) => residual[r * d + c]).length;
        if (ov % 2 === 1) ok = false;
      }
      const row0 = layout.logicalZ.filter(([r, c]) => residual[r * d + c]).length;
      if (row0 % 2 === 1) ok = false;
      if (!ok) failures.push(pat.map((q) => `(${Math.floor(q / d)},${q % d})`).join('+'));
    }
  }
  console.log(`d=${d}: ${failures.length} failing patterns of weight<=2`);
  for (const f of failures.slice(0, 10)) console.log('   ', f);
  return failures.length;
}

testDecoder(3);
testDecoder(5);
testDecoder(7);
