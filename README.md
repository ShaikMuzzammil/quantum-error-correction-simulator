# QEC Simulator — Phase 2 Prototype (Bloch-Sphere Focused Edition)

**Interactive Quantum Error Correction Simulator — scoped exactly to our reference program `all_with_noise_prob.py`.**

College project · **AMRITA VISHWA VIDYAPEETHAM**
Team: K. Devendra Reddy (CH.SC.U4CSE24021) · Shaik Muzzammil (CH.SC.U4CSE24041) · D. Guna Samhith (CH.SC.U4CSE24016)

---

## What this prototype is

This prototype implements **exactly** the scope of our reference implementation `all_with_noise_prob.py` (Qiskit + Qiskit Aer) — **2 QEC codes × 3 noise models, nothing more** — and every number on every tab is computed live in your browser by a verified state-vector engine. There is no mock data anywhere in the app: press Run and the engine really encodes, applies noise, measures syndromes, corrects, decodes and measures.

| Reference program (Python) | This prototype (browser) |
|---|---|
| `bit_flip_qec(input_bit, error_qubit)` — 5 qubits, 3 classical bits | Simulator Lab → **3-Qubit Bit-Flip Code** [[3,1,3]] |
| `phase_flip_qec(input_bit, error_qubit)` — H-conjugated repetition | Simulator Lab → **3-Qubit Phase-Flip Code** [[3,1,3]] |
| `build_noise_model` — 1. Bit-Flip (X) / 2. Phase-Flip (Z) / 3. Depolarizing, attached to the **ID gate** | The same three channels, sampled per qubit via quantum trajectories |
| `AerSimulator(noise_model=...).run(qc, shots=1000)` | Monte Carlo up to 25,000 shots, seeded and reproducible |
| counts → interpretation → performance analysis → syndrome table → circuit | The same outputs, plus printable PDF / JSON / CSV exports |

### The physics (verified, not decorative)

The engine is covered by a 55-assertion suite (`bun run scripts/test-qec.mjs`):

- **Matched pairs recover perfectly**: bit-flip code + X noise and phase-flip code + Z noise fix every single error (F = 100% after correction). Syndrome mapping matches the Python table: 01→q0, 11→q1, 10→q2.
- **Monte Carlo matches theory**: bit-flip code success = (1−p)³ + 3p(1−p)² — the simulation lands on the analytic curve at every p (verified to ±1%).
- **Unmatched pairings behave honestly**: a Z error is invisible to the bit-flip code (trivial syndrome); an X error on the phase-flip code is undetectable — exactly like the Python program's NOT MATCHED status.
- **Noise channels sampled correctly**: bit-flip/phase-flip event rates match p; depolarizing picks X/Y/Z uniformly at p/3 each.

## The seven tabs

1. **Overview** — hero, Phase-1 objectives → implemented features, a **compact "How it works" worked example** (the exact Phase-1 scenario: X error on q1, live engine run, small collapsible box) and the pipeline architecture.
2. **Simulator Lab** — the full single-shot pipeline: code + noise + p + input state + manual error injection + seed → verdict with fidelity (with QEC vs bare), encoding circuit with error/correction markers, syndrome table, Bloch-sphere comparison, encoded-state inspector. Exports: **PDF report**, JSON, CSV.
3. **3D Quantum Lab** — **only Bloch-sphere visualizers, all real-time, all engine-driven, all one-shot (press Run → plays through → stops)**:
   - **Bloch Sphere** (new) — the FULL pipeline walked stage by stage on a live 3D sphere: Input → Encode → Noise → Syndrome → Correct → Decode → Measure. The state arrow really moves: watch the noise kick it away and the decoder snap it back. Manual error placement (qubit + X/Z/Y) reproduces any single scenario; every stage is replayable; syndrome chips, correction info, fidelity and final outcome all update live.
   - **Bloch Flight 4D** — the logical qubit flying round after round through noise + correction cycles, with its time-colored trajectory trail (space + time = 4D) and the bare-qubit ghost for comparison.
   - Both export a formal report (printable → PDF), JSON and CSV.
4. **Performance Lab** — Monte Carlo before/after (up to 25,000 shots, live-converging) + the fidelity-vs-p sweep (1%→50%) exposing each code's pseudo-threshold + **Code Showdown** ranking both codes under identical noise. Exports: PDF report, JSON, CSV.
5. **Learn** — compact crash course: how to use the simulator, six core ideas, the QEC loop, glossary, FAQ.
6. **Reference** — the two QEC codes (with encoding circuits + stabilizers), the three noise models, and the 10-paper Phase-1 literature review.
7. **About** — college, team, engine highlights, tech stack, what's new in this edition.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Recharts for statistics; custom SVG for circuits / Bloch spheres; custom zero-dependency Canvas 3D engine (`three-d.ts`)
- From-scratch state-vector engine (`engine.ts`) with projective stabilizer measurement + quantum-trajectory noise sampling
- Reference program: Qiskit + Qiskit Aer (`all_with_noise_prob.py`, included in the project zip)

## Run locally

```bash
bun install        # or npm install
bun run dev        # or npm run dev  → http://localhost:3000
bun run test       # engine verification suite (55 assertions)
bun run lint       # eslint
bun run build      # production build (what Vercel runs)
```

---

## Deploy to Vercel (step by step, after a GitHub push)

The project is a standard Next.js 16 App Router app — Vercel detects it automatically. No environment variables, no database, no server: everything runs client-side.

### 1. Push the project to GitHub

```bash
cd qec-simulator
git init
git add .
git commit -m "QEC Simulator - Phase 2 prototype (focused edition)"
git branch -M main
git remote add origin https://github.com/<your-username>/qec-simulator.git
git push -u origin main
```

> Tip: if you downloaded the project as a ZIP, unzip it first and make sure you can run `bun run dev` locally before pushing.

### 2. Create the Vercel project

1. Go to **https://vercel.com** and sign in (a GitHub account is enough — the free Hobby plan is fine).
2. Click **Add New → Project**.
3. In **Import Git Repository**, find `qec-simulator` and click **Import**.
   - If it is not listed, click **Adjust GitHub App Permissions** and give Vercel access to the repo first.

### 3. Configure the project (defaults are correct)

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** (auto-detected) |
| Root Directory | `./` (leave as is — `package.json` is in the repo root) |
| Build Command | `next build` (default — leave empty to use the default) |
| Output Directory | `.next` (default) |
| Install Command | `bun install` / `npm install` (default) |
| Node.js Version | 20.x or later (Project → Settings → General) |

**Do not add any Environment Variables** — the app has none.

### 4. Deploy

1. Click **Deploy**.
2. Wait ~1–2 minutes: Vercel installs dependencies, runs `next build` and publishes.
3. You get a live URL like `https://qec-simulator.vercel.app` — open it and run a shot.

### 5. Redeploys are automatic

Every `git push` to `main` triggers a fresh production deployment automatically. Pull requests get their own preview URLs. Nothing to configure.

### 6. If something fails

- **Build error on Vercel but not locally** → check the Node version (use 20.x), and re-run `npm run build` locally first.
- **"Module not found"** → make sure you committed everything (`git status` must be clean) — especially `src/` and `package.json`.
- **Old content after a push** → Vercel redeploys automatically; hard-refresh the page (Ctrl/Cmd+Shift+R).
- **Custom domain** → Project → Settings → Domains → Add, then follow the DNS instructions Vercel shows.

---

## Project structure

```
qec-simulator/
├── all_with_noise_prob.py        # the reference program (Qiskit) — the scope source of truth
├── src/
│   ├── app/                      # Next.js App Router (single-page prototype)
│   ├── components/qec/
│   │   ├── Overview.tsx          # hero + objectives + compact worked example
│   │   ├── SimulatorLab.tsx      # single-shot pipeline + exports
│   │   ├── QuantumLab3D.tsx      # Bloch Sphere walkthrough + Bloch Flight 4D (canvas 3D)
│   │   ├── PerformanceLab.tsx    # Monte Carlo + sweeps + Code Showdown
│   │   ├── Learn.tsx / Galleries.tsx / Guide.tsx
│   │   ├── CircuitDiagram.tsx / BlochSphere.tsx / three-d.ts
│   ├── lib/qec/
│   │   ├── engine.ts             # state-vector simulator (gates, measurement, fidelity)
│   │   ├── codes.ts              # the two QEC codes + syndrome tables + runShot
│   │   ├── noise.ts              # the three channels (bitflip / phaseflip / depolarizing)
│   │   ├── pipeline.ts           # traces, Monte Carlo, sweeps, live rounds
│   │   └── registry.ts           # UI-facing code/noise registry
│   └── lib/report.ts             # PDF/JSON/CSV export helpers
├── scripts/test-qec.mjs          # 55-assertion engine verification suite
└── package.json
```
