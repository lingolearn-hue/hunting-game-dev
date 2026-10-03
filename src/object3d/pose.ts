import { Marker } from './aruco';
import { Layout, markerCorners } from './sheet';
import { solve } from './aruco';

/**
 * Camera pose from the sheet. Camera coordinates: x right, y down, z forward (pixels: u = f x/z + cx, v = f y/z + cy).
 * pose maps board mm -> camera: Xc = R Xb + t.
 */
export interface Pose { R: number[]; t: number[]; /** reprojection RMS in px */ rms: number; markers: number; points: number; }
export interface Intrinsics { f: number; cx: number; cy: number; }

type Corr = { X: number; Y: number; u: number; v: number };

export function correspondences(L: Layout, markers: Marker[]): Corr[] {
  const out: Corr[] = [];
  for (const m of markers) {
    const mk = L.markers.find((b) => b.id === m.id);
    if (!mk) continue;
    const c = markerCorners(mk);
    for (let i = 0; i < 4; i++) out.push({ X: c[i][0], Y: c[i][1], u: m.corners[i][0], v: m.corners[i][1] });
  }
  return out;
}

/** Normalized DLT homography board(mm) -> image(px), via the smallest eigenvector of A^T A (Jacobi). */
export function homographyDLT(c: Corr[]): number[] | null {
  if (c.length < 4) return null;
  const mx = c.reduce((a, p) => a + p.X, 0) / c.length, my = c.reduce((a, p) => a + p.Y, 0) / c.length;
  const mu = c.reduce((a, p) => a + p.u, 0) / c.length, mv = c.reduce((a, p) => a + p.v, 0) / c.length;
  const sb = Math.sqrt(2) / (c.reduce((a, p) => a + Math.hypot(p.X - mx, p.Y - my), 0) / c.length || 1);
  const si = Math.sqrt(2) / (c.reduce((a, p) => a + Math.hypot(p.u - mu, p.v - mv), 0) / c.length || 1);
  const AtA = Array.from({ length: 9 }, () => new Array(9).fill(0));
  for (const p of c) {
    const x = (p.X - mx) * sb, y = (p.Y - my) * sb, u = (p.u - mu) * si, v = (p.v - mv) * si;
    for (const r of [[-x, -y, -1, 0, 0, 0, u * x, u * y, u], [0, 0, 0, -x, -y, -1, v * x, v * y, v]])
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) AtA[i][j] += r[i] * r[j];
  }
  const h = smallestEigenvector9(AtA);
  // denormalize: H = Ti^-1 * Hn * Tb
  const Hn = [h.slice(0, 3), h.slice(3, 6), h.slice(6, 9)];
  const Tb: number[][] = [[sb, 0, -sb * mx], [0, sb, -sb * my], [0, 0, 1]], Tiinv: number[][] = [[1 / si, 0, mu], [0, 1 / si, mv], [0, 0, 1]];
  const mul = (A: number[][], B: number[][]): number[][] => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
  const H = mul(mul(Tiinv, Hn), Tb).flat();
  return H.map((v) => v / H[8]);
}

function smallestEigenvector9(A: number[][]): number[] {
  const n = 9, a = A.map((r) => [...r]), V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  let bi = 0;
  for (let i = 1; i < n; i++) if (a[i][i] < a[bi][bi]) bi = i;
  return V.map((r) => r[bi]);
}

/** Focal length (px) from one homography, principal point known and square pixels (planar self-calibration). */
export function focalFromH(H: number[], cx: number, cy: number): number | null {
  const c = (j: number): [number, number, number] => [H[j] - cx * H[6 + j], H[3 + j] - cy * H[6 + j], H[6 + j]];
  const h1 = c(0), h2 = c(1);
  const d1 = h1[2] * h2[2], d2 = h1[2] * h1[2] - h2[2] * h2[2];
  const n1 = -(h1[0] * h2[0] + h1[1] * h2[1]), n2 = h2[0] * h2[0] + h2[1] * h2[1] - h1[0] * h1[0] - h1[1] * h1[1];
  let num = 0, den = 0;
  if (Math.abs(d1) > 1e-9) { num += n1 * d1; den += d1 * d1; }
  if (Math.abs(d2) > 1e-9) { num += n2 * d2; den += d2 * d2; }
  if (den < 1e-18) return null;
  // f^2 * d = n  for both equations: least squares f^2 = sum(n d) / sum(d^2)
  const f2 = num / den;
  return f2 > 100 ? Math.sqrt(f2) : null;
}

function rodrigues(r: number[]): number[] {
  const th = Math.hypot(r[0], r[1], r[2]);
  if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const x = r[0] / th, y = r[1] / th, z = r[2] / th, c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
function rotToVec(R: number[]): number[] {
  const tr = R[0] + R[4] + R[8], c = Math.max(-1, Math.min(1, (tr - 1) / 2)), th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  if (Math.PI - th < 1e-4) { // near 180 deg
    const x = Math.sqrt(Math.max(0, (R[0] + 1) / 2)), y = Math.sqrt(Math.max(0, (R[4] + 1) / 2)) * (R[1] < 0 ? -1 : 1), z = Math.sqrt(Math.max(0, (R[8] + 1) / 2)) * (R[2] < 0 ? -1 : 1);
    return [x * th, y * th, z * th];
  }
  const k = th / (2 * Math.sin(th));
  return [(R[7] - R[5]) * k, (R[2] - R[6]) * k, (R[3] - R[1]) * k];
}

const project = (p: number[], R: number[], t: number[], K: Intrinsics, X: number, Y: number): [number, number] => {
  const xc = R[0] * X + R[1] * Y + t[0], yc = R[3] * X + R[4] * Y + t[1], zc = R[6] * X + R[7] * Y + t[2];
  void p;
  return [K.f * xc / zc + K.cx, K.f * yc / zc + K.cy];
};

/** Pose from marker detections: homography decomposition, then Levenberg-Marquardt on the reprojection error. */
export function estimatePose(L: Layout, markers: Marker[], K: Intrinsics): { pose: Pose; H: number[] } | null {
  let corr = correspondences(L, markers);
  if (corr.length < 4) return null;
  const H = homographyDLT(corr);
  if (!H) return null;
  // K^-1 H = lambda [r1 r2 t]
  const kin = (j: number): number[] => [(H[j] - K.cx * H[6 + j]) / K.f, (H[3 + j] - K.cy * H[6 + j]) / K.f, H[6 + j]];
  const m1 = kin(0), m2 = kin(1), m3 = kin(2);
  let lam = 2 / (Math.hypot(...m1) + Math.hypot(...m2));
  if (m3[2] * lam < 0) lam = -lam;
  let r1 = m1.map((v) => v * lam), r2 = m2.map((v) => v * lam);
  const n1 = Math.hypot(...r1); r1 = r1.map((v) => v / n1);
  const d = r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2]; r2 = r2.map((v, i) => v - d * r1[i]);
  const n2 = Math.hypot(...r2); r2 = r2.map((v) => v / n2);
  const r3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  let R = [r1[0], r2[0], r3[0], r1[1], r2[1], r3[1], r1[2], r2[2], r3[2]];
  let t = m3.map((v) => v * lam);
  let x = [...rotToVec(R), ...t];

  const residuals = (p: number[], cs: Corr[]): number[] => {
    const Rm = rodrigues(p.slice(0, 3)), tm = p.slice(3, 6), out: number[] = [];
    for (const c of cs) { const [u, v] = project(p, Rm, tm, K, c.X, c.Y); out.push(u - c.u, v - c.v); }
    return out;
  };
  const rmsOf = (r: number[]) => Math.sqrt(r.reduce((a, v) => a + v * v, 0) / (r.length / 2));
  for (let pass = 0; pass < 2; pass++) {
    let mu = 1e-3, r = residuals(x, corr), cost = r.reduce((a, v) => a + v * v, 0);
    for (let it = 0; it < 15; it++) {
      const J: number[][] = [];
      for (let k = 0; k < 6; k++) {
        const e = k < 3 ? 1e-6 : 1e-3, xp = [...x]; xp[k] += e;
        const rp = residuals(xp, corr);
        J.push(rp.map((v, i) => (v - r[i]) / e));
      }
      const A = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => J[i].reduce((s, v, k) => s + v * J[j][k], 0) + (i === j ? mu * (J[i].reduce((s, v) => s + v * v, 0) + 1e-9) : 0)));
      const g = J.map((row) => -row.reduce((s, v, k) => s + v * r[k], 0));
      const dx = solve(A, g);
      if (!dx) break;
      const xn = x.map((v, i) => v + dx[i]), rn = residuals(xn, corr), cn = rn.reduce((a, v) => a + v * v, 0);
      if (cn < cost) { x = xn; r = rn; cost = cn; mu = Math.max(1e-9, mu * 0.3); if (Math.hypot(...dx) < 1e-8) break; } else mu *= 5;
    }
    if (pass === 0) { // drop outliers (a misread marker corner) and refit once
      const per = corr.map((_, i) => Math.hypot(r[2 * i], r[2 * i + 1])), med = [...per].sort((a, b) => a - b)[per.length >> 1];
      const keep = corr.filter((_, i) => per[i] <= Math.max(2.5, 3 * med));
      if (keep.length === corr.length || keep.length < 4) break;
      corr = keep;
    }
  }
  R = rodrigues(x.slice(0, 3)); t = x.slice(3, 6);
  const rms = rmsOf(residuals(x, corr));
  if (!isFinite(rms) || t[2] <= 0) return null;
  return { pose: { R, t, rms, markers: new Set(markers.map((m) => m.id)).size, points: corr.length }, H };
}

/** Camera position and viewing direction in board coordinates. */
export function cameraCenter(p: Pose): [number, number, number] {
  const R = p.R, t = p.t;
  return [-(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]), -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]), -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2])];
}

/** Collects focal-length estimates from many views (median); the pose then uses the calibrated value. */
export class FocalCalibrator {
  private vals: number[] = [];
  add(f: number | null): void { if (f && isFinite(f)) { this.vals.push(f); if (this.vals.length > 80) this.vals.shift(); } }
  get count(): number { return this.vals.length; }
  /** Median once enough views agree, else null. */
  value(minViews = 8): number | null {
    if (this.vals.length < minViews) return null;
    const s = [...this.vals].sort((a, b) => a - b);
    return s[s.length >> 1];
  }
}
