import { getSurfaceLayout, buildMatchingGraph, matchDefects } from '../src/lib/qec/surface.ts';

const d = 5;
const layout = getSurfaceLayout(d);
const g = buildMatchingGraph(layout, 'Z');

// X errors at (0,0) and (4,0)
const pat = [0 * d + 0, 4 * d + 0];
const syndromeZ = layout.stabsZ.map((st) =>
  st.qubits.reduce((acc, [r, c]) => acc + (pat.includes(r * d + c) ? 1 : 0), 0) % 2);
console.log('syndrome:', syndromeZ.map((s, i) => s ? layout.stabsZ[i].label : null).filter(Boolean));

const defects = syndromeZ.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
console.log('defects:', defects.map((i) => layout.stabsZ[i].label));

const { pairs, toBoundary } = matchDefects(g, defects);
console.log('pairs:', pairs.map(([a, b]) => `${layout.stabsZ[a].label}-${layout.stabsZ[b].label}`));
console.log('toBoundary:', toBoundary.map((i) => layout.stabsZ[i].label));
console.log('pathB:', toBoundary.map((i) => g.pathB[i].map((q) => `(${Math.floor(q / d)},${q % d})`).join(',')));

// dist/distBoundary values
console.log('distBoundary of defects:', defects.map((i) => `${layout.stabsZ[i].label}: ${g.distBoundary[i]}`));
const [a, b] = defects;
console.log('dist between them:', g.dist[a][b]);

// correction
const residual = new Array(d * d).fill(false);
for (const q of pat) residual[q] = true;
for (const [i, j] of pairs) for (const q of g.path[i][j]) residual[q] = !residual[q];
for (const i of toBoundary) for (const q of g.pathB[i]) residual[q] = !residual[q];
console.log('residual:', residual.map((v, q) => v ? `(${Math.floor(q / d)},${q % d})` : null).filter(Boolean));
