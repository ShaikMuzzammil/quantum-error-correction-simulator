'use client';

/**
 * PythonCircuit — renders the EXACT circuits of all_with_noise_prob.py:
 * 5 quantum wires (q0..q4), 3 classical wires (c0..c2), stage bands with the
 * Python file's own stage comments, the id-gate noise insertion point,
 * mid-circuit syndrome measurement, conditional (if_test) X corrections,
 * the decode step and the final measurement.
 *
 * The drawing is a pure function returning an SVG string, so the SAME
 * renderer powers both the on-screen card and the printable PDF reports
 * (exports show the real circuit, not a placeholder).
 */

import { buildPythonCircuit, PythonCircuit } from '@/lib/qec/codes';

interface RenderOpts {
  /** width of the inner svg (px) — layout is computed from the op count */
  scale?: number;
}

const W = {
  leftPad: 52,
  colWidth: 46,
  qRowH: 30,
  cRowH: 26,
  topPad: 30, // room for stage labels
  stagePad: 12,
};

interface El { svg: string }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Pure SVG-string renderer of the Python circuit.
 */
export function pythonCircuitSVG(circuit: PythonCircuit, _opts: RenderOpts = {}): { svg: string; width: number; height: number } {
  const { ops, stages, nQ, nC } = circuit;
  const nCols = ops.length;
  const width = W.leftPad + nCols * W.colWidth + 30;
  const qH = (nQ - 1) * W.qRowH;
  const cTop = W.topPad + qH + 22;
  const height = cTop + (nC - 1) * W.cRowH + 26;
  const yQ = (q: number) => W.topPad + q * W.qRowH;
  const yC = (c: number) => cTop + c * W.cRowH;

  const els: El[] = [];
  const push = (svg: string) => els.push({ svg });

  // ---- stage bands (alternating tint + label)
  for (let s = 0; s < stages.length; s++) {
    const from = stages[s].at;
    const to = s + 1 < stages.length ? stages[s + 1].at : nCols;
    const x0 = W.leftPad + from * W.colWidth - W.stagePad / 2;
    const x1 = W.leftPad + to * W.colWidth - W.stagePad / 2;
    const w = Math.max(10, x1 - x0);
    push(`<rect x="${x0}" y="${W.topPad - 22}" width="${w}" height="${height - W.topPad + 18}" fill="${s % 2 ? 'rgba(139,92,246,0.055)' : 'rgba(34,211,238,0.04)'}"/>`);
    const label = stages[s].label;
    const shortLabel = label.length > 24 ? label.slice(0, 23) + '…' : label;
    push(`<text x="${x0 + w / 2}" y="${W.topPad - 27}" font-size="8.5" fill="#8b85ad" text-anchor="middle" font-family="ui-monospace,monospace">${esc(shortLabel)}</text>`);
    push(`<line x1="${x1}" y1="${W.topPad - 22}" x2="${x1}" y2="${height - 8}" stroke="rgba(139,92,246,0.25)" stroke-width="0.8" stroke-dasharray="3 3"/>`);
  }

  // ---- quantum wires
  for (let q = 0; q < nQ; q++) {
    push(`<line x1="${W.leftPad}" y1="${yQ(q)}" x2="${width - 24}" y2="${yQ(q)}" stroke="#3b3560" stroke-width="1.2"/>`);
    push(`<text x="${W.leftPad - 8}" y="${yQ(q) + 4}" font-size="10" fill="#8b85ad" text-anchor="end" font-family="ui-monospace,monospace">q${q}</text>`);
  }
  // ---- classical wires (double lines)
  for (let c = 0; c < nC; c++) {
    push(`<line x1="${W.leftPad}" y1="${yC(c) - 1.6}" x2="${width - 24}" y2="${yC(c) - 1.6}" stroke="#2e4a56" stroke-width="0.9"/>`);
    push(`<line x1="${W.leftPad}" y1="${yC(c) + 1.6}" x2="${width - 24}" y2="${yC(c) + 1.6}" stroke="#2e4a56" stroke-width="0.9"/>`);
    push(`<text x="${W.leftPad - 8}" y="${yC(c) + 4}" font-size="10" fill="#67c3de" text-anchor="end" font-family="ui-monospace,monospace">c${c}</text>`);
  }

  // ---- ops, strictly sequential columns (true to the Python file order)
  ops.forEach((op, i) => {
    const x = W.leftPad + i * W.colWidth + W.colWidth / 2;
    if (op.kind === 'gate') {
      const y = yQ(op.qubit);
      const style =
        op.gate === 'H'
          ? { label: 'H', fill: '#2a2350', stroke: '#a78bfa' }
          : op.gate === 'X'
            ? { label: 'X', fill: '#3b1f3b', stroke: '#f472b6' }
            : { label: 'ID', fill: '#3a2f14', stroke: '#fbbf24' };
      push(`<rect x="${x - 13}" y="${y - 12}" width="26" height="24" rx="5" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.4"${op.gate === 'ID' ? ' stroke-dasharray="4 2"' : ''}/>`);
      push(`<text x="${x}" y="${y + 4}" font-size="11" fill="${style.stroke}" text-anchor="middle" font-weight="600" font-family="ui-monospace,monospace">${style.label}</text>`);
      if (op.gate === 'ID') {
        // noise bolt marker above the id gate
        push(`<path d="M ${x + 14} ${y - 14} l 6 3 l -4 2 l 6 3" stroke="#fbbf24" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
        push(`<text x="${x + 22}" y="${y - 6}" font-size="8" fill="#fbbf24" font-family="ui-monospace,monospace">noise</text>`);
      }
    } else if (op.kind === 'cnot') {
      const y1 = yQ(op.control), y2 = yQ(op.target);
      push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#67e8f9" stroke-width="1.4"/>`);
      push(`<circle cx="${x}" cy="${y1}" r="4.2" fill="#67e8f9"/>`);
      push(`<circle cx="${x}" cy="${y2}" r="8" fill="#12101f" stroke="#67e8f9" stroke-width="1.5"/>`);
      push(`<line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}" stroke="#67e8f9" stroke-width="1.5"/>`);
      push(`<line x1="${x}" y1="${y2 - 8}" x2="${x}" y2="${y2 + 8}" stroke="#67e8f9" stroke-width="1.5"/>`);
    } else if (op.kind === 'measure') {
      const y = yQ(op.qubit), yc = yC(op.clbit);
      push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${yc}" stroke="#67c3de" stroke-width="1.1"/>`);
      push(`<rect x="${x - 12}" y="${y - 11}" width="24" height="22" rx="4" fill="#12303b" stroke="#67c3de" stroke-width="1.3"/>`);
      // meter arc + needle
      push(`<path d="M ${x - 6} ${y + 3} a 6.5 6.5 0 0 1 12 0" fill="none" stroke="#67c3de" stroke-width="1.2"/>`);
      push(`<line x1="${x}" y1="${y + 2}" x2="${x + 3.6}" y2="${y - 3}" stroke="#67c3de" stroke-width="1.3"/>`);
      push(`<circle cx="${x}" cy="${yc}" r="3" fill="#67c3de"/>`);
      push(`<text x="${x}" y="${yc + 14}" font-size="7.5" fill="#67c3de" text-anchor="middle" font-family="ui-monospace,monospace">c${op.clbit}</text>`);
    } else if (op.kind === 'ifx') {
      const y = yQ(op.target);
      const yc = yC(1); // syndrome lives in c0..c1; anchor from the middle of the register
      push(`<line x1="${x}" y1="${yc}" x2="${x}" y2="${y + 12}" stroke="#4ade80" stroke-width="1.1" stroke-dasharray="3 2.4"/>`);
      push(`<rect x="${x - 15}" y="${y - 12}" width="30" height="24" rx="5" fill="#132417" stroke="#4ade80" stroke-width="1.3" stroke-dasharray="4 2"/>`);
      push(`<text x="${x}" y="${y + 4}" font-size="10.5" fill="#4ade80" text-anchor="middle" font-weight="700" font-family="ui-monospace,monospace">X</text>`);
      push(`<text x="${x}" y="${y + 20}" font-size="7.5" fill="#4ade80" text-anchor="middle" font-family="ui-monospace,monospace">if c=${op.syndrome}</text>`);
    }
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Python QEC circuit"><rect width="${width}" height="${height}" fill="#12101f"/>${els.map((e) => e.svg).join('')}</svg>`;
  return { svg, width, height };
}

/* ------------------------------------------------------------------ */
/* React wrapper                                                       */
/* ------------------------------------------------------------------ */

export default function PythonCircuitCard({
  pythonType,
  inputBit,
  errorQubit,
}: {
  pythonType: 1 | 2;
  inputBit: 0 | 1;
  errorQubit: 0 | 1 | 2;
}) {
  const circuit = buildPythonCircuit(pythonType, inputBit, errorQubit);
  const { svg } = pythonCircuitSVG(circuit);
  return (
    <div className="overflow-x-auto rounded-lg border border-violet-500/20 bg-[#12101f] p-2">
      <div className="dangerous-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
