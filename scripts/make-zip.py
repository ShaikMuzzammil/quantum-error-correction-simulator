#!/usr/bin/env python3
"""Package the QEC Simulator project into a deployable ZIP (no build artifacts)."""
import os, zipfile, time

ROOT = '/home/z/my-project'
OUT = '/home/z/my-project/download/QEC-Simulator-Prototype-v4.zip'

INCLUDE_FILES = [
    'package.json', 'bun.lock', 'tsconfig.json', 'next.config.ts',
    'postcss.config.mjs', 'tailwind.config.ts', 'components.json',
    'eslint.config.mjs', '.gitignore', 'README.md',
    'public/logo.svg', 'public/robots.txt',
    'scripts/test-qec.mjs',
]

INCLUDE_DIRS = ['src', 'public', 'scripts']

EXCLUDE_PARTS = {'node_modules', '.next', '.git', 'dev.log', 'server.log'}
EXCLUDE_EXT = {'.log', '.png', '.webm', '.zip'}
# png excluded globally, but keep nothing binary in scripts; test-qec.mjs is included explicitly above

def wanted(path: str) -> bool:
    parts = set(path.split(os.sep))
    if parts & EXCLUDE_PARTS:
        return False
    _, ext = os.path.splitext(path)
    if ext in EXCLUDE_EXT:
        return False
    if path.startswith('debug-') or path.startswith('shot-') or path == 'make-zip.py':
        return False
    return True

os.makedirs(os.path.dirname(OUT), exist_ok=True)
n = 0
seen = set()
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    def add(full: str, arc: str):
        global n
        if arc in seen:
            return
        seen.add(arc)
        z.write(full, arc)
        n += 1

    for f in INCLUDE_FILES:
        p = os.path.join(ROOT, f)
        if os.path.isfile(p):
            add(p, f'qec-simulator/{f}')
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        for dirpath, dirnames, filenames in os.walk(base):
            for fn in sorted(filenames):
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                if not wanted(rel):
                    continue
                add(full, f'qec-simulator/{rel}')

size = os.path.getsize(OUT) / 1024
print(f'OK: {OUT} — {n} files, {size:.1f} KB')
