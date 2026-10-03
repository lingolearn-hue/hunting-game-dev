export type V3 = [number, number, number];

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 3x3 matrices are row-major arrays of 9. */
export type M3 = number[];

/** Solves A x = r (Cramer). Null if (nearly) singular. */
export function solve3(A: M3, r: V3, minDet = 1e-9): V3 | null {
  const [a, b, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!isFinite(det) || Math.abs(det) < minDet) return null;
  const x = (r[0] * (e * i - f * h) - b * (r[1] * i - f * r[2]) + c * (r[1] * h - e * r[2])) / det;
  const y = (a * (r[1] * i - f * r[2]) - r[0] * (d * i - f * g) + c * (d * r[2] - r[1] * g)) / det;
  const z = (a * (e * r[2] - r[1] * h) - b * (d * r[2] - r[1] * g) + r[0] * (d * h - e * g)) / det;
  return [x, y, z];
}

/** Eigenvector of the smallest eigenvalue of a symmetric 3x3 matrix (power iteration on tr(M) I - M). */
export function smallestEigenvector(M: M3): V3 {
  const tr = M[0] + M[4] + M[8];
  const B = [tr - M[0], -M[1], -M[2], -M[3], tr - M[4], -M[5], -M[6], -M[7], tr - M[8]];
  let v: V3 = [0.577, 0.577, 0.577];
  for (let k = 0; k < 40; k++) {
    const w: V3 = [B[0] * v[0] + B[1] * v[1] + B[2] * v[2], B[3] * v[0] + B[4] * v[1] + B[5] * v[2], B[6] * v[0] + B[7] * v[1] + B[8] * v[2]];
    const l = len(w);
    if (l < 1e-12) break;
    v = [w[0] / l, w[1] / l, w[2] / l];
  }
  return v;
}

export const median = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

/** Projection matrix I - b b^T of a unit bearing (row-major). */
export function perp(b: V3): M3 {
  return [1 - b[0] * b[0], -b[0] * b[1], -b[0] * b[2], -b[1] * b[0], 1 - b[1] * b[1], -b[1] * b[2], -b[2] * b[0], -b[2] * b[1], 1 - b[2] * b[2]];
}
export const mulM = (M: M3, v: V3): V3 => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
