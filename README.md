# QEC Simulator — Focused Edition (v8)

**Interactive Quantum Error Correction Simulator — built exactly around our reference program `all_with_noise_prob.py`.**

College project · **AMRITA VISHWA VIDYAPEETHAM**
Team: K. Devendra Reddy (CH.SC.U4CSE24021) · Shaik Muzzammil (CH.SC.U4CSE24041) · D. Guna Samhith (CH.SC.U4CSE24016)

---

## What this prototype is

This prototype implements **exactly** the scope of our reference implementation `all_with_noise_prob.py` (Qiskit + Qiskit Aer) — **2 QEC codes × 3 noise models, nothing more** — and every number on every tab is computed live in your browser by a verified state-vector engine:

| Reference program (Python) | This prototype (browser) |
|---|---|
| `bit_flip_qec(input_bit, error_qubit)` | Simulator Lab → **3-Qubit Bit-Flip Code** [[3,1,3]] |
| `phase_flip_qec(input_bit, error_qubit)` | Simulator Lab → **3-Qubit Phase-Flip Code** [[3,1,3]] |
| `build_noise_model` — 1. Bit-Flip (X) / 2. Phase-Flip (Z) / 3. Depolarizing, attached to the **ID gate** | Same three channels (Python type numbers shown in the UI) |
| `AerSimulator(noise_model=...).run(qc, shots=1000)` | Monte Carlo up to 25,000 shots, seeded and reproducible |
| counts → interpretation → performance analysis → syndrome table → circuit | The same outputs, plus printable PDF/JSON/CSV exports |

The **QEC STATUS** verdict is reproduced with the Python program's exact wording: `MATCHED`, `NOT MATCHED` or `DEPOLARIZING`.

### The exact Python circuits, in the app

The Simulator Lab renders the **real 5-qubit + 3-classical-bit circuits** of the Python file — input X, encoding CX ladder, the **ID-gate noise insertion point**, q3/q4 syndrome detection, mid-circuit measurement, the conditional `if_test` corrections (01→q0, 11→q1, 10→q2), the decode step and the final measurement — and the printable PDF report embeds the same diagram.

### The physics (verified, not decorative)

The engine is covered by a 100-assertion suite (`bun run scripts/test-qec.mjs`):

- **Matched pairs recover perfectly**: bit-flip code + X noise and phase-flip code + Z noise fix every single error (F = 1 after correction).
- **Monte Carlo matches theory**: bit-flip code success = (1−p)³ + 3p(1−p)² — the simulation lands on the analytic curve at every p.
- **Unmatched pairings behave honestly**: Z noise is invisible to the bit-flip code (no harm, no help); an X error on the phase-flip code is an undetectable logical flip.
- **Noise channels sampled correctly**: bit-flip/phase-flip event rates match p; depolarizing picks X/Y/Z uniformly.

## The seven tabs

1. **Overview** — hero, Phase-1 objectives → implemented features, an interactive worked example (the exact Phase-1 scenario: X error on q1, live engine run) and the pipeline architecture.
2. **Simulator Lab** — the full single-shot pipeline: code + noise + p + input state + manual error injection + seed → verdict with QEC STATUS, encoding circuit with error/correction markers, the exact Python circuit card, syndrome table with the Python mapping, Bloch-sphere comparison (QEC vs bare), state inspector. Exports: **PDF report (with the circuit diagram)**, JSON, CSV.
3. **3D Quantum Lab** — four real-time visualizers, all one-shot (press Run → play N rounds → stop), all engine-driven:
   - **Bloch Flight 4D** — the logical qubit flying through noise + correction rounds, time-colored trail + bare-qubit ghost.
   - **State Cityscape 3D** — live amplitude landscape of the encoded block.
   - **Syndrome Spacetime 4D** — the bit-flip code's data wires and syndrome checks stacked over correction rounds (noise hits, defects, corrections, failure floors).
   - **Bloch Sphere 3D** — interactive pipeline walkthrough: input → encoded → after noise → syndrome → corrected → decoded, stage by stage.
4. **Performance Lab** — Monte Carlo before/after (up to 25,000 shots) + the fidelity-vs-p sweep (1%→50%) exposing each code's pseudo-threshold. Exports: PDF report, JSON, CSV.
5. **Learn** — compact crash course: how to use the simulator, six core ideas, the QEC loop, glossary, FAQ.
6. **Reference** — the two QEC codes (with encoding circuits + stabilizers), the three noise models, and the 10-paper Phase-1 literature review.
7. **About** — college, team, engine highlights, tech stack, what's new.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Recharts for statistics; custom SVG for circuits / Bloch spheres; custom zero-dependency Canvas 3D engine (`three-d.ts`)
- From-scratch state-vector engine (`engine.ts`) with projective stabilizer measurement + quantum-trajectory noise sampling
- Reference program: Qiskit + Qiskit Aer (`all_with_noise_prob.py`, included in the project zip)

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

Engine tests (100 assertions):

```bash
bun scripts/test-qec.mjs
```

---

## Deploy to Vercel (step by step, after a GitHub push)

### A. Push this project to GitHub

1. Create a new **empty** repository on GitHub (no README/license — avoids conflicts).
2. In this project folder run:

```bash
git init
git add .
git commit -m "QEC Simulator — Focused Edition v8"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

> If you had a previous `origin`, replace step 5 with
> `git remote set-url origin https://github.com/<your-username>/<your-repo>.git`.
> GitHub no longer accepts passwords — use a **Personal Access Token** (GitHub → Settings → Developer settings → Tokens) as the password, or log in via the browser popup.

To publish later updates, just:

```bash
git add .
git commit -m "describe your change"
git push
```

### B. Deploy from the Vercel dashboard (recommended)

1. Go to **vercel.com** → sign in **with GitHub**.
2. **Add New… → Project** → pick the repository you just pushed.
3. Vercel auto-detects **Next.js**. Leave every setting at its default:
   - Framework preset: **Next.js** (filled automatically)
   - Build command: `next build` (default)
   - Output directory: `.next` (default)
   - Install command: `npm install` (default)
4. Click **Deploy** and wait ~1–2 minutes.
5. Open the given URL (`https://<project-name>.vercel.app`) — the simulator runs fully client-side; **no database, no environment variables, nothing else to configure**.

### C. Or deploy with the Vercel CLI

```bash
npm i -g vercel
vercel login
vercel          # preview deployment
vercel --prod   # production deployment
```

### D. Verify the deployment

- [ ] Overview loads with the gradient hero and the worked-example tour.
- [ ] Simulator Lab → Run Shot (default) → "Quantum information recovered", **QEC STATUS: MATCHED**, fidelity 100%.
- [ ] Simulator Lab → Manual Injection ON, q1 = X → Run Shot → syndrome flags, correction applied, bare qubit 0%.
- [ ] 3D Quantum Lab → Run flight / Run city / Run spacetime / Run pipeline — each plays once and stops.
- [ ] Performance Lab → Monte Carlo → ~3.59× fewer errors at p = 0.10; Sweep p draws the curves.
- [ ] Export Report opens the print-ready PDF with the circuit diagram.

### Troubleshooting

| Problem | Fix |
|---|---|
| Build fails on Vercel with a type error | Run `npx tsc --noEmit` locally and fix, then push again. |
| `npm install` fails | Delete `package-lock.json`, commit, push, redeploy. |
| Wrong Node version | Vercel defaults to Node 20 — compatible; do not override. |
| Page 404 after deploy | Make sure the repo root contains `package.json` (deploy the project folder, not a parent). |
| You changed code but Vercel shows the old site | Vercel redeploys automatically on every `git push` — check the Deployments tab for the latest commit hash. |

---

## What changed in this edition (v8)

- **Scope = the Python file, exactly**: 2 QEC codes and 3 noise channels; every extra code/noise from earlier drafts was removed.
- **Restored the compact 7-tab interface** with the worked-example Overview.
- **Exact Python circuits** rendered in-app and embedded in the PDF reports.
- **New 3D visualizers**: Bloch Sphere 3D (pipeline walkthrough) and Syndrome Spacetime 4D (bit-flip code over time) join Bloch Flight 4D and State Cityscape 3D.
- **All simulations one-shot** — they play a fixed number of rounds/stages and stop.
- **100-assertion engine suite**, lint-clean, production-build-verified, browser-tested end to end.

## Project structure

```
src/
  app/page.tsx                  # 7-tab shell
  lib/qec/engine.ts             # state-vector engine (gates, projective measurement, fidelity)
  lib/qec/codes.ts              # the 2 QEC codes + exact Python circuit definitions
  lib/qec/noise.ts              # the 3 noise channels (X / Z / depolarizing)
  lib/qec/pipeline.ts           # single-shot traces, Monte Carlo, sweeps, live rounds
  lib/qec/registry.ts           # UI-facing registry (codes × compatible noises)
  lib/report.ts                 # printable report builder (embeds circuit SVG) + JSON/CSV
  components/qec/
    SimulatorLab.tsx            # single-shot pipeline + Python circuit + exports
    PerformanceLab.tsx          # Monte Carlo + sweep + exports
    QuantumLab3D.tsx            # 3D lab shell (4 visualizers)
    Lab3DVisuals.tsx            # Cityscape + Syndrome Spacetime + Bloch Sphere 3D
    PythonCircuit.tsx           # exact all_with_noise_prob.py circuit renderer
    CircuitDiagram.tsx          # SVG circuit renderer with noise/correction markers
    BlochSphere.tsx             # small SVG Bloch spheres
    Overview / Learn / Galleries / Guide
scripts/test-qec.mjs            # 100-assertion engine verification
all_with_noise_prob.py          # the reference Qiskit program
```
