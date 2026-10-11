/**
 * Rotated Surface Code (code-capacity model) — Pauli-frame simulation
 * with a minimum-weight perfect matching decoder.
 *
 * Layout: d x d grid of data qubits at (row, col), row/col in 0..d-1.
 *  - Z stabilizers: interior plaquettes with (r+c) odd + left/right boundary pairs
 *  - X stabilizers: interior plaquettes with (r+c) even + top/bottom boundary pairs
 *  - Logical X: Pauli-X chain along column 0 (connects top/bottom X boundaries)
 *  - Logical Z: Pauli-Z chain along row 0 (connects left/right Z boundaries)
 *
 * Decoding: X errors decoded from the Z-stabilizer syndrome and vice versa,
 * each via exact MWPM (DP over defect subsets) on the stabilizer adjacency graph.
 * This model exhibits the celebrated surface-code threshold (~10% code capacity).
 */

import { RNG } from './engine';

export interface SurfaceStab {
  qubits: [number, number][]; // (row, col) pairs
  type: 'X' | 'Z';
  id: number;
  label: string;
}

export interface SurfaceLayout {
  d: number;
  stabsX: SurfaceStab[];
  stabsZ: SurfaceStab[];
  logicalX: [number, number][]; // column 0
  logicalZ: [number, number][]; // row 0
}

export function buildSurfaceLayout(d: number): SurfaceLayout {
  const stabsX: SurfaceStab[] = [];
  const stabsZ: SurfaceStab[] = [];
  let id = 0;

  // interior plaquettes
  for (let r = 0; r < d - 1; r++) {
    for (let c = 0; c < d - 1; c++) {
      const qs: [number, number][] = [
        [r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1],
      ];
      if ((r + c) % 2 === 0) {
        stabsX.push({ qubits: qs, type: 'X', id: id++, label: `X(${r},${c})` });
      } else {
        stabsZ.push({ qubits: qs, type: 'Z', id: id++, label: `Z(${r},${c})` });
      }
    }
  }
  // boundary pairs
  for (let c = 0; c < d - 1; c++) {
    if (c % 2 === 1) stabsX.push({ qubits: [[0, c], [0, c + 1]], type: 'X', id: id++, label: `X-top(${c})` });
    if (c % 2 === 0) stabsX.push({ qubits: [[d - 1, c], [d - 1, c + 1]], type: 'X', id: id++, label: `X-bot(${c})` });
  }
  for (let r = 0; r < d - 1; r++) {
    if (r % 2 === 0) stabsZ.push({ qubits: [[r, 0], [r + 1, 0]], type: 'Z', id: id++, label: `Z-left(${r})` });
    if (r % 2 === 1) stabsZ.push({ qubits: [[r, d - 1], [r + 1, d - 1]], type: 'Z', id: id++, label: `Z-right(${r})` });
  }

  const logicalX: [number, number][] = [];
  const logicalZ: [number, number][] = [];
  for (let r = 0; r < d; r++) logicalX.push([r, 0]);
  for (let c = 0; c < d; c++) logicalZ.push([0, c]);

  return { d, stabsX, stabsZ, logicalX, logicalZ };
}

// ---------------------------------------------------------------------------
// Matching decoder machinery (built once per distance + stabilizer type)
// ---------------------------------------------------------------------------

export interface MatchingGraph {
  /** number of stabilizer nodes (boundary = virtual node index nNodes) */
  nNodes: number;
  /** pairwise distance between stabilizer nodes (BFS over adjacency, weight 1 per error) */
  dist: number[][];
  /** distance to boundary */
  distBoundary: number[];
  /** recovery paths: path[i][j] = qubit indices along the shortest path between stabs i and j */
  path: number[][][];
  /** boundary recovery: pathB[i] = qubit indices for a path from stab i to boundary */
  pathB: number[][];
}

interface QubitIndex {
  [rowCol: string]: number;
}

export function buildMatchingGraph(layout: SurfaceLayout, stabType: 'X' | 'Z'): MatchingGraph {
  const stabs = stabType === 'X' ? layout.stabsX : layout.stabsZ;
  const n = stabs.length;
  const key = (r: number, c: number) => `${r},${c}`;

  // map each qubit to the stabs (of this type) that contain it
  const qubitMap = new Map<string, number[]>();
  stabs.forEach((st, i) => {
    for (const [r, c] of st.qubits) {
      const k = key(r, c);
      if (!qubitMap.has(k)) qubitMap.set(k, []);
      qubitMap.get(k)!.push(i);
    }
  });

  // adjacency: stabs i,j adjacent iff they share a qubit (an error there flips both)
  const adj: number[][] = Array.from({ length: n }, () => []);
  const sharedQubit: Map<string, number[]> = new Map(); // "i,j" -> qubit indices connecting them
  for (const [qk, stList] of qubitMap) {
    for (let a = 0; a < stList.length; a++) {
      for (let b = a + 1; b < stList.length; b++) {
        const i = stList[a], j = stList[b];
        if (!adj[i].includes(j)) adj[i].push(j);
        if (!adj[j].includes(i)) adj[j].push(i);
        const pk = `${Math.min(i, j)},${Math.max(i, j)}`;
        if (!sharedQubit.has(pk)) sharedQubit.set(pk, []);
        sharedQubit.get(pk)!.push(parseInt(qk.split(',')[0]) * layout.d + parseInt(qk.split(',')[1]));
      }
    }
  }

  // boundary-adjacent: stabs having a qubit shared with no other stab of this type
  const boundaryAdj: number[] = [];
  const boundaryQubit: number[] = []; // the private qubit linking that stab to the boundary
  stabs.forEach((st, i) => {
    for (const [r, c] of st.qubits) {
      if (qubitMap.get(key(r, c))!.length === 1) {
        boundaryAdj.push(i);
        boundaryQubit[i] = r * layout.d + c;
        break;
      }
    }
  });

  // BFS from each node; record distances and paths
  const dist: number[][] = [];
  const path: number[][][] = [];
  const distBoundary: number[] = new Array(n).fill(Infinity);
  const pathB: number[][] = [];

  for (let s = 0; s < n; s++) {
    const parents = new Array(n).fill(-1);
    const dd = new Array(n).fill(Infinity);
    dd[s] = 0;
    const queue = [s];
    while (queue.length) {
      const u = queue.shift()!;
      for (const v of adj[u]) {
        if (dd[v] === Infinity) {
          dd[v] = dd[u] + 1;
          parents[v] = u;
          queue.push(v);
        }
      }
    }
    dist.push(dd);
    // paths from s to every node
    const row: number[][] = [];
    for (let t = 0; t < n; t++) {
      if (dd[t] === Infinity) row.push([]);
      else {
        // build path s -> t by walking parents from t back to s, then reversing
        const rev: number[] = [t];
        let cur = t;
        while (cur !== s) {
          cur = parents[cur];
          rev.push(cur);
        }
        rev.reverse();
        const qubits: number[] = [];
        for (let k = 0; k < rev.length - 1; k++) {
          const i = Math.min(rev[k], rev[k + 1]);
          const j = Math.max(rev[k], rev[k + 1]);
          const qs = sharedQubit.get(`${i},${j}`);
          if (qs) qubits.push(...qs);
        }
        row.push(qubits);
      }
    }
    path.push(row);

    // boundary distance: BFS with boundary as additional node
    // dist to boundary = min over boundary-adjacent stabs t of (dist[s][t] + 1)
    let bd = Infinity;
    let bestT = -1;
    for (const t of boundaryAdj) {
      if (dist[s][t] !== undefined && isFinite(dist[s][t])) {
        const cand = dist[s][t] + 1;
        if (cand < bd) {
          bd = cand;
          bestT = t;
        }
      }
    }
    distBoundary[s] = bd;
    // recovery path to boundary = path to the boundary-adjacent stab t,
    // PLUS t's private qubit which flips t and (conceptually) the boundary
    if (bestT >= 0) {
      pathB[s] = [...path[s][bestT], boundaryQubit[bestT]];
    } else {
      pathB[s] = [];
    }
  }

  return { nNodes: n, dist, distBoundary, path, pathB };
}

/**
 * Exact MWPM via DP over defect subsets.
 * The boundary acts as an unlimited-capacity virtual node: any defect may pair
 * with it (cost = distBoundary). This single unified DP automatically handles
 * both odd and even defect counts with any number of boundary pairings.
 * Fallback: greedy matching for large defect sets (> 14).
 */
export function matchDefects(
  graph: MatchingGraph,
  defects: number[]
): { pairs: [number, number][]; toBoundary: number[] } {
  const { dist, distBoundary } = graph;
  const k = defects.length;
  const pairs: [number, number][] = [];
  const toBoundary: number[] = [];

  if (k === 0) return { pairs, toBoundary };

  // cost matrix: k x (k+1); column k = boundary
  const D: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < k; j++) row.push(dist[defects[i]][defects[j]]);
    row.push(distBoundary[defects[i]]);
    D.push(row);
  }

  if (k <= 14) {
    const memo = new Map<number, { cost: number; choice: [number, number] | null }>();
    const dp = (mask: number): { cost: number; choice: [number, number] | null } => {
      if (mask === 0) return { cost: 0, choice: null };
      const hit = memo.get(mask);
      if (hit) return hit;
      let i = 0;
      while (!(mask & (1 << i))) i++;
      let best = { cost: Infinity, choice: null as [number, number] | null };
      // pair i with another real defect j
      for (let j = i + 1; j < k; j++) {
        if (!(mask & (1 << j))) continue;
        const sub = dp(mask & ~(1 << i) & ~(1 << j));
        const cost = D[i][j] + sub.cost;
        if (cost < best.cost) best = { cost, choice: [i, j] };
      }
      // pair i with the boundary
      {
        const sub = dp(mask & ~(1 << i));
        const cost = D[i][k] + sub.cost;
        if (cost < best.cost) best = { cost, choice: [i, -1] };
      }
      memo.set(mask, best);
      return best;
    };
    const full = (1 << k) - 1;
    const res = dp(full);
    let mask = full;
    let cur = res;
    while (mask !== 0 && cur.choice) {
      const [i, j] = cur.choice;
      if (j === -1) {
        toBoundary.push(defects[i]);
        mask &= ~(1 << i);
      } else {
        pairs.push([defects[i], defects[j]]);
        mask &= ~(1 << i) & ~(1 << j);
      }
      cur = dp(mask);
    }
  } else {
    // greedy fallback: repeatedly match the cheapest pair (incl. boundary)
    const remaining = new Set<number>();
    for (let i = 0; i < k; i++) remaining.add(i);
    while (remaining.size > 0) {
      const arr = [...remaining];
      let bi = -1, bj = -1, bc = Infinity, useBoundary = false;
      for (let a = 0; a < arr.length; a++) {
        // boundary option
        if (distBoundary[defects[arr[a]]] < bc) {
          bc = distBoundary[defects[arr[a]]];
          bi = arr[a];
          useBoundary = true;
        }
        for (let b = a + 1; b < arr.length; b++) {
          const c = dist[defects[arr[a]]][defects[arr[b]]];
          if (c < bc) { bc = c; bi = arr[a]; bj = arr[b]; useBoundary = false; }
        }
      }
      if (useBoundary) {
        toBoundary.push(defects[bi]);
        remaining.delete(bi);
      } else {
        pairs.push([defects[bi], defects[bj]]);
        remaining.delete(bi);
        remaining.delete(bj);
      }
    }
  }
  return { pairs, toBoundary };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export type SurfaceNoise = 'bitflip' | 'phaseflip' | 'depolarizing';

export interface SurfaceShotResult {
  logicalError: boolean;
  xErrors: [number, number][];   // (row, col) with X component (incl. Y)
  zErrors: [number, number][];
  syndromeXDefects: [number, number][]; // stab positions (approx center) with -1 outcome
  syndromeZDefects: [number, number][];
  xCorrections: [number, number][];
  zCorrections: [number, number][];
  detected: boolean;
}

const layoutCache = new Map<number, SurfaceLayout>();
const graphCache = new Map<string, MatchingGraph>();

export function getSurfaceLayout(d: number): SurfaceLayout {
  if (!layoutCache.has(d)) layoutCache.set(d, buildSurfaceLayout(d));
  return layoutCache.get(d)!;
}

function getGraph(d: number, type: 'X' | 'Z'): MatchingGraph {
  const k = `${d}:${type}`;
  if (!graphCache.has(k)) graphCache.set(k, buildMatchingGraph(getSurfaceLayout(d), type));
  return graphCache.get(k)!;
}

/** Stabilizer center for visualization */
export function stabCenter(layout: SurfaceLayout, st: SurfaceStab): [number, number] {
  const rows = st.qubits.map((q) => q[0]);
  const cols = st.qubits.map((q) => q[1]);
  return [rows.reduce((a, b) => a + b) / rows.length, cols.reduce((a, b) => a + b) / cols.length];
}

/**
 * Run one code-capacity shot of the surface code.
 * noise: 'bitflip' -> X errors w.p. p; 'phaseflip' -> Z errors w.p. p;
 * 'depolarizing' -> X/Y/Z each w.p. p/3 (Y = X+Z).
 */
export function runSurfaceShot(d: number, noise: SurfaceNoise, p: number, rng: RNG): SurfaceShotResult {
  const layout = getSurfaceLayout(d);
  const n2 = d * d;

  // sample errors (X and Z components per data qubit)
  const xErr = new Array(n2).fill(false);
  const zErr = new Array(n2).fill(false);
  for (let i = 0; i < n2; i++) {
    if (noise === 'bitflip' || noise === 'depolarizing') {
      if (noise === 'bitflip') {
        if (rng() < p) xErr[i] = true;
      } else {
        const r = rng();
        if (r < p / 3) xErr[i] = true;
        if (r >= p / 3 && r < 2 * p / 3) zErr[i] = true;
        if (r >= 2 * p / 3 && r < p) { xErr[i] = true; zErr[i] = true; } // Y
      }
    }
    if (noise === 'phaseflip') {
      if (rng() < p) zErr[i] = true;
    }
  }

  // syndromes
  // X errors flip Z stabilizers; Z errors flip X stabilizers
  const syndromeZ = layout.stabsZ.map((st) =>
    st.qubits.reduce((acc, [r, c]) => acc + (xErr[r * d + c] ? 1 : 0), 0) % 2
  );
  const syndromeX = layout.stabsX.map((st) =>
    st.qubits.reduce((acc, [r, c]) => acc + (zErr[r * d + c] ? 1 : 0), 0) % 2
  );

  // decode X errors from Z syndrome; Z errors from X syndrome
  const graphZ = getGraph(d, 'Z');
  const graphX = getGraph(d, 'X');

  const decode = (syndrome: number[], stabs: SurfaceStab[], graph: MatchingGraph): [number, number][] => {
    const defects = syndrome.map((s, i) => (s === 1 ? i : -1)).filter((i) => i >= 0);
    if (defects.length === 0) return [];
    const { pairs, toBoundary } = matchDefects(graph, defects);
    const corrected: boolean[] = new Array(n2).fill(false);
    for (const [i, j] of pairs) {
      for (const q of graph.path[i][j]) corrected[q] = !corrected[q];
    }
    for (const i of toBoundary) {
      for (const q of graph.pathB[i]) corrected[q] = !corrected[q];
    }
    const out: [number, number][] = [];
    for (let q = 0; q < n2; q++) if (corrected[q]) out.push([Math.floor(q / d), q % d]);
    return out;
  };

  const xCorrections = decode(syndromeZ, layout.stabsZ, graphZ);
  const zCorrections = decode(syndromeX, layout.stabsX, graphX);

  // residual errors
  const resX = new Array(n2).fill(false);
  const resZ = new Array(n2).fill(false);
  for (let i = 0; i < n2; i++) {
    resX[i] = xErr[i];
    resZ[i] = zErr[i];
  }
  for (const [r, c] of xCorrections) resX[r * d + c] = !resX[r * d + c];
  for (const [r, c] of zCorrections) resZ[r * d + c] = !resZ[r * d + c];

  // logical error: residual X anticommutes with logical Z (row 0 chain)
  const xOnRow0 = layout.logicalZ.filter(([r, c]) => resX[r * d + c]).length;
  const zOnCol0 = layout.logicalX.filter(([r, c]) => resZ[r * d + c]).length;
  const logicalError = (xOnRow0 % 2 === 1) || (zOnCol0 % 2 === 1);

  const toPos = (i: number): [number, number] => [Math.floor(i / d), i % d];
  const xErrorList: [number, number][] = [];
  const zErrorList: [number, number][] = [];
  for (let i = 0; i < n2; i++) {
    if (xErr[i]) xErrorList.push(toPos(i));
    if (zErr[i]) zErrorList.push(toPos(i));
  }

  return {
    logicalError,
    xErrors: xErrorList,
    zErrors: zErrorList,
    syndromeZDefects: syndromeZ.map((s, i) => (s ? stabCenter(layout, layout.stabsZ[i]) : null)).filter(Boolean) as [number, number][],
    syndromeXDefects: syndromeX.map((s, i) => (s ? stabCenter(layout, layout.stabsX[i]) : null)).filter(Boolean) as [number, number][],
    xCorrections,
    zCorrections,
    detected: syndromeX.some((s) => s === 1) || syndromeZ.some((s) => s === 1),
  };
}

/** Monte Carlo: estimate logical failure rate */
export function surfaceMonteCarlo(
  d: number,
  noise: SurfaceNoise,
  p: number,
  shots: number,
  rng: RNG
): { pLogical: number; shots: number; failures: number; detectionRate: number } {
  let failures = 0;
  let detections = 0;
  for (let s = 0; s < shots; s++) {
    const res = runSurfaceShot(d, noise, p, rng);
    if (res.logicalError) failures++;
    if (res.detected) detections++;
  }
  return {
    pLogical: failures / shots,
    shots,
    failures,
    detectionRate: detections / shots,
  };
}
// v3 fixed D matrix
