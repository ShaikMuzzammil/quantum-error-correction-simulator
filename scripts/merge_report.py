#!/usr/bin/env python3
"""Merge cover + body into the final report PDF, normalized to A4."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
cover = PdfReader('/home/z/my-project/analysis/report-cover.pdf').pages[0]
writer.add_page(normalize(cover))
for pg in PdfReader('/home/z/my-project/analysis/report-body.pdf').pages:
    writer.add_page(normalize(pg))
writer.add_metadata({
    '/Title': 'Interactive Quantum Error Correction Simulator - Phase 1 + Phase 2 Project Report',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'QEC simulator project report - AMRITA VISHWA VIDYAPEETHAM',
})
out = '/home/z/my-project/download/QEC-Simulator-Phase1+Phase2-Report.pdf'
with open(out, 'wb') as f:
    writer.write(f)
print('final pdf:', out, '| pages:', 1 + len(PdfReader('/home/z/my-project/analysis/report-body.pdf').pages))
