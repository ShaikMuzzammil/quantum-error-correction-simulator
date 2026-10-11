# QEC Simulator — Interactive Quantum Error Correction Simulator

**Phase 2 Prototype · v4.0 — “Compact & Understandable Edition”**

A fully interactive, **100% client-side** Quantum Error Correction simulator web application.
It implements every objective of the Phase-1 proposal — multi-model noise simulation, before/after
performance comparison, and configurable QEC experimentation — and extends it with **3D/4D
visualizers**, large-scale Monte Carlo runs (up to 100,000 shots), **one-click exportable reports**
(printable PDF, JSON, CSV), and a complete **understanding layer**: every input is explained in
plain language (always on — no mode switch), every result is decomposed into *Results / How it was
computed / What it means* tabs, and a compact **Learn tab** teaches the physics from zero.

New in v4: **every simulation is a one-shot run** — you press Run, it plays a fixed number of rounds,
and it stops when complete. No endless loops, no hidden background animations; the render loop itself
halts when idle.

| | |
|---|---|
| **Team** | K. Devendra Reddy (CH.SC.U4CSE24021) · Shaik Muzzammil (CH.SC.U4CSE24041) · D. Guna Samhith (CH.SC.U4CSE24016) |
| **Institution** | Dept. of CSE · Sri Chandrasekharendra Saraswathi Viswa Mahavidyalaya |
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · Recharts · custom Canvas-3D engine |
| **Backend required** | **None** — the entire quantum engine runs in the browser at ~10⁴–10⁵ shots/s |

---

## 🆕 What's new in v4 (the Compact & Understandable Edition)

- **One-shot simulations everywhere**: all three 3D/4D visualizers run a bounded experiment —
  you choose the number of rounds, press Run, the simulation plays through at a readable pace and
  stops with a **“complete — simulation stopped”** status. Re-run any time for fresh random noise.
  When idle, the animation loop fully halts (zero CPU while you inspect results).
- **Guide Mode toggle removed** (per feedback): all one-line hints and **? explainers** are now
  simply always on — one less thing to configure. Nothing was deleted, just simplified.
- **Compact navigation**: 9 tabs → **7 tabs**. QEC Codes, Noise Models and Literature now live
  together in a single **Reference** tab with internal chips.
- **Smaller “How to use”**: the Learn page was rebuilt as a compact guide — a small 4-step how-to
  box, six short core ideas, the 4-step QEC loop, a trimmed 16-term glossary and a 5-question FAQ.
  The “How to use this lab” cards inside every lab now start **collapsed**.
- **Calmer UI**: the always-animating particle background canvas was replaced with a static ambient
  glow — less visual noise, better focus on the simulations, lower CPU. Added polished scrollbars,
  selection color and focus rings.
- The Overview worked-example tour now plays through once and stops at the last step.

<details>
<summary><b>What was new in v3</b> (click to expand)</summary>

- Guide system: ? explainers on every input, Results / How-computed / What-it-means tabs on every
  result, “How to read this” panels on the 3D/4D visualizers.
- Learn tab crash course, glossary and FAQ; parameter correctness fixes (coherent rotation angle
  slider, real T₁/T₂ sliders for thermal relaxation).

</details>

---

## ✨ Features

### Simulators (all live, all real physics)

| Lab | What it does |
|---|---|
| **Overview** | Phase-1 objectives → feature mapping, plus an interactive worked example (3-qubit bit-flip code, exactly the PPT architecture scenario) executed by the real engine. |
| **Simulator Lab** | Single-shot pipeline runs: encode → noise → syndrome → correction → decode → measure. Choose any of 9 code configurations × 8 noise models, pick the input state \|ψ⟩ (presets or custom θ/φ), set the RNG seed, or toggle **manual error injection** (I → X → Z → Y per qubit / click lattice cells). Full circuit diagram, syndrome table, state inspector and Bloch comparison — every input guided, every result explained in three tabs. |
| **3D Quantum Lab** | Three visualizers with orbit/zoom cameras, **all one-shot runs**: **Bloch Flight 4D** (logical qubit trajectory with a time-colored trail — 3 space dims + time; you set the round count, it plays and stops), **State Cityscape 3D** (amplitude/phase landscape of an encoded block across N rounds), **Spacetime Lattice 4D** (surface code: d×d space × syndrome rounds of time, cumulative errors, defect world-lines, MWPM matching chains drawn in spacetime). |
| **Performance Lab** | Monte Carlo before/after statistics and noise sweeps. Surface codes reproduce the famous **threshold chart** (logical error rate vs p for d = 3/5/7). Up to 25,000 shots (state-vector) / 100,000 shots (surface) per run — with interpretation tabs that explain the improvement factor and the threshold in plain language. |
| **Learn** | The compact understanding layer: small 4-step how-to box, six core ideas, the QEC loop, 16-term glossary, honest FAQ — everything cross-linked to the labs. |
| **Reference** | QEC code explorer (circuits, stabilizers, logical operators), the 8-channel noise library, and the 10-paper Phase-1 literature review — one tab, three chips. |
| **About** | Engine notes, technology stack, v4 changelog and the project team. |

### Codes

`[[3,1,3]]` bit-flip · `[[3,1,3]]` phase-flip · 5-qubit repetition · **Shor `[[9,1,3]]`** · **Steane `[[7,1,3]]`** · perfect **`[[5,1,3]]`** · rotated **surface codes d = 3/5/7** (exact MWPM decoder).

### Noise models

Bit-flip (X) · Phase-flip (Z) · Depolarizing · Amplitude damping · Phase damping · Thermal relaxation (T₁/T₂) · Coherent over-rotation · Crosstalk (correlated XX). Non-Pauli channels use exact quantum-trajectory sampling.

### Exportable reports (everywhere)

Every lab can export:

- **Report (PDF)** — a formal, print-ready document with *Inputs*, *Outputs*, result cards, data tables
  and a methodology section. Opens in a new tab and raises the print dialog — choose **Save as PDF**.
- **JSON** — the full machine-readable inputs + outputs (for reproducibility / further analysis).
- **CSV** — per-point data (sweeps, trajectories, amplitudes) for Excel / Python / MATLAB.

---

## 🚀 Run Locally

### Prerequisites

- **Node.js 18.18+** (20 LTS recommended) and npm — *or* — **Bun 1.0+**
- Any modern browser (Chrome / Edge / Firefox / Safari). No backend, no database, no API keys.

### Steps

```bash
# 1 — install dependencies
npm install          # or: bun install

# 2 — start the dev server
npm run dev          # or: bun run dev

# 3 — open the app
# http://localhost:3000
```

### Other scripts

| Command | What it does |
|---|---|
| `npm run build` | Production build (`next build`) |
| `npm start` | Serve the production build (`next start`) |
| `npm run lint` | ESLint over the project |
| `npm run test` | Runs the **125-test engine verification suite** (`bun scripts/test-qec.mjs`) |

> The engine test suite validates the simulator against known theory: the 3-qubit code fidelity equals
> `1 − P(≥2 errors)`, the surface-code logical rate matches the exact `18p²` small-p expansion for d=3,
> and the d = 3/5/7 threshold ordering flips near ~10% noise.

---

## 🗂 Project Structure

```
qec-simulator/
├── src/
│   ├── app/
│   │   ├── page.tsx              # shell: header, 7 tabs (incl. Reference), static backdrop, footer (team names)
│   │   ├── layout.tsx            # metadata + dark theme
│   │   └── globals.css
│   ├── components/qec/
│   │   ├── Guide.tsx             # always-on guide system: ?-explainers, GuideField, HowToCard, ResultTabs
│   │   ├── Learn.tsx             # compact how-to box + six ideas + glossary + FAQ
│   │   ├── Overview.tsx          # hero, objectives mapping, worked example (one-shot tour)
│   │   ├── SimulatorLab.tsx      # single-shot pipeline + guided controls + explanation tabs
│   │   ├── QuantumLab3D.tsx      # 3D lab shell + Bloch Flight 4D (one-shot run-then-stop)
│   │   ├── Lab3DVisuals.tsx      # State Cityscape 3D + Spacetime Lattice 4D (one-shot runs)
│   │   ├── three-d.ts            # reusable Canvas-3D engine (orbit camera, demand-driven rendering)
│   │   ├── PerformanceLab.tsx    # Monte Carlo + sweeps + explanation tabs
│   │   ├── Galleries.tsx         # codes / noise / literature / about (v4 feature map)
│   │   ├── CircuitDiagram.tsx    # SVG circuit renderer
│   │   ├── SurfaceGrid.tsx       # lattice renderer (click-to-inject)
│   │   └── BlochSphere.tsx       # SVG Bloch sphere
│   ├── lib/
│   │   ├── report.ts             # PDF/JSON/CSV report generation
│   │   └── qec/
│   │       ├── engine.ts         # state-vector simulator (complex amplitudes, measurements)
│   │       ├── noise.ts          # 8 noise channels (trajectory sampling) + param builder
│   │       ├── codes.ts          # 6 state-vector QEC codes + auto correction tables
│   │       ├── surface.ts        # rotated surface code + exact MWPM decoder
│   │       ├── pipeline.ts       # single-shot traces, Monte Carlo, sweeps, live rounds
│   │       └── registry.ts       # UI-facing registry
│   └── components/ui/            # shadcn/ui primitives
├── scripts/test-qec.mjs          # 125-test verification suite
├── next.config.ts
├── package.json
└── README.md
```

---

## 🐙 Push to GitHub (step by step)

The project ships with a proper `.gitignore` (node_modules, `.next`, logs, env files are excluded).

```bash
# 1 — initialise the repository (first time only)
git init
git add .
git commit -m "QEC Simulator v4.0 — Compact & Understandable Edition"

# 2 — create an EMPTY repo on https://github.com/new
#     (do NOT add a README/license there — we already have one)
#     e.g. https://github.com/<your-username>/qec-simulator

# 3 — connect and push
git branch -M main
git remote add origin https://github.com/<your-username>/qec-simulator.git
git push -u origin main
```

Later updates are just:

```bash
git add .
git commit -m "describe your change"
git push
```

> Tip: if you prefer SSH, use `git@github.com:<your-username>/qec-simulator.git` as the remote and make
> sure your SSH key is added to GitHub (Settings → SSH and GPG keys).

---

## ▲ Deploy to Vercel (step by step)

The app is a standard **Next.js (App Router)** project — Vercel auto-detects everything. There are
**no environment variables, no database and no serverless functions to configure**.

### Method A — Vercel Dashboard (recommended, after the GitHub push above)

1. Go to **https://vercel.com** and sign in (continue with GitHub is easiest).
2. Click **Add New… → Project**.
3. Find the `qec-simulator` repository you just pushed and click **Import**.
   (If it is not listed, click *Adjust GitHub App Permissions* and grant access to the repo.)
4. The **Configure Project** screen — leave everything at the defaults:

   | Setting | Value to use |
   |---|---|
   | Framework Preset | **Next.js** (auto-detected) |
   | Root Directory | `./` (leave empty / default) |
   | Build Command | *empty* — Vercel will use `next build` |
   | Output Directory | *empty* — Vercel will use `.next` |
   | Install Command | *empty* — Vercel will use `npm install` (or bun/pnpm as detected) |
   | Node.js Version | 20.x (default) — anything ≥ 18.18 works |

5. **Environment Variables:** leave the section **completely empty**. The app needs **none** —
   all quantum simulation runs client-side in the visitor's browser, and there are no API keys,
   no database and no third-party services.
6. Click **Deploy**. The first build takes ~1–2 minutes.
7. Done — your simulator is live at `https://<project-name>.vercel.app`.
   Every future `git push` to `main` automatically redeploys; pull requests get preview URLs.

### Method B — Vercel CLI (no dashboard needed)

```bash
# 1 — install the CLI
npm i -g vercel

# 2 — from the project root
vercel login          # opens the browser to authenticate
vercel                # links + deploys a preview (answer the prompts with defaults)
vercel --prod         # promotes to production
```

### Custom domain (optional)

Vercel Dashboard → your project → **Settings → Domains → Add** — then follow the DNS instructions
(A/CNAME records at your registrar). HTTPS certificates are automatic.

### Deploy troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with a TypeScript error | The repo already sets `typescript.ignoreBuildErrors` in `next.config.ts`; make sure you pulled the latest version. Type errors never block this build. |
| “No framework detected” | Set Framework Preset to **Next.js** manually in the project settings. |
| Blank page after deploy | Hard-refresh (Ctrl/Cmd+Shift+R). The app is fully static client-side — there is no server state. |
| Want a standalone Node deploy instead of Vercel | `npm run build && npm start` serves on port 3000 from any Node 18.18+ host (Render, Railway, VPS, Docker). |

---

## 🔐 Environment Variables

**None. Zero.** The simulator is deliberately 100% client-side:

- the quantum engine, decoders and Monte Carlo statistics are pure TypeScript running in the browser;
- there is no database, no authentication, no external API and therefore no secrets;
- works identically on `localhost`, GitHub Pages-style static hosts with a Node server, and Vercel.

If you later add analytics or a backend, put their keys in Vercel → Settings → Environment Variables
and reference them with `process.env.NEXT_PUBLIC_*` for browser-side usage.

---

## 🧠 Engine Notes

- **State-vector backend** — full complex-amplitude simulation up to 9 data qubits (2⁹ = 512 amplitudes),
  unitary circuits, projective Pauli measurements with optional readout error, partial trace, Bloch readout.
- **Quantum trajectories** — non-Pauli channels (amplitude damping, thermal relaxation, coherent rotation,
  crosstalk) are sampled per-shot, which is statistically exact for the reported observables.
- **Pauli-frame backend** — surface codes run as cumulative multi-round Pauli frames with an
  **exact minimum-weight perfect-matching decoder** (subset DP over defect pairings with an
  unlimited-capacity boundary node, BFS shortest-path recovery).
- **Correction tables** — auto-generated per code from single-error syndromes with an
  invisible-error guard and nearest-syndrome fallback.
- **Reproducibility** — every random process is driven by a seeded PRNG (mulberry32), and the seed is
  part of every exported report.

## 🖥 Browser Support

Chrome / Edge / Firefox / Safari — current versions. The 3D lab uses Canvas 2D with a custom
perspective engine (no WebGL requirement), pointer events for orbit, and `devicePixelRatio`-aware
rendering for sharp visuals on any display.

## 📄 License & Credits

Built as the Phase-2 prototype of the academic project *“An Interactive Quantum Error Correction
Simulator”*. Simulation engine, visualizations and reports were built from first principles for this
project — no external quantum computing library is used.

**K. Devendra Reddy · Shaik Muzzammil · D. Guna Samhith**
Dept. of CSE · Sri Chandrasekharendra Saraswathi Viswa Mahavidyalaya
