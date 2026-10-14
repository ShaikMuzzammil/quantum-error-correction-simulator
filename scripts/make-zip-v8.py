#!/usr/bin/env python3
"""Package the QEC Simulator v8 (Focused Edition) into a deployable ZIP.
Contents: deployable project source + reference Python program + README
(Vercel guide) + combined PPTX + combined PDF report + canonical screenshots."""
import os, zipfile

ROOT = '/home/z/my-project'
OUT = '/home/z/my-project/download/QEC-Simulator-v8-Focused-Final.zip'

INCLUDE_FILES = [
    'package.json', 'bun.lock', 'tsconfig.json', 'next.config.ts',
    'postcss.config.mjs', 'tailwind.config.ts', 'components.json',
    'eslint.config.mjs', 'README.md',
    'public/logo.svg', 'public/robots.txt',
    'all_with_noise_prob.py',
]

INCLUDE_DIRS = ['src']

# extra deliverables + canonical 2-D screenshots
EXTRAS = [
    ('download/Quantum_error_correction_Phase1+Phase2_v8.pptx', 'docs/Quantum_error_correction_Phase1+Phase2_v8.pptx'),
    ('download/QEC-Simulator-Phase1+Phase2-Report.pdf', 'docs/QEC-Simulator-Phase1+Phase2-Report.pdf'),
    ('analysis/v8-overview.png', 'screenshots/01-overview.png'),
    ('analysis/v8-sim-x-corrected.png', 'screenshots/02-simulator-lab-manual-x.png'),
    ('analysis/v8-sim-python-circuit.png', 'screenshots/03-syndrome-table-bloch.png'),
    ('analysis/v8-perf-mc.png', 'screenshots/04-performance-montecarlo.png'),
    ('analysis/v8-perf-sweep.png', 'screenshots/05-performance-sweep.png'),
    ('analysis/v8-reference-codes.png', 'screenshots/06-reference-codes.png'),
    ('analysis/v8-reference-noise.png', 'screenshots/07-reference-noise.png'),
    ('analysis/v8-3d-flight.png', 'screenshots/08-3d-bloch-flight.png'),
    ('analysis/v8-3d-city.png', 'screenshots/09-3d-cityscape.png'),
    ('analysis/v8-3d-spacetime.png', 'screenshots/10-3d-syndrome-spacetime.png'),
    ('analysis/v8-3d-blochsphere2.png', 'screenshots/11-3d-bloch-sphere.png'),
    ('analysis/v8-report-circuit.png', 'screenshots/12-printable-report-with-circuit.png'),
]

EXCLUDE_PARTS = {'node_modules', '.next', '.git', 'dev.log', 'server.log'}
EXCLUDE_EXT = {'.log', '.zip', '.db'}

def wanted(path: str) -> bool:
    parts = set(path.split(os.sep))
    if parts & EXCLUDE_PARTS:
        return False
    _, ext = os.path.splitext(path)
    if ext in EXCLUDE_EXT:
        return False
    return True

os.makedirs(os.path.dirname(OUT), exist_ok=True)
n = 0
seen = set()
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    def add(full: str, arc: str):
        global n
        if arc in seen or not os.path.isfile(full):
            return
        seen.add(arc)
        z.write(full, arc)
        n += 1

    for f in INCLUDE_FILES:
        add(os.path.join(ROOT, f), f'qec-simulator/{f}')
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        for dirpath, dirnames, filenames in os.walk(base):
            for fn in sorted(filenames):
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                if not wanted(rel):
                    continue
                add(full, f'qec-simulator/{rel}')
    # engine verification suite + docs + screenshots
    add(os.path.join(ROOT, 'scripts/test-qec.mjs'), 'qec-simulator/scripts/test-qec.mjs')
    for src, arc in EXTRAS:
        add(os.path.join(ROOT, src), arc)

size = os.path.getsize(OUT) / (1024 * 1024)
print(f'OK: {OUT} — {n} files, {size:.2f} MB')
