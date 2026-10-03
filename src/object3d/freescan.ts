import { Slam, Track } from '../slam/Slam';
import { buildPyr, trackPoint, KLT_DEFAULTS, Pyr } from '../slam/klt';
import { Quat } from '../util/quat';
import { bundleAdjust, BAProblem, BAObs, project, V3 } from './ba';
import { Hull, Keyframe } from './carve';

/**
 * Markerless object scan. Live: the visual-inertial tracker (Slam) follows features while the user walks around the
 * object; keyframes store the tracks. Build:
 *   1. bundle adjustment over all keyframes (poses, 3D points, focal length),
 *   2. loop closure: points are re-found in keyframes the camera comes back to, then adjust again,
 *   3. the table = lowest dominant horizontal plane of the points (gravity from the sensors),
 *   4. table mask per image: a pixel on the table looks the same when warped into other views through the plane
 *      homography; the object (above the plane) does not. Matching pixels are known background,
 *   5. silhouette carving of a voxel cube (carve.ts), gap filling to the table, floating parts removed.
 */
export interface KfRec {
  q: Quat; c: V3;
  obs: Array<{ id: number; x: number; y: number; map: number }>;
  g320: Uint8Array; g640: Uint8Array; color: Uint8ClampedArray; cw: number; ch: number;
}
export interface BuildInfo {
  keyframes: number; tracks: number; observations: number; rmsBefore: number; rmsAfter: number; loopObs: number; focal320: number;
  tableY: number; tablePoints: number; centre: [number, number]; sizeMm: number; maskPct: number; carved: number;
}
export const UNIT_MM = 100;        // the tracker works in decimetres

export function quatToMat(q: Quat): number[] {
  const [x, y, z, w] = q, n = Math.hypot(x, y, z, w) || 1, a = x / n, b = y / n, c = z / n, d = w / n;
  return [1 - 2 * (b * b + c * c), 2 * (a * b - c * d), 2 * (a * c + b * d), 2 * (a * b + c * d), 1 - 2 * (a * a + c * c), 2 * (b * c - a * d), 2 * (a * c - b * d), 2 * (b * c + a * d), 1 - 2 * (a * a + b * b)];
}

export class FreeScan {
  kfs: KfRec[] = [];
  w = 320; h = 240;
  constructor(readonly slam: Slam) { this.w = slam.size().w; this.h = slam.size().h; }

  addKeyframe(g320: Uint8Array, g640: Uint8Array, color: Uint8ClampedArray, cw: number, ch: number): void {
    const s = this.slam;
    this.kfs.push({
      q: [...s.q] as Quat, c: [...s.c] as V3,
      obs: s.tracks.map((t: Track) => ({ id: t.id, x: t.x, y: t.y, map: t.map })),
      g320: g320.slice(), g640, color, cw, ch,
    });
  }

  /** Runs the whole reconstruction. `progress` is called between the stages. */
  async build(opt: { sizeMm?: number; refine?: boolean }, progress: (msg: string) => Promise<void> | void = () => {}): Promise<{ info: BuildInfo; hull: Hull; carveKfs: Keyframe[] } | string> {
    const kfs = this.kfs, N = kfs.length, slam = this.slam;
    if (N < 8) return 'Need at least 8 keyframes (walk around the object)';
    await progress('collecting tracks…');
    // ---- tracks and initial points ----
    const byId = new Map<number, Array<{ k: number; x: number; y: number; map: number }>>();
    kfs.forEach((kf, k) => kf.obs.forEach((o) => { const a = byId.get(o.id) ?? []; a.push({ k, x: o.x, y: o.y, map: o.map }); byId.set(o.id, a); }));
    const R = kfs.map((kf) => quatToMat(kf.q));
    const ids: number[] = [], pts: V3[] = [], obs: BAObs[] = [];
    for (const [id, list] of byId) {
      if (list.length < 3) continue;
      let X: V3 | null = null;
      for (let i = list.length - 1; i >= 0 && !X; i--) { const m = list[i].map >= 0 ? slam.map[list[i].map] : null; if (m && m.alive) X = [...m.X] as V3; }
      if (!X) { const o = list.map((e) => ({ c: kfs[e.k].c, b: slam.bearing(e.x, e.y, kfs[e.k].q) })); X = slam.triangulate(o, 0.02); }
      if (!X) continue;
      const pi = pts.length; ids.push(id); pts.push(X);
      for (const e of list.length > 40 ? list.filter((_, i) => i % Math.ceil(list.length / 40) === 0) : list) obs.push({ cam: e.k, pt: pi, u: e.x, v: e.y });
    }
    if (pts.length < 40) return 'Too few tracked features: the surface needs more texture';
    const P: BAProblem = { cams: kfs.map((kf, k) => ({ R: R[k].slice(), c: [...kf.c] as V3 })), pts, obs, f: slam.focal, cx: this.w / 2, cy: this.h / 2, priorR: R.map((r) => r.slice()) };
    await progress(`bundle adjustment (${N} views, ${pts.length} points)…`);
    await tick();
    const ba1 = bundleAdjust(P, { iters: 12 });

    // ---- loop closure: re-observe points in keyframes the camera returns to ----
    await progress('closing the loop…');
    await tick();
    const pyr: Pyr[] = kfs.map((kf) => buildPyr(kf.g320, this.w, this.h, 3));
    const seen = new Set(obs.map((o) => o.cam * 1e6 + o.pt));
    const fwd = P.cams.map((c) => [-c.R[2], -c.R[5], -c.R[8]]);
    const byCam: number[][] = kfs.map(() => []);
    obs.forEach((o, i) => byCam[o.cam].push(i));
    let loopObs = 0;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      if (Math.abs(a - b) < 8) continue;
      const dot = fwd[a][0] * fwd[b][0] + fwd[a][1] * fwd[b][1] + fwd[a][2] * fwd[b][2];
      if (dot < Math.cos((30 * Math.PI) / 180)) continue;
      for (const oi of byCam[a]) {
        const o = obs[oi]; if (seen.has(b * 1e6 + o.pt)) continue;
        const pred = project(P.cams[b].R, P.cams[b].c, P.pts[o.pt], P.f, P.cx, P.cy);
        if (!pred || pred[0] < 14 || pred[1] < 14 || pred[0] > this.w - 14 || pred[1] > this.h - 14) continue;
        const g: [number, number] = [pred[0] - o.u, pred[1] - o.v];
        const f1 = trackPoint(pyr[a], pyr[b], o.u, o.v, KLT_DEFAULTS, g);
        if (!f1 || Math.hypot(f1[0] - pred[0], f1[1] - pred[1]) > 8) continue;
        const back = trackPoint(pyr[b], pyr[a], f1[0], f1[1], KLT_DEFAULTS, [-g[0], -g[1]]);
        if (!back || Math.hypot(back[0] - o.u, back[1] - o.v) > 1.0) continue;
        obs.push({ cam: b, pt: o.pt, u: f1[0], v: f1[1] }); seen.add(b * 1e6 + o.pt); loopObs++;
      }
    }
    await progress(`bundle adjustment again (+${loopObs} loop observations)…`);
    await tick();
    const ba2 = bundleAdjust(P, { iters: 12 });

    // ---- table plane: lowest dominant horizontal plane ----
    await progress('finding the table…');
    const good = P.pts.filter((_, j) => obs.filter((o) => o.pt === j).length >= 3 && isFinite(P.pts[j][1]));
    const ys = good.map((p) => p[1]).sort((x, y) => x - y);
    const lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.floor(ys.length * 0.98)], binW = 0.2;     // 2 mm bins
    const nb = Math.max(3, Math.ceil((hi - lo) / binW) + 1), hist = new Array(nb).fill(0);
    for (const y of ys) if (y >= lo && y <= hi) hist[Math.min(nb - 1, Math.floor((y - lo) / binW))]++;
    const smooth = hist.map((_, i) => (hist[i - 1] ?? 0) + hist[i] + (hist[i + 1] ?? 0)), maxC = Math.max(...smooth);
    let bi = 0;
    for (let i = 0; i < nb; i++) if (smooth[i] >= 0.3 * maxC && (smooth[i] >= (smooth[i - 1] ?? 0)) && (smooth[i] >= (smooth[i + 1] ?? 0))) { bi = i; break; }   // lowest strong peak
    const near = good.filter((p) => Math.abs(p[1] - (lo + (bi + 0.5) * binW)) < 0.4).map((p) => p[1]).sort((x, y) => x - y);
    const tableY = near.length ? near[near.length >> 1] : lo;
    // ---- object centre and cube ----
    const cams = P.cams;
    const cxm = cams.reduce((a, c) => a + c.c[0], 0) / N, czm = cams.reduce((a, c) => a + c.c[2], 0) / N;
    const camR = [...cams.map((c) => Math.hypot(c.c[0] - cxm, c.c[2] - czm))].sort((x, y) => x - y)[N >> 1];
    let objPts = good.filter((p) => p[1] - tableY > 0.06 * camR && p[1] - tableY < 1.2 * camR && Math.hypot(p[0] - cxm, p[2] - czm) < 0.6 * camR);
    let ox = cxm, oz = czm;
    if (objPts.length >= 12) {
      const xs = objPts.map((p) => p[0]).sort((a, b) => a - b), zs = objPts.map((p) => p[2]).sort((a, b) => a - b);
      ox = xs[xs.length >> 1]; oz = zs[zs.length >> 1];
      objPts = objPts.filter((p) => Math.hypot(p[0] - ox, p[2] - oz) < 0.45 * camR);
    }
    let ext = 0.25 * camR, top = 0.3 * camR;
    if (objPts.length >= 8) {
      const r = objPts.map((p) => Math.hypot(p[0] - ox, p[2] - oz)).sort((a, b) => a - b), hz = objPts.map((p) => p[1] - tableY).sort((a, b) => a - b);
      ext = r[Math.floor(r.length * 0.92)]; top = hz[Math.floor(hz.length * 0.95)];
    }
    const sizeDm = opt.sizeMm ? opt.sizeMm / UNIT_MM : Math.min(1.1 * camR, Math.max(2 * ext * 1.3, top * 1.35, 0.9));
    const sizeMm = sizeDm * UNIT_MM;

    // ---- masks, carving ----
    await progress('computing table masks…');
    const W2 = this.w * 2, H2 = this.h * 2, f640 = 2 * P.f, cx640 = W2 / 2, cy640 = H2 / 2;   // keyframe images are twice the tracker size
    const hull = new Hull(64, sizeMm);
    const carveKfs: Keyframe[] = [];
    const Msw = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];            // board -> world axes (board X = world x, Y = -z, Z = up)
    let maskSum = 0;
    const gains: number[] = [];
    for (let a = 0; a < N; a++) {
      const kf = kfs[a], Rcw = P.cams[a].R, c = P.cams[a].c;
      // partners: 6-28 degrees apart, up to 4
      const cand = kfs.map((_, b) => ({ b, ang: Math.acos(Math.max(-1, Math.min(1, fwd[a][0] * fwd[b][0] + fwd[a][1] * fwd[b][1] + fwd[a][2] * fwd[b][2]))) * 180 / Math.PI }))
        .filter((e) => e.b !== a && e.ang > 6 && e.ang < 28).sort((x, y) => Math.abs(x.ang - 14) - Math.abs(y.ang - 14)).slice(0, 4);
      const roi = this.roi(P, a, [ox, tableY, oz], sizeDm, f640, cx640, cy640, W2, H2);
      let mask: Uint8Array = new Uint8Array(W2 * H2);
      if (cand.length >= 2 && roi) {
        const planeY = tableY;
        for (const { b } of cand) {
          const m = this.planeMatch(kf.g640, kfs[b].g640, Rcw, c, P.cams[b].R, P.cams[b].c, planeY, f640, cx640, cy640, roi, W2, H2);
          for (let i = 0; i < mask.length; i++) if (m[i]) mask[i] = 1;
        }
        mask = erode1(mask, W2, H2);
      }
      let cnt = 0; for (let i = 0; i < mask.length; i += 11) cnt += mask[i];
      maskSum += cnt / (mask.length / 11);
      let mean = 0, nm = 0; for (let i = 0; i < kf.g640.length; i += 13) { mean += kf.g640[i]; nm++; } gains.push(mean / nm);
      // board-frame pose (OpenCV camera: x right, y down, z forward), millimetres, origin = cube centre on the table
      const RT = [Rcw[0], Rcw[3], Rcw[6], Rcw[1], Rcw[4], Rcw[7], Rcw[2], Rcw[5], Rcw[8]];                // Rcw^T
      const RM = [0, 1, 2].map((i) => [0, 1, 2].map((j) => RT[i * 3] * Msw[0][j] + RT[i * 3 + 1] * Msw[1][j] + RT[i * 3 + 2] * Msw[2][j]));
      const Rb = [RM[0][0], RM[0][1], RM[0][2], -RM[1][0], -RM[1][1], -RM[1][2], -RM[2][0], -RM[2][1], -RM[2][2]];
      const d: V3 = [ox - c[0], tableY - c[1], oz - c[2]];
      const tcam = [0, 1, 2].map((i) => UNIT_MM * (RT[i * 3] * d[0] + RT[i * 3 + 1] * d[1] + RT[i * 3 + 2] * d[2]));
      const t = [tcam[0], -tcam[1], -tcam[2]];
      const cb: V3 = [(c[0] - ox) * UNIT_MM, -(c[2] - oz) * UNIT_MM, (c[1] - tableY) * UNIT_MM];
      carveKfs.push({ R: Rb, t, K: { f: f640, cx: cx640, cy: cy640 }, w: W2, h: H2, bg: mask, color: kf.color, cw: kf.cw, ch: kf.ch, center: cb, gray: kf.g640, gain: 1 });
      if (a % 6 === 0) { await progress(`table masks ${a + 1}/${N}…`); await tick(); }
    }
    const gm = gains.reduce((x, y) => x + y, 0) / gains.length;
    carveKfs.forEach((k, i) => { k.gain = gains[i] / gm; });
    await progress('carving…');
    for (const k of carveKfs) hull.carve(k);
    hull.keepLargest();
    fillToTable(hull, 3);
    let carved = 0; for (let i = 0; i < hull.occ.length; i++) if (!hull.occ[i]) carved++;
    if (opt.refine) { hull.refine(carveKfs, { std: 20, passes: 14 }); hull.keepLargest(); }
    const info: BuildInfo = {
      keyframes: N, tracks: pts.length, observations: obs.length, rmsBefore: ba1.rmsBefore, rmsAfter: ba2.rmsAfter, loopObs, focal320: P.f,
      tableY, tablePoints: near.length, centre: [ox, oz], sizeMm, maskPct: (maskSum / N) * 100, carved,
    };
    return { info, hull, carveKfs };
  }

  /** Bounding box (px at 640x480) of the cube above the table in keyframe a. */
  private roi(P: BAProblem, a: number, o: V3, sizeDm: number, f: number, cx: number, cy: number, W: number, H: number): [number, number, number, number] | null {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const hh of [0, 1]) {
      const q = project(P.cams[a].R, P.cams[a].c, [o[0] + (sx * sizeDm) / 2, o[1] + hh * sizeDm, o[2] + (sz * sizeDm) / 2], f, cx, cy);
      if (!q) return null;
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    const m = 36;
    x0 = Math.max(8, Math.floor(x0 - m)); y0 = Math.max(8, Math.floor(y0 - m)); x1 = Math.min(W - 9, Math.ceil(x1 + m)); y1 = Math.min(H - 9, Math.ceil(y1 + m));
    return x1 - x0 > 20 && y1 - y0 > 20 ? [x0, y0, x1, y1] : null;
  }

  /**
   * Plane-induced warp of view B into view A and windowed NCC: 1 where A and the warped B agree (table), else 0.
   * Objects above the plane are shifted by parallax and do not agree.
   */
  private planeMatch(A: Uint8Array, B: Uint8Array, Ra: number[], ca: V3, Rb: number[], cb: V3, planeY: number, f: number, cx: number, cy: number, roi: [number, number, number, number], W: number, H: number): Uint8Array {
    const [x0, y0, x1, y1] = roi, bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const Wp = new Float32Array(bw * bh), valid = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const dx = (x0 + x + 0.5 - cx) / f, dy = -(y0 + y + 0.5 - cy) / f;
      const wx = Ra[0] * dx + Ra[1] * dy - Ra[2], wy = Ra[3] * dx + Ra[4] * dy - Ra[5], wz = Ra[6] * dx + Ra[7] * dy - Ra[8];
      if (wy > -1e-6) continue;
      const t = (planeY - ca[1]) / wy; if (t <= 0) continue;
      const X: V3 = [ca[0] + t * wx, planeY, ca[2] + t * wz];
      const q = project(Rb, cb, X, f, cx, cy);
      if (!q || q[0] < 3 || q[1] < 3 || q[0] > W - 4 || q[1] > H - 4) continue;
      const u = q[0] - 0.5, v = q[1] - 0.5, ux = u | 0, vy = v | 0, fx = u - ux, fy = v - vy, o = vy * W + ux;
      Wp[y * bw + x] = (B[o] * (1 - fx) + B[o + 1] * fx) * (1 - fy) + (B[o + W] * (1 - fx) + B[o + W + 1] * fx) * fy;
      valid[y * bw + x] = 1;
    }
    const iw = bw + 1, n = iw * (bh + 1);
    const sI = new Float64Array(n), sE = new Float64Array(n), sII = new Float64Array(n), sEE = new Float64Array(n), sIE = new Float64Array(n), sV = new Float64Array(n);
    for (let y = 0; y < bh; y++) {
      let rI = 0, rE = 0, rII = 0, rEE = 0, rIE = 0, rV = 0;
      for (let x = 0; x < bw; x++) {
        const i = A[(y0 + y) * W + x0 + x], e = Wp[y * bw + x];
        rI += i; rE += e; rII += i * i; rEE += e * e; rIE += i * e; rV += valid[y * bw + x];
        const k = (y + 1) * iw + x + 1, up = y * iw + x + 1;
        sI[k] = sI[up] + rI; sE[k] = sE[up] + rE; sII[k] = sII[up] + rII; sEE[k] = sEE[up] + rEE; sIE[k] = sIE[up] + rIE; sV[k] = sV[up] + rV;
      }
    }
    const win = 5, area = (2 * win + 1) ** 2, out = new Uint8Array(W * H);
    const rect = (S: Float64Array, x: number, y: number) => S[(y + win + 1) * iw + x + win + 1] - S[(y - win) * iw + x + win + 1] - S[(y + win + 1) * iw + x - win] + S[(y - win) * iw + x - win];
    for (let y = win; y < bh - win; y++) for (let x = win; x < bw - win; x++) {
      if (rect(sV, x, y) < area) continue;
      const vE = rect(sEE, x, y) - rect(sE, x, y) ** 2 / area, vI = rect(sII, x, y) - rect(sI, x, y) ** 2 / area;
      if (vE < area * 8 || vI < area * 8) continue;
      const cov = rect(sIE, x, y) - rect(sI, x, y) * rect(sE, x, y) / area;
      if (cov / Math.sqrt(vI * vE) > 0.72) out[(y0 + y) * W + x0 + x] = 1;
    }
    return out;
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function erode1(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w]) out[i] = 1;
  }
  return out;
}

/** The object stands on the table: columns whose lowest voxel floats a little (the table test is blind near the table) are filled down. */
export function fillToTable(hull: Hull, maxGapVox: number): void {
  const n = hull.n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let k0 = -1;
    for (let k = 0; k < n; k++) if (hull.occ[hull.idx(i, j, k)]) { k0 = k; break; }
    if (k0 > 0 && k0 <= maxGapVox) for (let k = 0; k < k0; k++) hull.occ[hull.idx(i, j, k)] = 1;
  }
  hull.version++;
}
