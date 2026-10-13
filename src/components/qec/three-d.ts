'use client';

/**
 * Minimal high-performance 3D engine shared by the Quantum Lab visualizers.
 * Pure Canvas-2D rendering with perspective projection, painter sorting and
 * an orbit camera (drag to rotate, wheel/pinch to zoom) — zero dependencies.
 */

import { useCallback, useEffect, useRef } from 'react';

export interface Cam {
  yaw: number;
  pitch: number;
  dist: number; // in scene units (scene radius = 1)
  auto: boolean; // auto-rotate
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface P2 {
  x: number;
  y: number;
  d: number; // depth after rotation (positive = towards viewer)
}

export function useOrbitCam(initial?: Partial<Cam>, onUserMove?: () => void) {
  const cam = useRef<Cam>({ yaw: 0.6, pitch: 0.38, dist: 3.1, auto: false, ...initial });
  const drag = useRef({ on: false, px: 0, py: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moveCb = useRef(onUserMove);
  useEffect(() => {
    moveCb.current = onUserMove;
  }, [onUserMove]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { on: true, px: e.clientX, py: e.clientY };
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
    cam.current.auto = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    drag.current.px = e.clientX;
    drag.current.py = e.clientY;
    cam.current.yaw += dx * 0.0085;
    cam.current.pitch = Math.max(-1.35, Math.min(1.35, cam.current.pitch + dy * 0.006));
    moveCb.current?.();
  }, []);

  const endDrag = useCallback(() => {
    drag.current.on = false;
  }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    cam.current.dist = Math.max(1.45, Math.min(7.5, cam.current.dist * (e.deltaY > 0 ? 1.09 : 0.92)));
    moveCb.current?.();
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return { cam, canvasRef, onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerLeave: endDrag };
}

/** Perspective-project a world point (y = up) to canvas coordinates. */
export function proj(x: number, y: number, z: number, cam: Cam, cx: number, cy: number, scale: number): P2 {
  const cyw = Math.cos(cam.yaw);
  const syw = Math.sin(cam.yaw);
  const x1 = x * cyw - z * syw;
  const z1 = x * syw + z * cyw;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const persp = cam.dist / Math.max(0.35, cam.dist - z2);
  return { x: cx + x1 * scale * persp, y: cy - y2 * scale * persp, d: z2 };
}

/** Resize canvas to its CSS box (DPR aware) and return ctx + logical size. */
export function fitCanvas(cv: HTMLCanvasElement): { w: number; h: number; ctx: CanvasRenderingContext2D } | null {
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 600;
  const h = cv.clientHeight || 400;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, ctx };
}

/** Polyline through 3D points. */
export function stroke3D(
  ctx: CanvasRenderingContext2D,
  pts: Vec3[],
  cam: Cam,
  cx: number,
  cy: number,
  scale: number,
  stroke: string,
  width = 1.4,
  dash: number[] = [],
  alphaFn?: (p: P2, i: number) => number
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  let began = false;
  for (let i = 0; i < pts.length; i++) {
    const p = proj(pts[i].x, pts[i].y, pts[i].z, cam, cx, cy, scale);
    ctx.globalAlpha = alphaFn ? alphaFn(p, i) : 1;
    if (!began) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      began = true;
    } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Text label anchored to a 3D point. */
export function label3D(
  ctx: CanvasRenderingContext2D,
  text: string,
  v: Vec3,
  cam: Cam,
  cx: number,
  cy: number,
  scale: number,
  color: string,
  font = '10px ui-monospace, monospace',
  dx = 4,
  dy = -4
) {
  const p = proj(v.x, v.y, v.z, cam, cx, cy, scale);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(text, p.x + dx, p.y + dy);
  ctx.restore();
}

/** Great-circle wireframe of a unit sphere (back hemisphere first if split). */
export function drawWireSphere(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cx: number,
  cy: number,
  R: number,
  lineColor = 'rgba(108,99,160,0.55)',
  faceColor = 'rgba(23,19,44,0.55)'
) {
  // outline disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = faceColor;
  ctx.fill();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const circles: Vec3[][] = [];
  // equator (x-z plane at y=0)
  const eq: Vec3[] = [];
  for (let a = 0; a <= 72; a++) {
    const t = (a / 72) * Math.PI * 2;
    eq.push({ x: Math.cos(t), y: 0, z: Math.sin(t) });
  }
  circles.push(eq);
  // meridian x-y
  const m1: Vec3[] = [];
  for (let a = 0; a <= 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    m1.push({ x: Math.cos(t), y: Math.sin(t), z: 0 });
  }
  circles.push(m1);
  // meridian y-z
  const m2: Vec3[] = [];
  for (let a = 0; a <= 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    m2.push({ x: 0, y: Math.cos(t), z: Math.sin(t) });
  }
  circles.push(m2);
  // extra latitude rings
  for (const yy of [-0.5, 0.5]) {
    const r = Math.sqrt(1 - yy * yy);
    const lat: Vec3[] = [];
    for (let a = 0; a <= 60; a++) {
      const t = (a / 60) * Math.PI * 2;
      lat.push({ x: r * Math.cos(t), y: yy, z: r * Math.sin(t) });
    }
    circles.push(lat);
  }

  for (const c of circles) {
    stroke3D(ctx, c, cam, cx, cy, R, lineColor, 0.8, [], (p) => (p.d < 0 ? 0.28 : 0.75));
  }
  ctx.restore();
}

/** Arrow from origin to 3D tip (sphere coordinates, radius ≤ 1). */
export function drawArrow3D(
  ctx: CanvasRenderingContext2D,
  tip: Vec3,
  cam: Cam,
  cx: number,
  cy: number,
  scale: number,
  color: string,
  width = 2.6,
  dashed = false
) {
  const o = proj(0, 0, 0, cam, cx, cy, scale);
  const t = proj(tip.x, tip.y, tip.z, cam, cx, cy, scale);
  const behind = t.d < 0;
  ctx.save();
  ctx.globalAlpha = behind ? 0.55 : 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(t.x, t.y);
  ctx.stroke();
  // head
  const ang = Math.atan2(t.y - o.y, t.x - o.x);
  const hl = 9;
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  ctx.lineTo(t.x - hl * Math.cos(ang - 0.42), t.y - hl * Math.sin(ang - 0.42));
  ctx.lineTo(t.x - hl * Math.cos(ang + 0.42), t.y - hl * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function dot3D(
  ctx: CanvasRenderingContext2D,
  v: Vec3,
  cam: Cam,
  cx: number,
  cy: number,
  scale: number,
  color: string,
  r = 3,
  glow = 0
) {
  const p = proj(v.x, v.y, v.z, cam, cx, cy, scale);
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = p.d < 0 ? 0.45 : 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** small axis cross at the origin of a lattice cell (helper for slabs) */
export function lerpV(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
