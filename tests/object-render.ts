/**
 * Synthetic renderer for the object scan: the printed sheet on a textured table, an object (analytic shapes) in the
 * middle, a far background. Camera: x right, y down, z forward. Used by the object-scan tests only.
 */
import { Layout, SheetBitmap, sampleSheet, renderSheet, makeLayout } from '../src/object3d/sheet';

export type V3 = [number, number, number];
const hash3 = (x: number, y: number, z: number) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t: number) => t * t * (3 - 2 * t);
  let acc = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++)
    acc += hash3(ix + dx, iy + dy, iz + dz) * (dx ? s(fx) : 1 - s(fx)) * (dy ? s(fy) : 1 - s(fy)) * (dz ? s(fz) : 1 - s(fz));
  return acc;
}

export type Shape =
  | { kind: 'box'; cx: number; cy: number; hx: number; hy: number; h: number; rot: number }
  | { kind: 'cyl'; cx: number; cy: number; r: number; z0: number; z1: number }
  | { kind: 'sphere'; cx: number; cy: number; cz: number; r: number };
export interface Scene { shapes: Shape[]; tint: number; }

/** Is a board point (mm) inside the object? */
export function inside(sc: Scene, x: number, y: number, z: number): boolean {
  for (const s of sc.shapes) {
    if (s.kind === 'box') {
      const c = Math.cos(s.rot), n = Math.sin(s.rot), dx = x - s.cx, dy = y - s.cy;
      if (Math.abs(dx * c + dy * n) <= s.hx && Math.abs(-dx * n + dy * c) <= s.hy && z >= 0 && z <= s.h) return true;
    } else if (s.kind === 'cyl') { if (Math.hypot(x - s.cx, y - s.cy) <= s.r && z >= s.z0 && z <= s.z1) return true; }
    else if (Math.hypot(x - s.cx, y - s.cy, z - s.cz) <= s.r) return true;
  }
  return false;
}

/** Ray (board frame) -> nearest object hit distance, or Infinity. Marching + bisection: shapes are simple. */
function hitObject(sc: Scene, o: V3, d: V3, tmax: number): number {
  const step = 1.0;
  // only march inside the bounding box of the object zone
  let ta = 0, tb = tmax;
  const lo = [-75, -75, -1], hi = [75, 75, 120];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return Infinity; continue; }
    let s0 = (lo[a] - o[a]) / d[a], s1 = (hi[a] - o[a]) / d[a]; if (s0 > s1) [s0, s1] = [s1, s0];
    ta = Math.max(ta, s0); tb = Math.min(tb, s1);
  }
  if (ta >= tb) return Infinity;
  let prev = false, t0 = Math.max(0, ta - step);
  for (let t = Math.max(0, ta - step); t < tb; t += step) {
    const p = inside(sc, o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
    if (p && !prev) { let lo = t0, hi = t; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (inside(sc, o[0] + d[0] * m, o[1] + d[1] * m, o[2] + d[2] * m)) hi = m; else lo = m; } return hi; }
    prev = p; t0 = t;
  }
  return Infinity;
}

export interface Cam { R: number[]; t: number[]; f: number; w: number; h: number; }

export function lookAt(eye: V3, target: V3, f: number, w: number, h: number): Cam {
  const z: V3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const zl = Math.hypot(...z); z[0] /= zl; z[1] /= zl; z[2] /= zl;
  // image x = right = z cross up(0,0,1) ... camera y points down
  let x: V3 = [z[1] * 1 - z[2] * 0, z[2] * 0 - z[0] * 1, 0]; // z x (0,0,1)
  const xl = Math.hypot(...x); x = [x[0] / xl, x[1] / xl, 0];
  const y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]; // z x x  (points down)
  const R = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]]; // board -> camera rows
  const t = [-(R[0] * eye[0] + R[1] * eye[1] + R[2] * eye[2]), -(R[3] * eye[0] + R[4] * eye[1] + R[5] * eye[2]), -(R[6] * eye[0] + R[7] * eye[1] + R[8] * eye[2])];
  return { R, t, f, w, h };
}

export interface RenderOpts { gain?: number; offset?: number; noise?: number; blur?: boolean; ss?: number; }

/** Table texture without a sheet (natural surface): speckle with features of a few millimetres. */
export function tableTex(x: number, y: number): number {
  return 60 + 150 * Math.min(1, Math.max(0, (0.5 * vnoise3(x / 6.5, y / 6.5, 5) + 0.3 * vnoise3(x / 2.9, y / 2.9, 11) + 0.2 * vnoise3(x / 14, y / 14, 2) - 0.2) / 0.6));
}

export function renderView(L: Layout | null, B: SheetBitmap | null, sc: Scene, cam: Cam, opt: RenderOpts = {}): Uint8Array {
  const { R, t, f, w, h } = cam, ss = opt.ss ?? 2;
  const eye: V3 = [-(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]), -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]), -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2])];
  const img = new Float32Array(w * h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    let acc = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const xc = (px + (sx + 0.5) / ss - w / 2) / f, yc = (py + (sy + 0.5) / ss - h / 2) / f;
      const d: V3 = [R[0] * xc + R[3] * yc + R[6], R[1] * xc + R[4] * yc + R[7], R[2] * xc + R[5] * yc + R[8]]; // camera -> board (R^T)
      const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
      let tp = d[2] < -1e-9 ? -eye[2] / d[2] : Infinity;               // table / sheet plane z = 0
      const to = hitObject(sc, eye, d, Math.min(tp, 900));
      let val: number;
      if (to < tp) {
        const p: V3 = [eye[0] + d[0] * to, eye[1] + d[1] * to, eye[2] + d[2] * to];
        const n = 0.55 * vnoise3(p[0] / 4, p[1] / 4, p[2] / 4) + 0.45 * vnoise3(p[0] / 1.7, p[1] / 1.7, p[2] / 1.7);
        val = sc.tint + 75 * (n - 0.5) * 2;
      } else if (tp < Infinity) {
        const x = eye[0] + d[0] * tp, y = eye[1] + d[1] * tp;
        if (!L || !B) val = tableTex(x, y);
        else if (Math.abs(x) < L.w / 2 && Math.abs(y) < L.h / 2) val = sampleSheet(B, L, x, y);
        else val = 70 + 60 * vnoise3(x / 9, y / 9, 3) + 25 * vnoise3(x / 3, y / 3, 9);  // wooden table
      } else {
        val = 150 + 60 * d[2] + 30 * vnoise3(d[0] * 6, d[1] * 6, 1);                      // far background
      }
      acc += val;
    }
    img[py * w + px] = acc / (ss * ss);
  }
  let out = img;
  if (opt.blur) { // 3x3 box blur (focus / motion softness)
    out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += img[yy * w + xx]; n++; } }
      out[y * w + x] = s / n;
    }
  }
  const u8 = new Uint8Array(w * h), gain = opt.gain ?? 1, off = opt.offset ?? 0, noise = opt.noise ?? 0;
  for (let i = 0; i < u8.length; i++) u8[i] = Math.max(0, Math.min(255, out[i] * gain + off + (Math.random() - 0.5) * 2 * noise));
  return u8;
}

export { makeLayout, renderSheet };
