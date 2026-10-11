# QEC Simulator — Interactive Quantum Error Correction Simulator

**Phase 2 Prototype · v6.0 — “Aurora × 4D Lab Edition”**

A fully interactive, **100% client-side** Quantum Error Correction simulator web application.
It implements every objective of the Phase-1 proposal — multi-model noise simulation, before/after
performance comparison, and configurable QEC experimentation — and extends it with **3D/4D
visualizers**, large-scale Monte Carlo runs (up to 100,000 shots), **one-click exportable reports**
(printable PDF, JSON, CSV), and a complete **understanding layer**: every input is explained in
plain language (always on — no mode switch), every result is decomposed into *Results / How it was
computed / What it means* tabs, and a compact **Learn tab** teaches the physics from zero.

New in v6: the **3D Quantum Lab is rebuilt and now has FOUR live simulators**. Bloch Flight 4D
gains a glowing target pin, a richer live-fidelity chart and gentle idle-orbit; State Cityscape 3D
is now a real 3-D **city** — one shaded tower per basis state on a proper street grid, up to **32
live towers** with 5-qubit codes; Spacetime Lattice 4D gets a connected time axis, translucent floor
panels and support for **d = 9 and 16 rounds**; and the all-new **Threshold Terrain 4D** runs
**2,500+ complete surface-code experiments live in your browser** and grows a 3-D terrain of
measured logical error rates — the famous surface-code threshold, measured in front of you.
Every simulation is still a one-shot run that plays through and stops — nothing loops in the background.

| | |
|---|---|
| **Team** | K. Devendra Reddy (CH.SC.U4CSE24021) · Shaik Muzzammil (CH.SC.U4CSE24041) · D. Guna Samhith (CH.SC.U4CSE24016) |
| **Institution** | Dept. of CSE · Sri Chandrasekharendra Saraswathi Viswa Mahavidyalaya |
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · Recharts · custom Canvas-3D engine |
| **Backend required** | **None** — the entire quantum engine runs in the browser at ~10⁴–10⁵ shots/s |

---

## 🆕 What's new in v6 (the 4D Lab rebuild)

- **Bloch Flight 4D v6** — glowing **target pin** showing exactly where QEC tries to hold the state,
  a larger live-fidelity chart with a 50% fail-line and axis labels, an on-canvas round counter,
  brighter sphere and trails, and a gentle idle orbit so the scene is never a dead still image.
- **State Cityscape 3D v6** — rebuilt as a true city: towers sit on a proper street grid (not a
  single line), each tower is a **per-face shaded 3-D box** with a glowing cap, height now means
  **probability** (with % labels), codespace towers wear cyan rings, and the lab supports 8-tower
  3-qubit codes **and 32-tower 5-qubit codes** (repetition-5 and the perfect [[5,1,3]]).
- **Spacetime Lattice 4D v6** — the time axis is now **connected to the lattice** (a proper arrow
  with t = 0…T ticks), every round is a translucent floor panel, errors glow, defects are 8-point
  stars, error worldlines thread through the stack, and scale grew to **d = 9** (81 data qubits) ×
  **16 rounds**.
- **Threshold Terrain 4D (new simulator)** — large-scale Monte Carlo: for every (noise p, distance
  d) pair it runs a full grid of complete surface-code experiments (default 21 cells × 120 shots =
  **2,520 experiments**, adjustable up to 6,300) with a 12 ms-per-frame time slicer so the UI stays
  smooth, and renders the resulting logical-error-rate terrain live in 3-D. A verdict line reports
  the measured **threshold estimate**. Report + JSON exports include the full rate table.
- **Plain-language pass** — every 3D-lab explanation, reading hint and “Try this” rewritten in
  short, simple sentences; nothing about the physics was simplified away.
- Engine untouched: **125/125 verification tests still pass**; all physics guarantees preserved.

<details>
<summary><b>What was new in v5</b> (click to expand)</summary>

- **Aurora-glass UI, top to bottom**: layered aurora backdrop, frosted-glass cards, gradient hero
  typography, shimmer primary buttons, animated tab bar across all seven tabs.
- **Live pipeline playback (Simulator Lab)**: after every Run Shot a pipeline rail plays the six
  stages — Encode, Noise, Syndrome, Correct, Decode, Measure — one at a time, then rests at
  “complete”. A Replay button re-runs the animation any time. It always stops.
- **Streaming Monte Carlo (Performance Lab)**: estimates converge LIVE while the simulation runs.
- **Code Showdown (Performance Lab)**: one click races **all 9 codes** under identical noise and
  ranks them by improvement factor with a live-growing chart and full statistics table.

</details>

<details>
<summary><b>What was new in v4</b> (click to expand)</summary>

- One-shot simulations everywhere: the three 3D/4D visualizers run a bounded experiment, then halt
  with “complete — simulation stopped”; the render loop fully halts when idle (zero idle CPU).
- Guide Mode toggle removed — all input hints and ? explainers are always on.
- Compact navigation: 9 tabs → 7 (Codes + Noise + Literature unified in one Reference tab).
- Rebuilt compact Learn page; how-to cards start collapsed; static ambient background.

</details>

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
| **3D Quantum Lab** | **Four** visualizers with orbit/zoom cameras, **all one-shot runs**: **Bloch Flight 4D** (logical qubit trajectory with a time-colored trail, target pin and live-fidelity chart), **State Cityscape 3D** (a live 3-D city of amplitudes — 8 to 32 shaded towers on a street grid), **Spacetime Lattice 4D** (surface code: d×d space × up to 16 syndrome rounds of time, defect stars, MWPM matching chains in spacetime, d up to 9), and **Threshold Terrain 4D** (2,500+ live Monte Carlo experiments building the surface-code threshold map in 3-D). |
| **Performance Lab** | Monte Carlo before/after statistics and noise sweeps. Surface codes reproduce the famous **threshold chart** (logical error rate vs p for d = 3/5/7). Up to 25,000 shots (state-vector) / 100,000 shots (surface) per run — with interpretation tabs that explain the improvement factor and the threshold in plain language. |
| **Learn** | The compact understanding layer: small 4-step how-to box, six core ideas, the QEC loop, 16-term glossary, honest FAQ — everything cross-linked to the labs. |
| **Reference** | QEC code explorer (circuits, stabilizers, logical operators), the 8-channel noise library, and the 10-paper Phase-1 literature review — one tab, three chips. |
| **About** | Engine notes, technology stack, v5 changelog and the project team. |

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
│   │   ├── Galleries.tsx         # codes / noise / literature / about (v5 feature map)
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

The project ships with a proper `.gitignore` (node_modules, `.next`, logs, env files are excluded),
so the repository stays small and clean.

### One-time setup (first push only)

1. **Install Git** if you don't have it: https://git-scm.com/downloads (default options are fine).
2. **Tell Git who you are** (once per computer):

   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

3. **Create an EMPTY repository on GitHub**:
   - Go to **https://github.com/new** (sign in first).
   - Repository name: `qec-simulator` (or anything you like).
   - Keep it **Public** (Private also works with Vercel).
   - **Do NOT** tick “Add a README”, “Add .gitignore” or “Choose a license” — we already ship them,
     and ticking them causes a merge conflict on the first push.
   - Click **Create repository** and copy the URL shown, e.g.
     `https://github.com/<your-username>/qec-simulator.git`.

4. **Open a terminal in the project folder** (the one containing this README, `package.json`, `src/`…)
   and run:

   ```bash
   # 1 — initialise the repository
   git init

   # 2 — stage and commit everything
   git add .
   git commit -m "QEC Simulator v6.0 — 4D Lab Edition"

   # 3 — rename the branch to main (GitHub's default)
   git branch -M main

   # 4 — connect your local folder to the GitHub repo
   git remote add origin https://github.com/<your-username>/qec-simulator.git

   # 5 — push
   git push -u origin main
   ```

5. When asked for a password: GitHub no longer accepts account passwords — paste a
   **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens →
   *Generate new token (classic)* → tick the `repo` scope), or set up the **GitHub CLI**
   (`gh auth login`) / **SSH keys** once and never think about it again.

6. Refresh your GitHub page — all the code is there. ✅

### Every later update is just three commands

```bash
git add .
git commit -m "describe your change"
git push
```

> Tip: if you prefer SSH, use `git@github.com:<your-username>/qec-simulator.git` as the remote and
> make sure your SSH key is added to GitHub (Settings → SSH and GPG keys).
>
> No-terminal alternative: on the GitHub repo page choose **Add file → Upload files** and drag the
> project files in — fine for a one-off, but Git is the proper workflow.

---

## ▲ Deploy to Vercel (step by step — GitHub → live site)

The app is a standard **Next.js (App Router)** project — Vercel auto-detects everything. There are
**no environment variables, no database and no serverless functions to configure**. The whole flow
takes about 5 minutes.

### Method A — Vercel Dashboard (recommended, right after the GitHub push above)

1. **Sign in at https://vercel.com** — click **Continue with GitHub** (easiest; it also installs the
   Vercel GitHub app used in step 3).
2. On the dashboard click **Add New… → Project**.
3. Find the `qec-simulator` repository you just pushed and click **Import**.
   - Not listed? Click **Adjust GitHub App Permissions** → *Select repositories* → add
     `qec-simulator` → Save, then refresh the page.
4. On the **Configure Project** screen, leave everything at the defaults:

   | Setting | Value to use |
   |---|---|
   | Framework Preset | **Next.js** (auto-detected) |
   | Root Directory | `./` (leave as default) |
   | Build Command | *leave empty* — Vercel runs `next build` |
   | Output Directory | *leave empty* — Vercel uses `.next` |
   | Install Command | *leave empty* — Vercel runs `npm install` (or detects bun/pnpm) |
   | Node.js Version | 20.x (default) — anything ≥ 18.18 works |

5. **Environment Variables:** leave the section **completely empty**. The app needs **none** —
   all quantum simulation runs client-side in the visitor's browser; there are no API keys, no
   database and no third-party services.
6. Click **Deploy**. The first build takes ~1–2 minutes — you'll see the build log live.
7. 🎉 Done — your simulator is live at `https://<project-name>.vercel.app`
   (the URL is shown on the completion screen).
8. **Automatic redeployments from now on:** every `git push` to `main` rebuilds and updates the live
   site automatically; every pull request gets its own preview URL. You never touch Vercel again.

### Method B — Vercel CLI (no dashboard clicking)

```bash
# 1 — install the CLI (once)
npm i -g vercel

# 2 — from the project root
vercel login          # opens the browser to authenticate
vercel                # links + deploys a preview (accept the default prompts)
vercel --prod         # promotes that build to production
```

### Verify the deployment worked

- Open the `*.vercel.app` URL → the QEC Simulator header loads → open the **3D Quantum Lab** →
  press **Run flight** on Bloch Flight 4D → the trail animates and stops with
  “complete — simulation stopped”. Open **Threshold Terrain** → **Run experiment** → the terrain
  grows bar by bar and ends with a threshold verdict.
- Vercel Dashboard → your project → **Deployments** shows every build with status
  (“Ready” = success) and the commit message that triggered it.

### Custom domain (optional)

Vercel Dashboard → your project → **Settings → Domains → Add** — then follow the DNS instructions
(A/CNAME records at your registrar). HTTPS certificates are automatic.

### Deploy troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with a TypeScript error | The repo already sets `typescript.ignoreBuildErrors` in `next.config.ts`; make sure you pulled the latest version. Type errors never block this build. |
| “No framework detected” | Set Framework Preset to **Next.js** manually in the project settings. |
| “Command failed: npm install” | Delete `package-lock.json` / `bun.lock` from the repo, commit, push again — or set Install Command to `npm install --legacy-peer-deps`. |
| Blank page after deploy | Hard-refresh (Ctrl/Cmd+Shift+R). The app is fully static client-side — there is no server state. |
| 404 from GitHub App | Re-grant repo access: Vercel Dashboard → Settings → Git Integration. |
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
"# quantum-error-correction-simulator" 
