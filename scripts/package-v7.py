#!/usr/bin/env python3
"""Package the final v7 deliverable zip:
   - deployable project source (no node_modules / .next / .git / secrets)
   - reference Python program
   - combined Phase 1 + Phase 2 PPTX
   - combined Phase 1 + Phase 2 PDF report
   - canonical screenshots folder
"""
import os
import zipfile

ROOT = '/home/z/my-project'
OUT = os.path.join(ROOT, 'download', 'QEC-Simulator-v7-PythonPipeline-Final.zip')
STAGE = 'QEC-Simulator-v7'

# ---- project files to include (Vercel-deployable set) ----
INCLUDE_FILES = [
    'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts',
    'postcss.config.mjs', 'tailwind.config.ts', 'eslint.config.mjs',
    'components.json', 'README.md', 'all_with_noise_prob.py', '.gitignore',
]
INCLUDE_DIRS = ['src', 'public', 'prisma', 'scripts']
# only keep useful scripts inside the zip's scripts/
SCRIPTS_KEEP = {'test-pyqec.mjs', 'build_ppt_v7.py', 'build_report_pdf.py'}

SCREENSHOTS = [
    'v7-overview.png', 'v7-sim-run.png', 'v7-sim-notmatched.png',
    'v7-sim-notmatched-counts.png', 'v7-circuit-card.png',
    'v7-3d-circuit-canvas.png', 'v7-3d-pipeline.png', 'v7-3d-terrain3.png',
    'v7-perf.png', 'v7-perf-head.png',
]
DOCS = [
    ('download/Quantum_error_correction_Phase1+Phase2_v7.pptx',
     'Quantum_error_correction_Phase1+Phase2_v7.pptx'),
    ('download/QEC-Simulator-Phase1+Phase2-Report.pdf',
     'QEC-Simulator-Phase1+Phase2-Report.pdf'),
]

if os.path.exists(OUT):
    os.remove(OUT)

count = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    # project source
    for f in INCLUDE_FILES:
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            z.write(p, f'{STAGE}/{f}')
            count += 1
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [x for x in dirnames if x not in ('node_modules', '.next', '__pycache__')]
            for fn in filenames:
                if d == 'scripts' and fn not in SCRIPTS_KEEP:
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                z.write(full, f'{STAGE}/{rel}')
                count += 1
    # docs
    for src, arc in DOCS:
        z.write(os.path.join(ROOT, src), f'{STAGE}/{arc}')
        count += 1
    # screenshots
    for s in SCREENSHOTS:
        p = os.path.join(ROOT, 'analysis', s)
        if os.path.exists(p):
            z.write(p, f'{STAGE}/screenshots/{s}')
            count += 1

size = os.path.getsize(OUT) / 1024 / 1024
print(f'zip: {OUT}\nfiles: {count}\nsize: {size:.2f} MB')
