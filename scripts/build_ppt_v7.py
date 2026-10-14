#!/usr/bin/env python3
"""Build the COMBINED deck: Phase 1 (existing 7 slides, college added) +
Phase 2 (slides 8-13): interface overview, Methodology + flow, Architecture,
Results (noise-model simulations + outputs), Comparative Analysis, References.
Design matches Phase 1: white bg, Georgia bold #1B2A49 titles, Calibri body.
Output: download/Quantum_error_correction_Phase1+Phase2_v7.pptx"""
import copy
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

SRC = '/home/z/my-project/upload/Quantum_error_correction_plain.pptx'
OUT = '/home/z/my-project/download/Quantum_error_correction_Phase1+Phase2_v7.pptx'
A = '/home/z/my-project/analysis'

NAVY = RGBColor(0x1B, 0x2A, 0x49)
BODY = RGBColor(0x22, 0x22, 0x22)
GRAY = RGBColor(0x6B, 0x72, 0x80)
MID = RGBColor(0x37, 0x41, 0x51)
LIGHT = RGBColor(0xF3, 0xF4, 0xF6)
BORDER = RGBColor(0xD1, 0xD5, 0xDB)
VIOLET = RGBColor(0x6D, 0x28, 0xD9)
VIOLET_BG = RGBColor(0xEE, 0xF2, 0xFF)
VIOLET_BD = RGBColor(0xC7, 0xD2, 0xFE)
CYAN = RGBColor(0x0E, 0x74, 0x90)
CYAN_BG = RGBColor(0xEC, 0xFE, 0xFF)
CYAN_BD = RGBColor(0xA5, 0xF3, 0xFC)
GREEN = RGBColor(0x04, 0x78, 0x57)
GREEN_BG = RGBColor(0xEC, 0xFD, 0xF5)
GREEN_BD = RGBColor(0xA7, 0xF3, 0xD0)
AMBER_BG = RGBColor(0xFF, 0xFB, 0xEB)
AMBER_BD = RGBColor(0xFD, 0xE6, 0x8A)
AMBER = RGBColor(0x92, 0x40, 0x0E)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
RED = RGBColor(0xB9, 0x1C, 0x1C)
G = 'Georgia'
C = 'Calibri'
COLLEGE = 'AMRITA VISHWA VIDYAPEETHAM'

prs = Presentation(SRC)
layout = next((ly for ly in prs.slide_layouts if ly.name == 'DEFAULT'), prs.slide_layouts[0])

# ---------------- update slide 1: add the college under the presenters -------
for sh in prs.slides[0].shapes:
    if sh.has_text_frame and 'Presented by' in sh.text_frame.text:
        tf = sh.text_frame
        p = tf.add_paragraph()
        p.space_before = Pt(6)
        r = p.add_run()
        r.text = COLLEGE
        r.font.name = C
        r.font.size = Pt(14)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0xA5, 0xB4, 0xFC)

# ---------------- helpers (same design language as Phase 1) -------------------
def no_shadow(sh):
    try:
        sh.shadow.inherit = False
    except Exception:
        pass

def box(slide, l, t, w, h, fill=None, line=None, line_w=0.75, round_=False, radius=0.06):
    shp = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE,
        Inches(l), Inches(t), Inches(w), Inches(h))
    if round_:
        try:
            shp.adjustments[0] = radius
        except Exception:
            pass
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(line_w)
    no_shadow(shp)
    shp.text_frame.word_wrap = True
    return shp

def txt(slide, l, t, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
        space_after=2, line_spacing=1.0):
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        if line_spacing:
            p.line_spacing = line_spacing
        for (text, fname, size, bold, color) in para:
            r = p.add_run()
            r.text = text
            r.font.name = fname
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = color
    return tb

def title_bar(slide, title, page_no):
    txt(slide, 0.70, 0.40, 11.90, 0.80, [[(title, G, 30, True, NAVY)]])
    txt(slide, 0.70, 7.00, 9.50, 0.30,
        [[('Interactive Quantum Error Correction Simulator · ' + COLLEGE, C, 10, False, GRAY)]])
    txt(slide, 12.00, 7.00, 0.60, 0.30, [[(str(page_no), C, 10, False, GRAY)]],
        align=PP_ALIGN.RIGHT)

def chip(slide, l, t, w, h, text, bg, bd, fg, size=10.5, bold=False):
    c = box(slide, l, t, w, h, fill=bg, line=bd, line_w=1.0, round_=True, radius=0.5)
    tf = c.text_frame
    tf.margin_left = Inches(0.05)
    tf.margin_right = Inches(0.05)
    tf.margin_top = Inches(0.01)
    tf.margin_bottom = Inches(0.01)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = text
    r.font.name = C
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = fg
    return c

def arrow_right(slide, l, t, w=0.32, h=0.3, color=VIOLET):
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(l), Inches(t), Inches(w), Inches(h))
    a.fill.solid()
    a.fill.fore_color.rgb = color
    a.line.fill.background()
    no_shadow(a)
    return a

def picture(slide, path, l, t, w, frame=True, h=None):
    pic = slide.shapes.add_picture(path, Inches(l), Inches(t), width=Inches(w))
    pic_h = h if h else pic.height / 914400
    if frame:
        f = box(slide, l - 0.045, t - 0.045, w + 0.09, pic_h + 0.09, fill=RGBColor(0x11, 0x10, 0x1F), line=BORDER, line_w=1.0, round_=True, radius=0.03)
        # send frame behind the picture
        slide.shapes._spTree.remove(f._element)
        slide.shapes._spTree.insert(list(slide.shapes._spTree).index(pic._element), f._element)
    return pic

def crop(src, out, box_):
    img = Image.open(src)
    img.crop(box_).save(out, quality=92)
    return out

def card(slide, l, t, w, h, title, body, bg, bd, fg, tsize=12, bsize=9.5):
    c = box(slide, l, t, w, h, fill=bg, line=bd, line_w=1.0, round_=True, radius=0.055)
    tf = c.text_frame
    tf.margin_left = tf.margin_right = Inches(0.12)
    tf.margin_top = Inches(0.09)
    tf.margin_bottom = Inches(0.06)
    p1 = tf.paragraphs[0]
    r = p1.add_run(); r.text = title
    r.font.name = C; r.font.size = Pt(tsize); r.font.bold = True; r.font.color.rgb = NAVY
    p2 = tf.add_paragraph(); p2.space_before = Pt(3); p2.line_spacing = 1.02
    r2 = p2.add_run(); r2.text = body
    r2.font.name = C; r2.font.size = Pt(bsize); r2.font.color.rgb = MID
    return c

def flow_box(slide, l, t, w, h, head, sub, bg, bd, fg):
    b = box(slide, l, t, w, h, fill=bg, line=bd, line_w=1.2, round_=True, radius=0.08)
    tf = b.text_frame
    tf.margin_left = tf.margin_right = Inches(0.07)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = True
    p1 = tf.paragraphs[0]; p1.alignment = PP_ALIGN.CENTER
    r = p1.add_run(); r.text = head
    r.font.name = C; r.font.size = Pt(11.5); r.font.bold = True; r.font.color.rgb = NAVY
    p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER; p2.space_before = Pt(2); p2.line_spacing = 0.95
    r2 = p2.add_run(); r2.text = sub
    r2.font.name = C; r2.font.size = Pt(8.5); r2.font.color.rgb = fg
    return b

# ---------------- prepare screenshot crops ------------------------------------
fig_perf_matched = crop(f'{A}/v7-sim-run.png', f'{A}/crop-perf-matched.png', (96, 560, 1345, 830))
fig_counts = crop(f'{A}/v7-sim-notmatched-counts.png', f'{A}/crop-counts.png', (96, 100, 1345, 900))
fig_terrain = crop(f'{A}/v7-3d-terrain3.png', f'{A}/crop-terrain.png', (120, 280, 1320, 770))
fig_circuit = crop(f'{A}/v7-circuit-card.png', f'{A}/crop-circuit.png', (96, 100, 1345, 660))
fig_head = crop(f'{A}/v7-perf-head.png', f'{A}/crop-head.png', (960, 100, 1345, 470))
fig_3d = crop(f'{A}/v7-3d-circuit-canvas.png', f'{A}/crop-3d.png', (120, 270, 1320, 720))

# ============================================================ SLIDE 8
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2: What We Built — the Interface', 8)
txt(s, 0.70, 1.14, 11.90, 0.55,
    [[('Phase 2 rebuilt the whole prototype around our reference program ', C, 12.5, False, MID),
      ('all_with_noise_prob.py', C, 12.5, True, VIOLET),
      (' — the website now contains exactly that scope: 2 QEC codes, 3 noise models, one ID-gate noise point, '
       'and every number is computed live by the same verified engine.', C, 12.5, False, MID)]], line_spacing=1.05)

cards8 = [
    ('1. Exact Python-Pipeline Engine',
     'A 1:1 TypeScript port of the Qiskit program: same gate lists, noise bound to the ID gate, conditional '
     'if_test-style corrections, and the same counts format "c2 c1 c0". Verified by a 44-assertion test suite.',
     VIOLET_BG, VIOLET_BD),
    ('2. Simulator Lab — the Program as a Website',
     'The five Python inputs (input bit, code, noise, probability, error qubit) drive a live run that outputs '
     'the same blocks: QEC STATUS, counts, interpretation, performance analysis, syndrome table, circuit.',
     CYAN_BG, CYAN_BD),
    ('3. Performance Lab — Monte-Carlo + Theory',
     'Sweeps of success rate vs noise probability (up to 50k shots/point) drawn against hand-derived theory '
     'curves, plus a head-to-head matrix of all six code × noise pairings with the QEC STATUS verdict.',
     GREEN_BG, GREEN_BD),
    ('4. 3D Quantum Lab — 3D, 4D and 5D Views',
     'Circuit Space 3D (the real circuit as glowing 3-D objects), State Pipeline 4D (the 5-qubit state evolving '
     'stage by stage over time) and a live Success Terrain 5D that grows shot by shot — up to 660k experiments.',
     AMBER_BG, AMBER_BD),
    ('5. Reports & Exports Everywhere',
     'Every lab exports real files: counts CSV, full JSON, print-ready PDF reports (Selection, Counts, '
     'Performance, Syndrome table) and PNG images of circuits, charts and 3-D scenes.',
     CYAN_BG, CYAN_BD),
    ('6. Simple Language + Deploy Guide',
     'All sections rewritten in plain English; Learn tab explains qubits, syndromes and matched pairings; '
     'README carries a step-by-step GitHub → Vercel deployment guide for one-click publishing.',
     VIOLET_BG, VIOLET_BD),
]
pos = [(0.70, 1.80), (4.83, 1.80), (8.96, 1.80), (0.70, 3.86), (4.83, 3.86), (8.96, 3.86)]
for (t, body, bg, bd), (l, tp) in zip(cards8, pos):
    card(s, l, tp, 3.67, 1.92, t, body, bg, bd, MID)

badge = box(s, 0.70, 6.06, 11.93, 0.58, fill=GREEN_BG, line=GREEN_BD, line_w=1.0, round_=True, radius=0.5)
tf = badge.text_frame
tf.vertical_anchor = MSO_ANCHOR.MIDDLE
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run()
r.text = ('Guarantees: every number on every tab is computed live in the browser — no mock data · Monte-Carlo dots sit on the '
          'hand-derived theory curves · exports contain exactly what the screen showed.')
r.font.name = C; r.font.size = Pt(10.5); r.font.bold = True; r.font.color.rgb = GREEN

# ============================================================ SLIDE 9 — Methodology + flow
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 Methodology — the Build Flow', 9)
txt(s, 0.70, 1.14, 11.90, 0.42,
    [[('One source of truth, five steps: the Qiskit program defines the physics, the port mirrors it gate-for-gate, '
       'tests pin it in place, hand-derived analytics cross-check it, and the interface simply renders what the engine computes.',
       C, 12.5, False, MID)]], line_spacing=1.05)

steps = [
    ('STEP 1 · Reference', 'all_with_noise_prob.py\nQiskit + Aer: circuits, ID-gate noise, 1000 shots', VIOLET_BG, VIOLET_BD, VIOLET),
    ('STEP 2 · Port', 'pyqec.ts — 1:1 mirror\ngates, noise sampling, if_test corrections', CYAN_BG, CYAN_BD, CYAN),
    ('STEP 3 · Verify', '44-assertion suite\ncircuit structure · matched = 100% · MC ≈ theory', GREEN_BG, GREEN_BD, GREEN),
    ('STEP 4 · Cross-check', 'Hand-traced analytics\n1−p, 1−2p/3, 100% matched — drawn as theory lines', AMBER_BG, AMBER_BD, AMBER),
    ('STEP 5 · Interface', 'Six tabs, all live\nSimulator · Performance · 3D/4D/5D · Learn · exports', VIOLET_BG, VIOLET_BD, VIOLET),
]
x = 0.70
for i, (head, sub, bg, bd, fg) in enumerate(steps):
    flow_box(s, x, 1.85, 2.12, 1.25, head, sub, bg, bd, fg)
    if i < 4:
        arrow_right(s, x + 2.16, 2.32, 0.30, 0.30, VIOLET)
    x += 2.47

# pipeline strip
txt(s, 0.70, 3.45, 11.90, 0.32, [[('The runtime pipeline every tab shares (identical to the Python program):', C, 12, True, NAVY)]])
pipe = ['INPUT BIT', 'ENCODE (CNOT×2)', 'ID-GATE NOISE', 'SYNDROME (2 ancillas)', 'CORRECT (if_test)', 'DECODE + MEASURE']
px = 0.70
for i, st in enumerate(pipe):
    b = chip(s, px, 3.85, 1.78, 0.52, st, LIGHT, BORDER, NAVY, size=9.5, bold=True)
    if i < 5:
        arrow_right(s, px + 1.80, 3.96, 0.20, 0.26, GRAY)
    px += 2.02

# verification evidence
vb = box(s, 0.70, 4.75, 11.93, 1.85, fill=RGBColor(0xFA, 0xFB, 0xFE), line=BORDER, line_w=1.0, round_=True, radius=0.05)
tf = vb.text_frame
tf.margin_left = tf.margin_right = Inches(0.16)
tf.margin_top = Inches(0.10)
p = tf.paragraphs[0]
r = p.add_run(); r.text = 'How we know the port is correct'
r.font.name = C; r.font.size = Pt(12.5); r.font.bold = True; r.font.color.rgb = NAVY
lines = [
    '· Circuit structure: stage counts (8 / 12), gate order, decode direction and register semantics asserted against the Python file.',
    '· Behaviour: noise-free runs return the input bit 500/500 for all 12 configurations; matched pairings correct 100% of fired errors.',
    '· Statistics: 30,000-shot Monte-Carlo rates agree with the hand-derived analytics to <1% for every code × noise pairing.',
    '· Honest inputs: the prototype keeps the program\'s classical-bit input, so Z-noise is harmless to the stored bit — and the site says so.',
]
for ln in lines:
    p2 = tf.add_paragraph(); p2.space_before = Pt(3); p2.line_spacing = 1.05
    r2 = p2.add_run(); r2.text = ln
    r2.font.name = C; r2.font.size = Pt(10.5); r2.font.color.rgb = MID

# ============================================================ SLIDE 10 — Architecture
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 System Architecture', 10)
txt(s, 0.70, 1.14, 11.90, 0.40,
    [[('Five layers, strictly limited to the reference program\'s scope. Data flows top to bottom; every layer runs client-side.',
       C, 12.5, False, MID)]])

layers = [
    ('LAYER 1 · REFERENCE PROGRAM', 'all_with_noise_prob.py (Qiskit + Aer) — bit_flip_qec · phase_flip_qec · build_noise_model (X / Z / depolarizing on "id") · 1000-shot run',
     VIOLET_BG, VIOLET_BD, NAVY),
    ('LAYER 2 · ENGINE', 'engine.ts + pyqec.ts — 5-qubit state vector (32 amplitudes) · seeded RNG · projective mid-circuit measurement · conditional corrections',
     CYAN_BG, CYAN_BD, NAVY),
    ('LAYER 3 · PIPELINE', '2 QEC codes × 3 noise models · QEC STATUS (MATCHED / NOT MATCHED / DEPOLARIZING) · counts → interpretation → performance analysis → syndrome table',
     GREEN_BG, GREEN_BD, NAVY),
    ('LAYER 4 · INTERFACE (6 TABS)', 'Overview · Simulator Lab · 3D Quantum Lab (Circuit Space 3D · State Pipeline 4D · Success Terrain 5D) · Performance Lab · Learn · About',
     AMBER_BG, AMBER_BD, NAVY),
    ('LAYER 5 · EXPORTS', 'counts CSV · full JSON · print-ready PDF report · circuit PNG · chart PNG · 3-D scene PNG — one click from every lab',
     LIGHT, BORDER, NAVY),
]
y = 1.66
for (head, sub, bg, bd, fg) in layers:
    b = box(s, 0.70, y, 11.93, 0.86, fill=bg, line=bd, line_w=1.1, round_=True, radius=0.07)
    tf = b.text_frame
    tf.margin_left = Inches(0.16); tf.margin_right = Inches(0.16)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p1 = tf.paragraphs[0]
    r = p1.add_run(); r.text = head
    r.font.name = C; r.font.size = Pt(12); r.font.bold = True; r.font.color.rgb = fg
    p2 = tf.add_paragraph(); p2.space_before = Pt(1.5); p2.line_spacing = 1.0
    r2 = p2.add_run(); r2.text = sub
    r2.font.name = C; r2.font.size = Pt(10); r2.font.color.rgb = MID
    if y < 5.5:
        a = s.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Inches(6.55), Inches(y + 0.875), Inches(0.24), Inches(0.17))
        a.fill.solid(); a.fill.fore_color.rgb = GRAY; a.line.fill.background(); no_shadow(a)
    y += 1.045

chips = ['Scope limited to the Python file', 'Zero mock data', '44 tests green', 'Runs fully in the browser']
cx = 0.70
for ctext in chips:
    w = 2.85
    chip(s, cx, 6.90, w, 0.34, ctext, RGBColor(0xFA, 0xFB, 0xFE), BORDER, MID, size=9.5, bold=True)
    cx += w + 0.17

# ============================================================ SLIDE 11 — Results (noise-model sims)
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 Results — Noise-Model Simulations', 11)
txt(s, 0.70, 1.08, 11.90, 0.55,
    [[('Live runs of the prototype, 1000 shots each. Left: the unmatched phase-flip pairing fails exactly as theory predicts (69%). '
       'Right: the MATCHED bit-flip pairing repairs every fired error (100%), above the live 5D terrain grown from 660,000 experiments.',
       C, 12, False, MID)]], line_spacing=1.03)

# left: not-matched counts (1249×800 → ar 1.561)
pic_h = 5.85 / 1.561  # ≈ 3.75
picture(s, fig_counts, 0.70, 1.78, 5.85)
txt(s, 0.70, 1.78 + pic_h + 0.12, 5.85, 0.75,
    [[('Phase-Flip QEC + Bit-Flip noise (p = 0.30): ', C, 10, True, NAVY),
      ('69.00% success; all 310 failures carry syndrome 00 — the undetected logical flip. Counts read “final bit + syndrome” exactly like Qiskit.',
       C, 10, False, MID)]], line_spacing=1.05)

# right top: matched performance strip (1249×270 → ar 4.63)
strip_h = 5.85 / 4.63  # ≈ 1.26
picture(s, fig_perf_matched, 6.78, 1.78, 5.85)
txt(s, 6.78, 1.78 + strip_h + 0.10, 5.85, 0.55,
    [[('Bit-Flip QEC + Bit-Flip noise (p = 0.30): ', C, 10, True, NAVY),
      ('310 errors fired, 310 corrections applied — success 100.00%, QEC STATUS: MATCHED.', C, 10, False, MID)]],
    line_spacing=1.05)

# right bottom: 5D terrain (1200×490 → ar 2.449)
terr_h = 5.85 / 2.449  # ≈ 2.39
picture(s, fig_terrain, 6.78, 1.78 + strip_h + 0.68, 5.85)
txt(s, 6.78, 1.78 + strip_h + 0.68 + terr_h + 0.10, 5.85, 0.55,
    [[('5D Success Terrain: ', C, 10, True, NAVY),
      ('Bit-Flip flat at 100%; Phase-Flip falls with unmatched noise (1−p and 1−2p/3) — grown live, shot by shot.', C, 10, False, MID)]],
    line_spacing=1.05)

# ============================================================ SLIDE 12 — Comparative analysis
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 Results — Comparative Analysis', 12)
txt(s, 0.70, 1.10, 11.90, 0.40,
    [[('Left: all six code × noise pairings measured at p = 0.30 (4000 shots each) against an unprotected qubit. '
       'Right: what Phase 2 changed relative to Phase 1.', C, 12, False, MID)]], line_spacing=1.03)

# matrix table
rows = [
    ('Code', 'Noise', 'QEC %', 'Bare %', 'QEC STATUS'),
    ('Bit-Flip QEC', 'Bit-Flip (X)', '100.0', '70.0', 'MATCHED'),
    ('Bit-Flip QEC', 'Phase-Flip (Z)', '100.0', '100.0', 'NO MATCH'),
    ('Bit-Flip QEC', 'Depolarizing', '100.0', '80.0', 'DEPOLARIZING'),
    ('Phase-Flip QEC', 'Bit-Flip (X)', '69.3', '70.0', 'NO MATCH'),
    ('Phase-Flip QEC', 'Phase-Flip (Z)', '100.0', '100.0', 'MATCHED'),
    ('Phase-Flip QEC', 'Depolarizing', '80.5', '80.0', 'DEPOLARIZING'),
]
tx, ty, tw = 0.70, 1.72, 6.55
rh = 0.42
for ri, row in enumerate(rows):
    yy = ty + ri * rh
    fill = NAVY if ri == 0 else (RGBColor(0xF7, 0xF8, 0xFC) if ri % 2 else WHITE)
    line_c = NAVY if ri == 0 else BORDER
    for ci, cell in enumerate(row):
        cw = [1.55, 1.45, 0.95, 0.95, 1.65][ci]
        cbox = box(s, tx + sum([1.55, 1.45, 0.95, 0.95][:ci]), yy, cw, rh,
                   fill=fill, line=line_c, line_w=0.75)
        tfc = cbox.text_frame
        tfc.vertical_anchor = MSO_ANCHOR.MIDDLE
        tfc.margin_left = Inches(0.06); tfc.margin_right = Inches(0.04)
        pc = tfc.paragraphs[0]
        pc.alignment = PP_ALIGN.LEFT if ci < 2 else PP_ALIGN.CENTER
        rc = pc.add_run(); rc.text = cell
        rc.font.name = C
        rc.font.size = Pt(10 if ri else 10.5)
        rc.font.bold = (ri == 0) or (ci == 2 and ri > 0)
        if ri == 0:
            rc.font.color.rgb = WHITE
        elif ci == 2:
            rc.font.color.rgb = GREEN if float(cell) >= 99.0 else (AMBER if float(cell) >= 80 else RED)
        elif ci == 4 and ri > 0:
            rc.font.color.rgb = GREEN if cell == 'MATCHED' else (CYAN if cell == 'DEPOLARIZING' else AMBER)
            rc.font.size = Pt(9)
            rc.font.bold = True
        else:
            rc.font.color.rgb = MID

txt(s, 0.70, 4.76, 6.55, 0.75,
    [[('Reading: the bit-flip code protects a classical bit perfectly against every noise in scope; the phase-flip code is '
       'perfect for its matched Z noise and degrades exactly as 1−p / 1−2p/3 elsewhere. Bare-qubit and phase-flip curves '
       'coincide because a classical bit is only ever hurt by flips.', C, 10, False, MID)]], line_spacing=1.08)

# Phase1 vs Phase2 table
rows2 = [
    ('Aspect', 'Phase 1', 'Phase 2'),
    ('Scope', '9 QEC codes, 8 noise models', 'Exactly the Python file: 2 codes, 3 noises'),
    ('Engine', 'Mixed engines (SV + surface)', 'One verified 5-qubit port of the reference program'),
    ('Simulator', 'State-centric (theta/phi inputs)', 'Program inputs: input bit, error qubit, ID-gate noise'),
    ('3D Lab', '4 scenes, partly decorative', '3D + 4D + 5D scenes of the SAME pipeline, all live'),
    ('Verification', 'Engine unit tests', '44 assertions + theory overlays on every chart'),
    ('Deliverables', 'Website prototype', 'Website + CSV/JSON/PDF/PNG exports + deploy guide'),
]
tx2, ty2, tw2 = 7.45, 1.72, 5.18
rh2 = 0.545
for ri, row in enumerate(rows2):
    yy = ty2 + ri * rh2
    for ci, cell in enumerate(row):
        cw = [1.28, 1.85, 2.05][ci]
        fill = NAVY if ri == 0 else (RGBColor(0xF7, 0xF8, 0xFC) if ri % 2 else WHITE)
        cbox = box(s, tx2 + sum([1.28, 1.85][:ci]), yy, cw, rh2,
                   fill=fill, line=NAVY if ri == 0 else BORDER, line_w=0.75)
        tfc = cbox.text_frame
        tfc.vertical_anchor = MSO_ANCHOR.MIDDLE
        tfc.margin_left = Inches(0.06); tfc.margin_right = Inches(0.04)
        tfc.word_wrap = True
        pc = tfc.paragraphs[0]
        rc = pc.add_run(); rc.text = cell
        rc.font.name = C
        rc.font.size = Pt(9 if ri else 10)
        rc.font.bold = (ri == 0) or (ci == 0)
        rc.font.color.rgb = WHITE if ri == 0 else (NAVY if ci == 0 else MID)

verdict = box(s, 7.45, 5.62, 5.18, 1.00, fill=GREEN_BG, line=GREEN_BD, line_w=1.0, round_=True, radius=0.08)
tfv = verdict.text_frame
tfv.margin_left = tfv.margin_right = Inches(0.12); tfv.vertical_anchor = MSO_ANCHOR.MIDDLE
pv = tfv.paragraphs[0]
rv = pv.add_run()
rv.text = ('Verdict: Phase 2 trades breadth for truth — a smaller, exactly-verified scope whose every chart, '
           'table and export can be reproduced from the reference program.')
rv.font.name = C; rv.font.size = Pt(10.5); rv.font.bold = True; rv.font.color.rgb = GREEN

# ============================================================ SLIDE 13 — References
s = prs.slides.add_slide(layout)
title_bar(s, 'References', 13)
refs = [
    'P. W. Shor, "Scheme for reducing decoherence in quantum computer memory," Physical Review A, 52(4):R2493–R2496, 1995.',
    'A. M. Steane, "Error correcting codes in quantum theory," Physical Review Letters, 77(5):793–797, 1996.',
    'E. Knill and R. Laflamme, "Theory of quantum error-correcting codes," Physical Review A, 55(2):900–911, 1997.',
    'M. A. Nielsen and I. L. Chuang, "Quantum Computation and Quantum Information," 10th Anniversary Edition, Cambridge University Press, 2010 — Chapter 10: Quantum error-correction.',
    'S. J. Devitt, W. J. Munro and K. Nemoto, "Quantum error correction for beginners," Reports on Progress in Physics, 76(7):076001, 2013.',
    'J. Preskill, "Lecture Notes on Quantum Computation," Chapter 7 — Quantum Error Correction, California Institute of Technology.',
    'D. Gottesman, "An Introduction to Quantum Error Correction and Fault-Tolerant Quantum Computation," Proc. SPIE 7474, 2009.',
    'A. G. Fowler, M. Mariantoni, J. M. Martinis and A. N. Cleland, "Surface codes: Towards practical large-scale quantum computation," Physical Review A, 86:032324, 2012.',
    'Qiskit Documentation — Quantum Circuits, Noise Models and Error Correction, IBM Quantum, https://qiskit.org/documentation.',
    'Qiskit Aer Simulators — Noise Model API (pauli_error, depolarizing_error), https://qiskit.org/ecosystem/aer.',
]
y = 1.55
for i, rtext in enumerate(refs, 1):
    txt(s, 0.70, y, 11.93, 0.5,
        [[(f'[{i}]  ', C, 11, True, VIOLET), (rtext, C, 11, False, MID)]], line_spacing=1.05)
    y += 0.52

prs.save(OUT)
print('saved', OUT, '| slides:', len(prs.slides.__iter__.__self__._sldIdLst))
