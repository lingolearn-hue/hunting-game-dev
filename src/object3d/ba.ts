/**
 * Bundle adjustment (plain JS): refines camera rotations and positions, a shared focal length and 3D points by
 * minimizing the reprojection error (Levenberg-Marquardt with the Schur complement, Huber weights).
 * Camera convention: R maps camera -> world (columns = camera axes), camera looks along -z, y up; world y up.
 *   u = cx + f x/(-z),  v = cy - f y/(-z)   with  (x, y, z) = R^T (X - c).
 */
export type V3 = [number, number, number];
export interface BACam { R: number[]; c: V3; }
export interface BAObs { cam: number; pt: number; u: number; v: number; }
export interface BAProblem {
  cams: BACam[]; pts: V3[]; obs: BAObs[];
  f: number; cx: number; cy: number;
  /** Prior rotations (from the sensors); the adjustment may deviate from them but is pulled back. */
  priorR: number[][];
}
export interface BAOptions { iters?: number; rotSigmaDeg?: number; fSigma?: number; huber?: number; fixFocal?: boolean; }
export interface BAResult { rmsBefore: number; rmsAfter: number; iterations: number; observations: number; dropped: number; }

const skewExp = (w: V3): number[] => {
  const th = Math.hypot(w[0], w[1], w[2]);
  if (th < 1e-14) return [1, -w[2], w[1], w[2], 1, -w[0], -w[1], w[0], 1];
  const x = w[0] / th, y = w[1] / th, z = w[2] / th, c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
};
const mul3 = (A: number[], B: number[]): number[] => [
  A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
  A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
  A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8]];
const tr3 = (A: number[]): number[] => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
function logRot(R: number[]): V3 {
  const c = Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2)), th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  const k = th / (2 * Math.sin(th));
  return [(R[7] - R[5]) * k, (R[2] - R[6]) * k, (R[3] - R[1]) * k];
}

export function project(R: number[], c: V3, X: V3, f: number, cx: number, cy: number): [number, number] | null {
  const dx = X[0] - c[0], dy = X[1] - c[1], dz = X[2] - c[2];
  const x = R[0] * dx + R[3] * dy + R[6] * dz, y = R[1] * dx + R[4] * dy + R[7] * dz, z = R[2] * dx + R[5] * dy + R[8] * dz;
  if (-z < 1e-3) return null;
  return [cx + (f * x) / -z, cy - (f * y) / -z];
}

function cholSolve(A: Float64Array, n: number, b: Float64Array): Float64Array | null {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) { if (s <= 1e-14) return null; L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
    }
  }
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

function inv3(M: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = M, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-30) return null;
  const k = 1 / det;
  return [(e * i - f * h) * k, (c * h - b * i) * k, (b * f - c * e) * k, (f * g - d * i) * k, (a * i - c * g) * k, (c * d - a * f) * k, (d * h - e * g) * k, (b * g - a * h) * k, (a * e - b * d) * k];
}

export function bundleAdjust(P: BAProblem, o: BAOptions = {}): BAResult {
  const N = P.cams.length, D = 6 * N + 1, iters = o.iters ?? 12, huber = o.huber ?? 2.0;
  const wRot = 1 / (((o.rotSigmaDeg ?? 2.5) * Math.PI) / 180) ** 2, f0 = P.f, wF = 1 / ((o.fSigma ?? 0.15) * f0) ** 2;
  const c0 = P.cams.map((c) => [...c.c] as V3);
  // group observations by point; points with fewer than 2 observations are not adjusted
  const byPt: number[][] = P.pts.map(() => []);
  P.obs.forEach((ob, i) => byPt[ob.pt].push(i));
  const w = new Float64Array(P.obs.length).fill(1);
  const residual = (i: number, cams: BACam[], pts: V3[], f: number): [number, number] | null => {
    const ob = P.obs[i], q = project(cams[ob.cam].R, cams[ob.cam].c, pts[ob.pt], f, P.cx, P.cy);
    return q ? [q[0] - ob.u, q[1] - ob.v] : null;
  };
  const rmsOf = (cams: BACam[], pts: V3[], f: number): number => {
    let s = 0, n = 0;
    P.obs.forEach((_, i) => { if (!w[i]) return; const r = residual(i, cams, pts, f); if (r) { s += r[0] ** 2 + r[1] ** 2; n++; } });
    return n ? Math.sqrt(s / n / 2) : NaN;
  };
  const reweight = (): number => {
    let dropped = 0;
    P.obs.forEach((_, i) => {
      const r = residual(i, P.cams, P.pts, P.f);
      if (!r) { w[i] = 0; dropped++; return; }
      const e = Math.hypot(r[0], r[1]);
      if (e > 4 * huber) { w[i] = 0; dropped++; } else w[i] = e <= huber ? 1 : huber / e;
    });
    return dropped;
  };
  const cost = (cams: BACam[], pts: V3[], f: number): number => {
    let s = 0;
    P.obs.forEach((_, i) => { if (!w[i]) return; const r = residual(i, cams, pts, f); if (r) s += w[i] * (r[0] ** 2 + r[1] ** 2); else s += 1e6; });
    for (let k = 0; k < N; k++) { const d = logRot(mul3(cams[k].R, tr3(P.priorR[k]))); s += wRot * (d[0] ** 2 + d[1] ** 2 + d[2] ** 2); }
    s += wF * (f - f0) ** 2;
    return s;
  };

  const before = rmsOf(P.cams, P.pts, P.f);
  let dropped = reweight(), mu = 1e-3, it = 0;
  let cur = cost(P.cams, P.pts, P.f);
  for (; it < iters; it++) {
    const H = new Float64Array(D * D), g = new Float64Array(D);
    const V: number[][] = P.pts.map(() => new Array(9).fill(0)), gp: V3[] = P.pts.map(() => [0, 0, 0]);
    const W: Array<number[] | null> = new Array(P.obs.length).fill(null);   // 7x3 per observation
    for (let i = 0; i < P.obs.length; i++) {
      if (!w[i] || byPt[P.obs[i].pt].length < 2) continue;
      const ob = P.obs[i], cam = P.cams[ob.cam], X = P.pts[ob.pt];
      const r0 = residual(i, P.cams, P.pts, P.f);
      if (!r0) continue;
      const Jc: number[][] = [], Jp: number[][] = [];     // columns as [du, dv]
      for (let a = 0; a < 3; a++) {                        // rotation (world-frame perturbation)
        const e: V3 = [0, 0, 0]; e[a] = 1e-6;
        const q = project(mul3(skewExp(e), cam.R), cam.c, X, P.f, P.cx, P.cy);
        Jc.push(q ? [(q[0] - ob.u - r0[0]) / 1e-6, (q[1] - ob.v - r0[1]) / 1e-6] : [0, 0]);
      }
      for (let a = 0; a < 3; a++) {                        // position
        const c2: V3 = [...cam.c]; c2[a] += 1e-4;
        const q = project(cam.R, c2, X, P.f, P.cx, P.cy);
        Jc.push(q ? [(q[0] - ob.u - r0[0]) / 1e-4, (q[1] - ob.v - r0[1]) / 1e-4] : [0, 0]);
      }
      const qf = project(cam.R, cam.c, X, P.f + 1e-2, P.cx, P.cy);
      Jc.push(qf ? [(qf[0] - ob.u - r0[0]) / 1e-2, (qf[1] - ob.v - r0[1]) / 1e-2] : [0, 0]);   // focal
      for (let a = 0; a < 3; a++) {                        // point
        const X2: V3 = [...X]; X2[a] += 1e-4;
        const q = project(cam.R, cam.c, X2, P.f, P.cx, P.cy);
        Jp.push(q ? [(q[0] - ob.u - r0[0]) / 1e-4, (q[1] - ob.v - r0[1]) / 1e-4] : [0, 0]);
      }
      const idx = [6 * ob.cam, 6 * ob.cam + 1, 6 * ob.cam + 2, 6 * ob.cam + 3, 6 * ob.cam + 4, 6 * ob.cam + 5, 6 * N];
      for (let a = 0; a < 7; a++) {
        for (let b = 0; b < 7; b++) H[idx[a] * D + idx[b]] += w[i] * (Jc[a][0] * Jc[b][0] + Jc[a][1] * Jc[b][1]);
        g[idx[a]] -= w[i] * (Jc[a][0] * r0[0] + Jc[a][1] * r0[1]);
      }
      const Vj = V[ob.pt], gj = gp[ob.pt];
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) Vj[a * 3 + b] += w[i] * (Jp[a][0] * Jp[b][0] + Jp[a][1] * Jp[b][1]);
        gj[a] -= w[i] * (Jp[a][0] * r0[0] + Jp[a][1] * r0[1]);
      }
      const Wi = new Array(21);
      for (let a = 0; a < 7; a++) for (let b = 0; b < 3; b++) Wi[a * 3 + b] = w[i] * (Jc[a][0] * Jp[b][0] + Jc[a][1] * Jp[b][1]);
      W[i] = Wi;
    }
    // priors: gauge (camera 0 fixed), sensor rotations, positions (very weak), focal
    for (let a = 0; a < 6; a++) H[a * D + a] += 1e8;
    for (let k = 0; k < N; k++) {
      const d = logRot(mul3(P.cams[k].R, tr3(P.priorR[k])));
      for (let a = 0; a < 3; a++) { H[(6 * k + a) * D + 6 * k + a] += wRot; g[6 * k + a] -= wRot * d[a]; }
      for (let a = 3; a < 6; a++) { H[(6 * k + a) * D + 6 * k + a] += 1e-3; g[6 * k + a] -= 1e-3 * (P.cams[k].c[a - 3] - c0[k][a - 3]); }
    }
    H[6 * N * D + 6 * N] += wF; g[6 * N] -= wF * (P.f - f0);
    if (o.fixFocal) H[6 * N * D + 6 * N] += 1e12;

    // Schur complement with damping, retry with a larger mu if the step does not help
    let accepted = false;
    for (let attempt = 0; attempt < 6 && !accepted; attempt++) {
      const S = H.slice(), b = g.slice();
      for (let a = 0; a < D; a++) S[a * D + a] *= 1 + mu;
      const Vinv: Array<number[] | null> = V.map((Vj) => { const M = Vj.slice(); for (const d of [0, 4, 8]) M[d] = M[d] * (1 + mu) + 1e-9; return inv3(M); });
      for (let j = 0; j < P.pts.length; j++) {
        const vi = Vinv[j]; if (!vi) continue;
        const list = byPt[j].filter((i) => W[i]);
        if (list.length < 2) continue;
        const T = list.map((i) => { const Wi = W[i]!, Ti = new Array(21); for (let a = 0; a < 7; a++) for (let c = 0; c < 3; c++) Ti[a * 3 + c] = Wi[a * 3] * vi[c] + Wi[a * 3 + 1] * vi[3 + c] + Wi[a * 3 + 2] * vi[6 + c]; return Ti; });
        const ids = list.map((i) => { const k = P.obs[i].cam; return [6 * k, 6 * k + 1, 6 * k + 2, 6 * k + 3, 6 * k + 4, 6 * k + 5, 6 * N]; });
        for (let p = 0; p < list.length; p++) {
          const Tp = T[p];
          for (let a = 0; a < 7; a++) b[ids[p][a]] -= Tp[a * 3] * gp[j][0] + Tp[a * 3 + 1] * gp[j][1] + Tp[a * 3 + 2] * gp[j][2];
          for (let q = 0; q < list.length; q++) {
            const Wq = W[list[q]]!;
            for (let a = 0; a < 7; a++) for (let c = 0; c < 7; c++) S[ids[p][a] * D + ids[q][c]] -= Tp[a * 3] * Wq[c * 3] + Tp[a * 3 + 1] * Wq[c * 3 + 1] + Tp[a * 3 + 2] * Wq[c * 3 + 2];
          }
        }
      }
      const delta = cholSolve(S, D, b);
      if (!delta) { mu *= 10; continue; }
      const cams2: BACam[] = P.cams.map((c, k) => ({ R: mul3(skewExp([delta[6 * k], delta[6 * k + 1], delta[6 * k + 2]]), c.R), c: [c.c[0] + delta[6 * k + 3], c.c[1] + delta[6 * k + 4], c.c[2] + delta[6 * k + 5]] as V3 }));
      const f2 = P.f + delta[6 * N];
      const pts2: V3[] = P.pts.map((X, j) => {
        const vi = Vinv[j]; if (!vi) return X;
        const rhs: V3 = [gp[j][0], gp[j][1], gp[j][2]];
        for (const i of byPt[j]) {
          const Wi = W[i]; if (!Wi) continue;
          const ids = [6 * P.obs[i].cam, 6 * P.obs[i].cam + 1, 6 * P.obs[i].cam + 2, 6 * P.obs[i].cam + 3, 6 * P.obs[i].cam + 4, 6 * P.obs[i].cam + 5, 6 * N];
          for (let c = 0; c < 3; c++) for (let a = 0; a < 7; a++) rhs[c] -= Wi[a * 3 + c] * delta[ids[a]];
        }
        return [X[0] + vi[0] * rhs[0] + vi[1] * rhs[1] + vi[2] * rhs[2], X[1] + vi[3] * rhs[0] + vi[4] * rhs[1] + vi[5] * rhs[2], X[2] + vi[6] * rhs[0] + vi[7] * rhs[1] + vi[8] * rhs[2]];
      });
      const c2 = cost(cams2, pts2, f2);
      if (c2 < cur) {
        const gain = cur - c2;
        P.cams.splice(0, N, ...cams2); P.pts.splice(0, P.pts.length, ...pts2); P.f = f2; cur = c2; mu = Math.max(1e-7, mu * 0.4); accepted = true;
        if (gain < 1e-6 * cur) it = iters;     // converged
      } else mu *= 5;
    }
    if (!accepted) break;
    if (it === 3 || it === 7) { dropped = reweight(); cur = cost(P.cams, P.pts, P.f); }
  }
  dropped = reweight();
  return { rmsBefore: before, rmsAfter: rmsOf(P.cams, P.pts, P.f), iterations: it, observations: w.reduce((a, v) => a + (v > 0 ? 1 : 0), 0), dropped };
}

export { skewExp, mul3, tr3, logRot };
