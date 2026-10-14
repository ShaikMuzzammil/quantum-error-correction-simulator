#!/usr/bin/env python3
"""Build the COMBINED deck v8: Phase 1 (existing 7 slides, college added) +
Phase 2 (slides 8-13), strict template headings:
  Methodology (9, 10) · Results (11) · Comparative Analysis along with References (12) · The Flow (13)
All Phase-2 screenshots are 2-D simulation shots (no 3-D), per requirement.
Design matches Phase 1: white bg, Georgia bold #1B2A49 titles, Calibri body.
Output: download/Quantum_error_correction_Phase1+Phase2_v8.pptx"""
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

SRC = '/home/z/my-project/upload/Quantum_error_correction_plain.pptx'
OUT = '/home/z/my-project/download/Quantum_error_correction_Phase1+Phase2_v8.pptx'
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
        slide.shapes._spTree.remove(f._element)
        slide.shapes._spTree.insert(list(slide.shapes._spTree).index(pic._element), f._element)
    return pic

def crop(src, out, box_):
    img = Image.open(src)
    img.crop(box_).save(out, quality=92)
    return out

def card(slide, l, t, w, h, title, body, bg, bd, tsize=12, bsize=9.5):
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

# ---------------- prepare 2-D simulation screenshot crops ----------------------
# all source screenshots are 1500x950 browser captures
fig_hero = crop(f'{A}/v8-sim-x-corrected.png', f'{A}/v8c-hero.png', (508, 278, 1348, 718))       # verdict + circuit w/ markers
fig_pycirc = crop(f'{A}/v8-report-circuit.png', f'{A}/v8c-pycirc.png', (383, 22, 1132, 338))     # exact python circuit (report embed)
fig_mc = crop(f'{A}/v8-perf-mc.png', f'{A}/v8c-mc.png', (126, 465, 1373, 833))                   # MC bar chart + stats table
fig_sweep = crop(f'{A}/v8-perf-sweep.png', f'{A}/v8c-sweep.png', (150, 440, 1355, 855))          # fidelity-vs-p sweep chart (chart area)
fig_report = crop(f'{A}/v8-report-circuit.png', f'{A}/v8c-report.png', (300, 0, 1215, 640))      # printable report incl. circuit
fig_synd = crop(f'{A}/v8-sim-lower.png', f'{A}/v8c-synd.png', (510, 605, 935, 880))              # syndrome table + python mapping

# ============================================================ SLIDE 8
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2: What We Built — the Interface', 8)
txt(s, 0.70, 1.14, 11.90, 0.55,
    [[('Phase 2 rebuilt the prototype around our reference program ', C, 12.5, False, MID),
      ('all_with_noise_prob.py', C, 12.5, True, VIOLET),
      (' and restored the compact 7-tab interface: exactly 2 QEC codes and 3 noise models — the same scope as the '
       'Python file — with every number computed live by the verified engine.', C, 12.5, False, MID)]], line_spacing=1.05)

cards8 = [
    ('1. Scope = the Python File, Exactly',
     '2 QEC codes (3-Qubit Bit-Flip and Phase-Flip) × 3 noise channels (Bit-Flip X, Phase-Flip Z, Depolarizing). '
     'Every extra code or noise from earlier drafts was removed — what you see is what the program implements.',
     VIOLET_BG, VIOLET_BD),
    ('2. Simulator Lab — the Program as a Website',
     'Code, noise, probability, input state, manual error injection and seed drive the full pipeline. The verdict '
     'carries the Python wording — QEC STATUS: MATCHED / NOT MATCHED / DEPOLARIZING — plus syndrome table and Bloch comparison.',
     CYAN_BG, CYAN_BD),
    ('3. Exact Python Circuits, In-App',
     'The real 5-qubit + 3-classical-bit circuits: ID-gate noise insertion, q3/q4 syndrome checks, conditional '
     'if_test corrections (01→q0, 11→q1, 10→q2) and the final measurement — rendered live and embedded in the PDF reports.',
     GREEN_BG, GREEN_BD),
    ('4. 3D Quantum Lab — Four Live Visualizers',
     'Bloch Flight 4D (time-colored trajectory), State Cityscape 3D (amplitude skyline), the new Syndrome Spacetime 4D '
     '(bit-flip code over rounds) and the new interactive Bloch Sphere 3D (stage-by-stage pipeline walkthrough). All one-shot.',
     AMBER_BG, AMBER_BD),
    ('5. Performance Lab — Monte Carlo + Sweeps',
     'Up to 25,000 shots per run with a seeded RNG, before/after charts, statistical summary and the fidelity-vs-p sweep '
     '(1%–50%) that exposes each code\'s pseudo-threshold. CSV export for every chart.',
     CYAN_BG, CYAN_BD),
    ('6. Advanced Exports + Deploy Guide',
     'Every lab exports a print-ready PDF report that now embeds the exact circuit diagram, plus full JSON and CSV. '
     'The README carries the step-by-step GitHub → Vercel deployment guide; the site is college-branded throughout.',
     VIOLET_BG, VIOLET_BD),
]
pos = [(0.70, 1.80), (4.83, 1.80), (8.96, 1.80), (0.70, 3.86), (4.83, 3.86), (8.96, 3.86)]
for (t, body, bg, bd), (l, tp) in zip(cards8, pos):
    card(s, l, tp, 3.67, 1.92, t, body, bg, bd)

badge = box(s, 0.70, 6.06, 11.93, 0.58, fill=GREEN_BG, line=GREEN_BD, line_w=1.0, round_=True, radius=0.5)
tf = badge.text_frame
tf.vertical_anchor = MSO_ANCHOR.MIDDLE
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run()
r.text = ('Guarantees: 100-assertion engine suite green · lint clean · production build verified · every tab browser-tested · '
          'matched pairings recover 100% of fired errors · no mock data anywhere.')
r.font.name = C; r.font.size = Pt(10.5); r.font.bold = True; r.font.color.rgb = GREEN

# ============================================================ SLIDE 9 — Methodology
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 Methodology — the Build Flow', 9)
txt(s, 0.70, 1.14, 11.90, 0.42,
    [[('One source of truth, five steps: the Qiskit program defines the physics, the engine mirrors it gate-for-gate, '
       'a 100-assertion suite pins it in place, hand-derived analytics cross-check it, and the interface simply renders what the engine computes.',
       C, 12.5, False, MID)]], line_spacing=1.05)

steps = [
    ('STEP 1 · Reference', 'all_with_noise_prob.py\nQiskit + Aer: circuits, ID-gate noise, 1000 shots', VIOLET_BG, VIOLET_BD, VIOLET),
    ('STEP 2 · Restore + Limit', 'Compact 7-tab UI restored; scope cut to 2 codes × 3 noises — exactly the Python file', CYAN_BG, CYAN_BD, CYAN),
    ('STEP 3 · Port + Verify', 'State-vector engine + circuits\n100-assertion suite: structure · behaviour · statistics', GREEN_BG, GREEN_BD, GREEN),
    ('STEP 4 · Cross-check', 'Hand-derived analytics\n(1−p)³+3p(1−p)², 1−2p/3 — Monte Carlo lands on the curves', AMBER_BG, AMBER_BD, AMBER),
    ('STEP 5 · Interface', '7 tabs, all live\nSimulator · 3D Lab (4 views) · Performance · Learn · Reference · About', VIOLET_BG, VIOLET_BD, VIOLET),
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
    chip(s, px, 3.85, 1.78, 0.52, st, LIGHT, BORDER, NAVY, size=9.5, bold=True)
    if i < 5:
        arrow_right(s, px + 1.80, 3.96, 0.20, 0.26, GRAY)
    px += 2.02

# verification evidence
vb = box(s, 0.70, 4.75, 11.93, 1.85, fill=RGBColor(0xFA, 0xFB, 0xFE), line=BORDER, line_w=1.0, round_=True, radius=0.05)
tf = vb.text_frame
tf.margin_left = tf.margin_right = Inches(0.16)
tf.margin_top = Inches(0.10)
p = tf.paragraphs[0]
r = p.add_run(); r.text = 'How we know the implementation is correct'
r.font.name = C; r.font.size = Pt(12.5); r.font.bold = True; r.font.color.rgb = NAVY
lines = [
    '· Circuit structure: the exact Python circuits are defined op-by-op (id-gate position, if_test mapping 01/11/10, decode order) and asserted by the suite.',
    '· Behaviour: matched pairings correct 100% of fired errors; a double error flips the logical state (F ≈ 0) exactly as distance-3 physics demands.',
    '· Statistics: Monte-Carlo fidelities agree with (1−p)³ + 3p(1−p)² at every p tested; unmatched pairings measurably underperform bare qubits.',
    '· Toolchain: tsc 0 errors · eslint 0 problems · production build OK · all 7 tabs verified in a real browser with zero console errors.',
]
for ln in lines:
    p2 = tf.add_paragraph(); p2.space_before = Pt(3); p2.line_spacing = 1.05
    r2 = p2.add_run(); r2.text = ln
    r2.font.name = C; r2.font.size = Pt(10.5); r2.font.color.rgb = MID

# ============================================================ SLIDE 10 — Architecture
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 Methodology — System Architecture', 10)
txt(s, 0.70, 1.14, 11.90, 0.40,
    [[("Five layers, strictly limited to the reference program's scope. Data flows top to bottom; every layer runs client-side.",
       C, 12.5, False, MID)]])

layers = [
    ('LAYER 1 · REFERENCE PROGRAM', 'all_with_noise_prob.py (Qiskit + Aer) — bit_flip_qec · phase_flip_qec · build_noise_model (X / Z / depolarizing on "id") · 1000-shot run',
     VIOLET_BG, VIOLET_BD, NAVY),
    ('LAYER 2 · ENGINE', 'engine.ts + codes.ts + noise.ts — state vector (8 amplitudes per block) · seeded RNG · projective stabilizer measurement · exact Python circuit definitions',
     CYAN_BG, CYAN_BD, NAVY),
    ('LAYER 3 · PIPELINE', '2 QEC codes × 3 noise models · QEC STATUS (MATCHED / NOT MATCHED / DEPOLARIZING) · encode → noise → syndrome → correct → decode → measure',
     GREEN_BG, GREEN_BD, NAVY),
    ('LAYER 4 · INTERFACE (7 TABS)', 'Overview · Simulator Lab · 3D Quantum Lab (Bloch Flight 4D · Cityscape 3D · Syndrome Spacetime 4D · Bloch Sphere 3D) · Performance Lab · Learn · Reference · About',
     AMBER_BG, AMBER_BD, NAVY),
    ('LAYER 5 · EXPORTS', 'print-ready PDF report with embedded circuit diagram · full JSON · CSV (amplitudes, sweeps, per-round ledgers) — one click from every lab',
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

chips = ['Scope limited to the Python file', 'Zero mock data', '100 tests green', 'Runs fully in the browser']
cx = 0.70
for ctext in chips:
    chip(s, cx, 6.90, 2.85, 0.34, ctext, RGBColor(0xFA, 0xFB, 0xFE), BORDER, MID, size=9.5, bold=True)
    cx += 3.02

# ============================================================ SLIDE 11 — Results (2D screenshots)
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 Results — Simulation Runs', 11)
txt(s, 0.70, 1.02, 11.90, 0.40,
    [[('Live 2-D simulation runs. Left: a manually injected X error on q1 is repaired while the bare qubit is destroyed (100% vs 0%). '
       'Right: the exact Python circuit and a 2,000-shot Monte Carlo (3.59× fewer errors); bottom-left: the fidelity-vs-p sweep.',
       C, 12, False, MID)]], line_spacing=1.03)

# left: hero corrected run (840x440 → ar 1.909)
hero_w = 5.45
hero_h = hero_w / 1.909  # ≈ 2.86
picture(s, fig_hero, 0.70, 1.50, hero_w)
txt(s, 0.70, 1.50 + hero_h + 0.08, hero_w, 0.66,
    [[('Simulator Lab — manual X injection on q1: ', C, 10, True, NAVY),
      ('the syndrome flags the error, the decoder applies X, and the logical qubit is recovered (QEC 100.00%) while the same noise '
       'destroys the unprotected qubit (bare 0.00%).', C, 10, False, MID)]], line_spacing=1.05)

# left bottom: sweep chart (1205x415 → ar 2.905)
sw_w = 5.45
sw_h = sw_w / 2.905  # ≈ 1.88
picture(s, fig_sweep, 0.70, 5.12, sw_w)

# right top: python circuit (749x316 → ar 2.371)
py_w = 5.85
py_h = py_w / 2.371  # ≈ 2.47
picture(s, fig_pycirc, 6.78, 1.50, py_w)
txt(s, 6.78, 1.50 + py_h + 0.08, py_w, 0.62,
    [[('Exact Python circuit — bit_flip_qec(input_bit, error_qubit): ', C, 10, True, NAVY),
      ('5 qubits + 3 classical bits, id-gate noise point, q3/q4 syndrome measurement and conditional corrections, '
       'embedded in the printable PDF report.', C, 10, False, MID)]], line_spacing=1.05)

# right bottom: MC strip (1247x368 → ar 3.389)
mc_w = 5.85
mc_h = mc_w / 3.389  # ≈ 1.73
picture(s, fig_mc, 6.78, 4.78, mc_w)
txt(s, 6.78, 4.78 + mc_h + 0.06, mc_w, 0.50,
    [[('Performance Lab — 2,000-shot Monte Carlo: ', C, 10, True, NAVY),
      ('98.52% with QEC vs 94.71% bare — 3.59× fewer errors at p = 0.10.', C, 10, False, MID)]], line_spacing=1.05)

# ============================================================ SLIDE 12 — Comparative analysis along with references
s = prs.slides.add_slide(layout)
title_bar(s, 'Phase 2 — Comparative Analysis & References', 12)
txt(s, 0.70, 1.06, 11.90, 0.42,
    [[('All six code × noise pairings measured with the final engine (p = 0.10, |ψ⟩ at θ = 60°, φ = 36°, 4,000 shots each) against an '
       'unprotected qubit — matched pairings win big; unmatched pairings honestly lose.', C, 12, False, MID)]], line_spacing=1.03)

rows = [
    ('Code', 'Noise', 'QEC %', 'Bare %', 'Verdict'),
    ('Bit-Flip QEC', 'Bit-Flip (X)', '98.7', '94.9', 'MATCHED · 3.8×'),
    ('Bit-Flip QEC', 'Phase-Flip (Z)', '81.6', '92.4', 'NOT MATCHED'),
    ('Bit-Flip QEC', 'Depolarizing', '86.7', '93.4', 'DEPOLARIZING'),
    ('Phase-Flip QEC', 'Bit-Flip (X)', '87.2', '95.1', 'NOT MATCHED'),
    ('Phase-Flip QEC', 'Phase-Flip (Z)', '98.3', '92.3', 'MATCHED · 4.5×'),
    ('Phase-Flip QEC', 'Depolarizing', '90.3', '93.2', 'DEPOLARIZING'),
]
tx, ty = 0.70, 1.66
rh = 0.40
for ri, row in enumerate(rows):
    yy = ty + ri * rh
    fill = NAVY if ri == 0 else (RGBColor(0xF7, 0xF8, 0xFC) if ri % 2 else WHITE)
    line_c = NAVY if ri == 0 else BORDER
    for ci, cell in enumerate(row):
        cw = [1.42, 1.42, 0.83, 0.83, 2.05][ci]
        cbox = box(s, tx + sum([1.42, 1.42, 0.83, 0.83][:ci]), yy, cw, rh,
                   fill=fill, line=line_c, line_w=0.75)
        tfc = cbox.text_frame
        tfc.vertical_anchor = MSO_ANCHOR.MIDDLE
        tfc.margin_left = Inches(0.06); tfc.margin_right = Inches(0.04)
        pc = tfc.paragraphs[0]
        pc.alignment = PP_ALIGN.LEFT if ci < 2 else PP_ALIGN.CENTER
        rc = pc.add_run(); rc.text = cell
        rc.font.name = C
        rc.font.size = Pt(9.5 if ri else 10.5)
        rc.font.bold = (ri == 0) or (ci == 2 and ri > 0)
        if ri == 0:
            rc.font.color.rgb = WHITE
        elif ci == 2:
            rc.font.color.rgb = GREEN if float(cell) >= 95 else (AMBER if float(cell) >= 85 else RED)
        elif ci == 4 and ri > 0:
            good = cell.startswith('MATCHED')
            rc.font.color.rgb = GREEN if good else (CYAN if cell == 'DEPOLARIZING' else AMBER)
            rc.font.size = Pt(8.5)
            rc.font.bold = True
        else:
            rc.font.color.rgb = MID

txt(s, 0.70, 4.52, 6.55, 0.80,
    [[('Reading: a matched code repairs its own error type almost perfectly (98%+). Unmatched pairings are WORSE than no code at all — '
       'the two extra qubits triple the exposure to error types the code cannot see. That asymmetry is the core lesson of QEC.', C, 10, False, MID)]],
    line_spacing=1.08)

# Phase1 vs Phase2 table
rows2 = [
    ('Aspect', 'Phase 1', 'Phase 2'),
    ('Scope', '9 QEC codes, 8 noise models', 'Exactly the Python file: 2 codes, 3 noises'),
    ('Engine', 'Mixed engines (SV + surface)', 'One verified state-vector engine for everything'),
    ('Circuits', 'Encoding diagrams only', 'Exact Python circuits, in-app + inside PDF reports'),
    ('3D Lab', 'Surface-code lattice scenes', 'Bloch Flight 4D · Cityscape · Syndrome Spacetime 4D · Bloch Sphere 3D'),
    ('Verification', 'Engine unit tests', '100-assertion suite + browser E2E + build checks'),
    ('Deliverables', 'Website prototype', 'Website + PDF/JSON/CSV exports + Vercel deploy guide'),
]
tx2, ty2 = 7.45, 1.66
rh2 = 0.475
for ri, row in enumerate(rows2):
    yy = ty2 + ri * rh2
    for ci, cell in enumerate(row):
        cw = [1.18, 1.75, 2.25][ci]
        fill = NAVY if ri == 0 else (RGBColor(0xF7, 0xF8, 0xFC) if ri % 2 else WHITE)
        cbox = box(s, tx2 + sum([1.18, 1.75][:ci]), yy, cw, rh2,
                   fill=fill, line=NAVY if ri == 0 else BORDER, line_w=0.75)
        tfc = cbox.text_frame
        tfc.vertical_anchor = MSO_ANCHOR.MIDDLE
        tfc.margin_left = Inches(0.06); tfc.margin_right = Inches(0.04)
        tfc.word_wrap = True
        pc = tfc.paragraphs[0]
        rc = pc.add_run(); rc.text = cell
        rc.font.name = C
        rc.font.size = Pt(8.5 if ri else 9.5)
        rc.font.bold = (ri == 0) or (ci == 0)
        rc.font.color.rgb = WHITE if ri == 0 else (NAVY if ci == 0 else MID)

# references strip (compact, 2 columns x 4)
txt(s, 0.70, 5.42, 11.90, 0.30,
    [[('References (full list on the next slide):', C, 10.5, True, NAVY)]])
refs_short = [
    '[1] Shor, Phys. Rev. A 52:R2493, 1995 — the first QEC code.',
    '[2] Steane, PRL 77:793, 1996 — CSS construction.',
    '[5] Devitt, Munro & Nemoto, Rep. Prog. Phys. 76:076001, 2013 — QEC for beginners.',
    '[9] Qiskit Documentation — Noise Models & circuits, IBM Quantum.',
    '[3] Knill & Laflamme, Phys. Rev. A 55:900, 1997 — QEC theory.',
    '[4] Nielsen & Chuang, Ch. 10, Cambridge Univ. Press, 2010.',
    '[8] Fowler et al., Phys. Rev. A 86:032324, 2012 — surface codes.',
    '[10] Qiskit Aer — pauli_error / depolarizing_error API.',
]
for i, rt in enumerate(refs_short):
    col = i % 2
    rowi = i // 2
    txt(s, 0.70 + col * 6.05, 5.74 + rowi * 0.30, 5.95, 0.30,
        [[(rt, C, 8.5, False, MID)]], line_spacing=1.0)

# ============================================================ SLIDE 13 — The Flow
s = prs.slides.add_slide(layout)
title_bar(s, 'The Flow — Input Bit to Deployed Website', 13)
txt(s, 0.70, 1.14, 11.90, 0.42,
    [[('Left to right: the runtime pipeline every simulation executes; then the delivery flow that puts the prototype online. '
       'Everything in between is verified — the exports carry the exact circuit so any run can be checked against the Python program.',
       C, 12.5, False, MID)]], line_spacing=1.05)

# runtime pipeline strip
txt(s, 0.70, 1.72, 11.90, 0.30, [[('1 · RUNTIME FLOW (every tab, every shot):', C, 11.5, True, NAVY)]])
pipe = ['INPUT |ψ⟩ / BIT', 'ENCODE', 'NOISE (X/Z/DEP)', 'SYNDROME', 'CORRECT', 'DECODE', 'MEASURE + EXPORT']
px = 0.70
for i, st in enumerate(pipe):
    chip(s, px, 2.06, 1.52, 0.50, st, LIGHT, BORDER, NAVY, size=8.5, bold=True)
    if i < 6:
        arrow_right(s, px + 1.54, 2.16, 0.16, 0.24, GRAY)
    px += 1.72

# deployment flow
txt(s, 0.70, 2.78, 11.90, 0.30, [[('2 · DELIVERY FLOW (how the prototype goes live):', C, 11.5, True, NAVY)]])
dep = [
    ('UPDATED CODE', 'Verified build · 100 tests green · README guide', VIOLET_BG, VIOLET_BD, VIOLET),
    ('GITHUB PUSH', 'git add · commit · push to the repository', CYAN_BG, CYAN_BD, CYAN),
    ('VERCEL BUILD', 'Auto-detects Next.js — npm install + next build', GREEN_BG, GREEN_BD, GREEN),
    ('LIVE URL', 'https://<project>.vercel.app — runs 100% client-side', AMBER_BG, AMBER_BD, AMBER),
]
dx = 0.70
for i, (head, sub, bg, bd, fg) in enumerate(dep):
    flow_box(s, dx, 3.12, 2.62, 1.05, head, sub, bg, bd, fg)
    if i < 3:
        arrow_right(s, dx + 2.66, 3.50, 0.30, 0.30, VIOLET)
    dx += 3.00

# export evidence (report with circuit) left + closing badge
rep_w = 3.40
rep_h = rep_w / 1.430  # fig_report 915x640 → ar 1.430 ≈ 2.38
picture(s, fig_report, 0.70, 4.50, rep_w)
txt(s, 0.70 + rep_w + 0.25, 4.62, 8.0, 1.9,
    [[('Exports that can be checked: ', C, 11, True, NAVY),
      ('every lab prints a formal report (Inputs → Circuit → Outputs → Methodology) with the exact Python circuit embedded, '
       'plus full JSON and CSV files. Run the same configuration in all_with_noise_prob.py and the numbers agree.',
       C, 11, False, MID)]], line_spacing=1.15)
badge = box(s, 0.70 + rep_w + 0.25, 6.30, 7.95, 0.55, fill=GREEN_BG, line=GREEN_BD, line_w=1.0, round_=True, radius=0.5)
tfb = badge.text_frame
tfb.vertical_anchor = MSO_ANCHOR.MIDDLE
pb = tfb.paragraphs[0]; pb.alignment = PP_ALIGN.CENTER
rb = pb.add_run()
rb.text = 'Interactive Quantum Error Correction Simulator · K. Devendra Reddy · Shaik Muzzammil · D. Guna Samhith · AMRITA VISHWA VIDYAPEETHAM'
rb.font.name = C; rb.font.size = Pt(10); rb.font.bold = True; rb.font.color.rgb = GREEN

prs.save(OUT)
print('saved', OUT, '| slides:', len(prs.slides._sldIdLst))
