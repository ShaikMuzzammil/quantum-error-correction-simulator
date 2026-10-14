#!/usr/bin/env python3
"""Package v6 deliverables:
1. QEC-Simulator-Prototype-v6.zip      — full deployable source
2. QEC-Simulator-v6-Phase2-Final.zip   — combined: source zip + Phase-2 PPT + screenshots
"""
import os, zipfile

ROOT = '/home/z/my-project'
DL = f'{ROOT}/download'
SRC_ZIP = f'{DL}/QEC-Simulator-Prototype-v6.zip'
FINAL_ZIP = f'{DL}/QEC-Simulator-v6-Phase2-Final.zip'
PPTX = f'{DL}/Quantum_error_correction_Phase2.pptx'
ASSETS = f'{DL}/ppt-assets'

INCLUDE_FILES = [
    'package.json', 'bun.lock', 'tsconfig.json', 'next.config.ts',
    'postcss.config.mjs', 'tailwind.config.ts', 'components.json',
    'eslint.config.mjs', '.gitignore', 'README.md', 'README-qec.md',
    'public/logo.svg', 'public/robots.txt',
    'scripts/test-qec.mjs', 'scripts/parse-check.js',
]
INCLUDE_DIRS = ['src', 'public']
EXCLUDE_PARTS = {'node_modules', '.next', '.git', 'tool-results'}
EXCLUDE_EXT = {'.log', '.png', '.webm', '.zip', '.tsbuildinfo'}

def wanted(path: str) -> bool:
    parts = set(path.split(os.sep))
    if parts & EXCLUDE_PARTS:
        return False
    _, ext = os.path.splitext(path)
    if ext in EXCLUDE_EXT:
        return False
    base = os.path.basename(path)
    if base.startswith('debug-') or base in {'make-zip.py', 'package-v6.py', 'build_ppt_phase2.py'}:
        return False
    return True

# ---------- 1. source zip ----------
n = 0
seen = set()
with zipfile.ZipFile(SRC_ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    def add(full: str, arc: str):
        global n
        if arc in seen or not os.path.isfile(full):
            return
        seen.add(arc)
        z.write(full, arc)
        n += 1
    for rel in INCLUDE_FILES:
        add(os.path.join(ROOT, rel), f'qec-simulator/{rel}')
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [x for x in dirnames if x not in EXCLUDE_PARTS]
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                if wanted(rel):
                    add(full, f'qec-simulator/{rel}')
print(f'{SRC_ZIP}: {n} files, {os.path.getsize(SRC_ZIP)//1024} KB')

# ---------- 2. combined final zip ----------
shots = ['final-bloch-flight3.png', 'final-cityscape2.png', 'final-cityscape32c.png',
         'final-spacetime.png', 'final-terrain2.png', 'final-terrain-live.png',
         'final-simulator-lab.png', 'final-showdown.png', 'final-performance.png']
with zipfile.ZipFile(FINAL_ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(SRC_ZIP, 'QEC-Simulator-v6-Phase2/QEC-Simulator-Prototype-v6.zip')
    z.write(PPTX, 'QEC-Simulator-v6-Phase2/Quantum_error_correction_Phase2.pptx')
    z.write(f'{ROOT}/README.md', 'QEC-Simulator-v6-Phase2/README-deploy-guide.md')
    for shot in shots:
        full = os.path.join(ASSETS, shot)
        if os.path.isfile(full):
            z.write(full, f'QEC-Simulator-v6-Phase2/simulation-screenshots/{shot}')
print(f'{FINAL_ZIP}: {os.path.getsize(FINAL_ZIP)//1024} KB')
