'use client';

/**
 * Surface code lattice visualization: data qubit grid with error/correction overlays
 * and stabilizer defect stars. Click-to-inject supported for teaching mode.
 */

import { getSurfaceLayout, stabCenter } from '@/lib/qec/surface';

export type CellState = 0 | 1 | 2 | 3; // 0 none, 1 X, 2 Z, 3 Y

interface Props {
  d: number;
  xErrors?: [number, number][];
  zErrors?: [number, number][];
  xCorrections?: [number, number][];
  zCorrections?: [number, number][];
  syndromeXDefects?: [number, number][];
  syndromeZDefects?: [number, number][];
  showStabs?: boolean;
  cellStates?: Map<string, CellState>;
  onCellClick?: (r: number, c: number, next: CellState) => void;
  size?: number;
}

export default function SurfaceGrid({
  d,
  xErrors = [],
  zErrors = [],
  xCorrections = [],
  zCorrections = [],
  syndromeXDefects = [],
  syndromeZDefects = [],
  showStabs = true,
  cellStates,
  onCellClick,
  size = 380,
}: Props) {
  const layout = getSurfaceLayout(d);
  const pad = 26;
  const cell = (size - pad * 2) / d;
  const px = (v: number) => pad + v * cell + cell / 2;
  const key = (r: number, c: number) => `${r},${c}`;

  const errSet = new Set(xErrors.map(([r, c]) => key(r, c)));
  const zErrSet = new Set(zErrors.map(([r, c]) => key(r, c)));
  const xCorSet = new Set(xCorrections.map(([r, c]) => key(r, c)));
  const zCorSet = new Set(zCorrections.map(([r, c]) => key(r, c)));

  const handleClick = (r: number, c: number) => {
    if (!onCellClick || !cellStates) return;
    const cur = cellStates.get(key(r, c)) ?? 0;
    onCellClick(r, c, ((cur + 1) % 4) as CellState);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} role="img" aria-label="Surface code lattice" className="rounded-lg border border-cyan-500/20 bg-[#0d1520]">
        {/* stabilizer plaquettes */}
        {showStabs && (
          <g>
            {layout.stabsX.map((st) => {
              const rows = st.qubits.map((q) => q[0]);
              const cols = st.qubits.map((q) => q[1]);
              const r0 = Math.min(...rows), r1 = Math.max(...rows);
              const c0 = Math.min(...cols), c1 = Math.max(...cols);
              const isDefect = syndromeXDefects.some(([dr, dc]) => dr === (r0 + r1) / 2 && dc === (c0 + c1) / 2);
              return (
                <rect
                  key={`sx-${st.id}`}
                  x={pad + c0 * cell + 2}
                  y={pad + r0 * cell + 2}
                  width={(c1 - c0) * cell + cell - 4}
                  height={(r1 - r0) * cell + cell - 4}
                  rx="7"
                  fill={isDefect ? '#f43f5e33' : '#22d3ee10'}
                  stroke={isDefect ? '#fb7185' : '#22d3ee44'}
                  strokeWidth={isDefect ? 1.8 : 1}
                />
              );
            })}
            {layout.stabsZ.map((st) => {
              const rows = st.qubits.map((q) => q[0]);
              const cols = st.qubits.map((q) => q[1]);
              const r0 = Math.min(...rows), r1 = Math.max(...rows);
              const c0 = Math.min(...cols), c1 = Math.max(...cols);
              const isDefect = syndromeZDefects.some(([dr, dc]) => dr === (r0 + r1) / 2 && dc === (c0 + c1) / 2);
              return (
                <rect
                  key={`sz-${st.id}`}
                  x={pad + c0 * cell + 2}
                  y={pad + r0 * cell + 2}
                  width={(c1 - c0) * cell + cell - 4}
                  height={(r1 - r0) * cell + cell - 4}
                  rx="7"
                  fill={isDefect ? '#f43f5e33' : '#a78bfa10'}
                  stroke={isDefect ? '#fb7185' : '#a78bfa44'}
                  strokeWidth={isDefect ? 1.8 : 1}
                />
              );
            })}
          </g>
        )}

        {/* data qubits */}
        {Array.from({ length: d }, (_, r) =>
          Array.from({ length: d }, (_, c) => {
            const k = key(r, c);
            const manual = cellStates?.get(k) ?? 0;
            const hasX = errSet.has(k) || manual === 1 || manual === 3;
            const hasZ = zErrSet.has(k) || manual === 2 || manual === 3;
            const hasXCor = xCorSet.has(k);
            const hasZCor = zCorSet.has(k);
            return (
              <g
                key={`q-${k}`}
                onClick={() => handleClick(r, c)}
                className={onCellClick ? 'cursor-pointer' : ''}
              >
                <circle cx={px(c)} cy={px(r)} r={cell * 0.3} fill="#13202e" stroke="#3b556e" strokeWidth="1" />
                {hasX && <text x={px(c) - 5} y={px(r) + 5} fontSize={cell * 0.34} fill="#fb7185" fontWeight="700">X</text>}
                {hasZ && <text x={px(c) + 4} y={px(r) + 5} fontSize={cell * 0.34} fill="#fbbf24" fontWeight="700">Z</text>}
                {hasXCor && <circle cx={px(c) - cell * 0.22} cy={px(r) - cell * 0.22} r={cell * 0.12} fill="#4ade80" />}
                {hasZCor && <circle cx={px(c) + cell * 0.22} cy={px(r) + cell * 0.22} r={cell * 0.12} fill="#4ade80" stroke="#166534" strokeWidth="0.8" />}
              </g>
            );
          })
        )}

        {/* logical operator guides */}
        <line x1={px(0)} y1={pad - 12} x2={px(0)} y2={pad - 12} stroke="none" />
        <text x={px(0)} y={12} fontSize="10" fill="#22d3ee88" textAnchor="middle">← X-L (col 0)</text>
        <text x={size - 6} y={px(0) + 3} fontSize="10" fill="#a78bfa88" textAnchor="end">Z-L (row 0) →</text>
      </svg>

      {/* legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span><span className="text-rose-400 font-bold">X</span> bit-flip error</span>
        <span><span className="text-amber-400 font-bold">Z</span> phase-flip error</span>
        <span><span className="text-rose-300">◻ pink plaquette</span> flagged X-stab</span>
        <span><span className="text-violet-300">◻ violet plaquette</span> flagged Z-stab</span>
        <span><span className="text-green-400">●</span> correction</span>
      </div>
    </div>
  );
}

export { stabCenter };
