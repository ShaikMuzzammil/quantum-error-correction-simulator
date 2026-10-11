'use client';

/**
 * SVG quantum circuit renderer: qubit lines + gate boxes laid out in columns.
 * Noise events are annotated as red lightning markers at the given column.
 */

import { GateOp } from '@/lib/qec/codes';

interface NoiseMarker {
  qubit: number;
  kind: string;
}

interface Props {
  ops: GateOp[];
  nQubits: number;
  noiseMarkers?: NoiseMarker[];
  correctionMarkers?: { qubit: number; kind: 'X' | 'Z' }[];
  height?: number;
}

const GATE_STYLE: Record<string, { label: string; fill: string; stroke: string }> = {
  H: { label: 'H', fill: '#2a2350', stroke: '#a78bfa' },
  X: { label: 'X', fill: '#3b1f3b', stroke: '#f472b6' },
  Y: { label: 'Y', fill: '#3b1f3b', stroke: '#f472b6' },
  Z: { label: 'Z', fill: '#3b1f3b', stroke: '#f472b6' },
  S: { label: 'S', fill: '#233a4a', stroke: '#22d3ee' },
  CNOT: { label: '⊕', fill: '#1f2f3b', stroke: '#67e8f9' },
  CZ: { label: 'Z', fill: '#1f2f3b', stroke: '#67e8f9' },
  CH: { label: 'H', fill: '#2a2350', stroke: '#a78bfa' },
  RX: { label: 'Rx', fill: '#233a4a', stroke: '#22d3ee' },
  RY: { label: 'Ry', fill: '#233a4a', stroke: '#22d3ee' },
  RZ: { label: 'Rz', fill: '#233a4a', stroke: '#22d3ee' },
};

export default function CircuitDiagram({ ops, nQubits, noiseMarkers = [], correctionMarkers = [], height }: Props) {
  if (nQubits === 0) return null;
  const colWidth = 52;
  const rowHeight = 34;
  const leftPad = 46;
  const topPad = 14;
  const width = leftPad + Math.max(ops.length, 1) * colWidth + 40 + (noiseMarkers.length || correctionMarkers.length ? 70 : 0);
  const h = height ?? topPad * 2 + (nQubits - 1) * rowHeight + 28;
  const yOf = (q: number) => topPad + q * rowHeight;

  // build columns: pack gates left-to-right greedily
  const columns: { op: GateOp; col: number }[] = [];
  let col = 0;
  for (const op of ops) {
    // find the earliest column where all involved qubits are free
    let c = col;
    // simple greedy: track occupancy
    const occupied = new Set<number>();
    for (const { op: prev, col: pc } of columns) {
      if (pc === c) prev.qubits.forEach((q) => occupied.add(q));
    }
    while (op.qubits.some((q) => occupied.has(q))) {
      c++;
      op.qubits.forEach(() => { /* noop */ });
      // recompute occupancy for the new column
      occupied.clear();
      for (const { op: prev, col: pc } of columns) {
        if (pc === c) prev.qubits.forEach((q) => occupied.add(q));
      }
    }
    columns.push({ op, col: c });
  }
  const maxCol = columns.reduce((m, x) => Math.max(m, x.col), 0);
  const totalW = leftPad + (maxCol + 1) * colWidth + 46 + (noiseMarkers.length || correctionMarkers.length ? 64 : 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-violet-500/20 bg-[#12101f] p-2">
      <svg width={totalW} height={h} role="img" aria-label="Quantum circuit diagram">
        {/* qubit lines */}
        {Array.from({ length: nQubits }, (_, q) => (
          <g key={`line-${q}`}>
            <line x1={leftPad} y1={yOf(q)} x2={totalW - 30} y2={yOf(q)} stroke="#3b3560" strokeWidth="1.2" />
            <text x={leftPad - 8} y={yOf(q) + 4} fontSize="10" fill="#8b85ad" textAnchor="end">
              q{q}
            </text>
          </g>
        ))}
        {/* gates */}
        {columns.map(({ op, col: cc }, gi) => {
          const style = GATE_STYLE[op.gate] ?? GATE_STYLE.H;
          const x = leftPad + cc * colWidth + colWidth / 2;
          if (op.gate === 'CNOT' || op.gate === 'CZ' || op.gate === 'CH') {
            const [ctrl, tgt] = op.qubits;
            const y1 = yOf(ctrl), y2 = yOf(tgt);
            return (
              <g key={`g-${gi}`}>
                <line x1={x} y1={y1} x2={x} y2={y2} stroke={style.stroke} strokeWidth="1.4" />
                <circle cx={x} cy={y1} r="4.5" fill={style.stroke} />
                {op.gate === 'CNOT' ? (
                  <g>
                    <circle cx={x} cy={y2} r="8.5" fill="#12101f" stroke={style.stroke} strokeWidth="1.5" />
                    <line x1={x - 8.5} y1={y2} x2={x + 8.5} y2={y2} stroke={style.stroke} strokeWidth="1.5" />
                    <line x1={x} y1={y2 - 8.5} x2={x} y2={y2 + 8.5} stroke={style.stroke} strokeWidth="1.5" />
                  </g>
                ) : (
                  <g>
                    <rect x={x - 11} y={y2 - 11} width="22" height="22" rx="4" fill={style.fill} stroke={style.stroke} strokeWidth="1.2" />
                    <text x={x} y={y2 + 4} fontSize="11" fill={style.stroke} textAnchor="middle">{style.label}</text>
                  </g>
                )}
              </g>
            );
          }
          const y = yOf(op.qubits[0]);
          return (
            <g key={`g-${gi}`}>
              <rect x={x - 13} y={y - 12} width="26" height="24" rx="5" fill={style.fill} stroke={style.stroke} strokeWidth="1.4" />
              <text x={x} y={y + 4} fontSize="11" fill={style.stroke} textAnchor="middle" fontWeight="600">
                {style.label}
              </text>
            </g>
          );
        })}
        {/* noise markers */}
        {noiseMarkers.map((nm, i) => {
          const x = leftPad + (maxCol + 1) * colWidth + 18;
          const y = yOf(nm.qubit);
          const color = nm.kind === 'Z' ? '#fbbf24' : nm.kind === 'AMP' ? '#34d399' : '#fb7185';
          return (
            <g key={`n-${i}`}>
              <path
                d={`M ${x} ${y - 3} l 6 3 l -4 2 l 6 3`}
                stroke={color}
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
              />
              <text x={x + 10} y={y + 4} fontSize="9" fill={color}>{nm.kind}</text>
            </g>
          );
        })}
        {/* correction markers */}
        {correctionMarkers.map((cm, i) => {
          const x = leftPad + (maxCol + 1) * colWidth + (noiseMarkers.length ? 62 : 18);
          const y = yOf(cm.qubit);
          const color = cm.kind === 'X' ? '#4ade80' : '#fbbf24';
          return (
            <g key={`c-${i}`}>
              <rect x={x - 9} y={y - 9} width="18" height="18" rx="3" fill="#12101f" stroke={color} strokeWidth="1.4" strokeDasharray="3 2" />
              <text x={x} y={y + 4} fontSize="10" fill={color} textAnchor="middle">{cm.kind}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
