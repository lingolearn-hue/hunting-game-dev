import { Quat, rotateVec, multiply, fromAxisAngle } from '../util/quat';
import { V3, M3, add, sub, mul, dot, cross, len, norm, solve3, smallestEigenvector, median, perp, mulM } from './vec';
import { buildPyr, Pyr, trackChecked, KLT_DEFAULTS } from './klt';
import { detectCorners } from './corners';

/**
 * Rudimentary monocular visual-inertial odometry and sparse mapping in plain JS.
 *
 * The phone's orientation sensor gives the camera rotation (accurate), the camera images give the translation:
 *  - features are tracked with pyramidal Lucas-Kanade optical flow;
 *  - every pixel becomes a bearing ray in WORLD coordinates (rotation known), so the epipolar constraint
 *    t . (b1 x b2) = 0 is LINEAR in the translation t: the baseline direction is the least-squares null vector;
 *  - metric scale comes from a ground-plane prior (the phone is held at a known height, features below the horizon are floor);
 *  - afterwards the camera position follows linearly from tracked map points (known-rotation PnP),
 *    and new points are triangulated from several views (linear least squares).
 */
export interface SlamOptions {
  width: number; height: number;
  /** Field of view (deg) along the long image side. */
  fovLongDeg: number;
  /** Assumed height of the phone above the floor in meters. */
  camHeight: number;
  maxTracks?: number;
  /** How strongly the sensor rotation is trusted when refining it against the map (0 = not at all refined). Default 0.08. */
  rotationTrust?: number;
}

interface Obs { c: V3; b: V3; }
interface Track {
  id: number; x: number; y: number; b: V3;
  obs: Obs[]; map: number; age: number; init: boolean; bad: number;
  color: [number, number, number];
}
export interface MapPoint { X: V3; color: [number, number, number]; hits: number; alive: boolean; }
export interface FrameInfo { state: 'init' | 'track'; tracks: number; mapped: number; inliers: number; mapSize: number; note: string; }

const DEG = Math.PI / 180;

export class Slam {
  state: 'init' | 'track' = 'init';
  c: V3;
  q: Quat = [0, 0, 0, 1];
  map: MapPoint[] = [];
  tracks: Track[] = [];
  trail: V3[] = [];
  floorY: number;
  mapVersion = 0;
  readonly focal: number;
  private prev: Pyr | null = null;
  private nextId = 1;
  private initAge = 0;
  private maxTracks: number;
  note = 'move the phone sideways, pointing at the floor';

  constructor(private o: SlamOptions) {
    this.c = [0, o.camHeight, 0];
    this.floorY = 0;
    this.focal = Math.max(o.width, o.height) / 2 / Math.tan((o.fovLongDeg * DEG) / 2);
    this.maxTracks = o.maxTracks ?? 140;
  }

  setFov(fovLongDeg: number): void {
    this.o.fovLongDeg = fovLongDeg;
    (this as { focal: number }).focal = Math.max(this.o.width, this.o.height) / 2 / Math.tan((fovLongDeg * DEG) / 2);
  }

  /** Camera orientation (world) rotates the pixel's camera-space ray into a world bearing. */
  bearing(x: number, y: number, q: Quat = this.q): V3 {
    const d: V3 = norm([(x - this.o.width / 2) / this.focal, -(y - this.o.height / 2) / this.focal, -1]);
    return rotateVec(q, d);
  }

  /** Projects a world point into the image (null if behind the camera). */
  project(X: V3, c: V3 = this.c, q: Quat = this.q): [number, number] | null {
    const d = rotateVec([-q[0], -q[1], -q[2], q[3]], sub(X, c));
    if (d[2] >= -0.05) return null;
    return [this.o.width / 2 + (this.focal * d[0]) / -d[2], this.o.height / 2 - (this.focal * d[1]) / -d[2]];
  }

  reset(keepMap = false): void {
    this.tracks = []; this.prev = null; this.state = 'init'; this.initAge = 0;
    this.note = 'move the phone sideways, pointing at the floor';
    if (!keepMap) { this.map = []; this.trail = []; this.c = [0, this.o.camHeight, 0]; this.mapVersion++; }
  }

  /** Processes one frame. `gray` (w*h) and optional `rgba` (w*h*4) share the image size; q = camera orientation. */
  process(gray: Uint8Array, rgba: Uint8ClampedArray | null, q: Quat): FrameInfo {
    this.q = q;
    const pyr = buildPyr(gray, this.o.width, this.o.height, 3);
    if (this.prev && this.tracks.length) this.trackFlow(pyr);
    this.prev = pyr;
    for (const t of this.tracks) t.b = this.bearing(t.x, t.y);

    let inliers = 0;
    if (this.state === 'init') this.stepInit(); else inliers = this.stepTrack();
    this.replenish(gray, rgba);

    const mapped = this.tracks.filter((t) => t.map >= 0).length;
    return { state: this.state, tracks: this.tracks.length, mapped, inliers, mapSize: this.map.filter((m) => m.alive).length, note: this.note };
  }

  private trackFlow(next: Pyr): void {
    const keep: Track[] = [];
    for (const t of this.tracks) {
      const r = trackChecked(this.prev!, next, t.x, t.y, KLT_DEFAULTS);
      if (!r) continue;
      t.x = r[0]; t.y = r[1]; t.age++;
      keep.push(t);
    }
    this.tracks = keep;
  }

  private replenish(gray: Uint8Array, rgba: Uint8ClampedArray | null): void {
    if (this.tracks.length >= this.maxTracks * 0.75) return;
    const pts = detectCorners(gray, this.o.width, this.o.height, this.tracks.map((t) => [t.x, t.y]), this.maxTracks - this.tracks.length);
    for (const [x, y] of pts) {
      let color: [number, number, number] = [200, 200, 200];
      if (rgba) { const i = (Math.round(y) * this.o.width + Math.round(x)) * 4; color = [rgba[i], rgba[i + 1], rgba[i + 2]]; }
      const b = this.bearing(x, y);
      this.tracks.push({ id: this.nextId++, x, y, b, obs: [{ c: [...this.c] as V3, b }], map: -1, age: 0, init: this.state === 'init', bad: 0, color });
    }
  }

  // ---- initialization: epipolar direction + ground-plane scale ----

  private stepInit(): void {
    this.initAge++;
    const init = this.tracks.filter((t) => t.init);
    if (this.initAge > 150 || (init.length < 18 && this.initAge > 12)) { this.reset(true); this.note = 'tracking lost: restarting'; return; }
    if (init.length < 18) return;
    const par = init.map((t) => Math.acos(Math.min(1, dot(t.obs[0].b, t.b))) / DEG);
    const mp = median(par);
    if (mp < 2.5) { this.note = `move sideways (${mp.toFixed(1)}° of 2.5° parallax)`; return; }
    this.note = this.initialize(init) ?? 'ok';
  }

  /** Returns an error text, or null on success. */
  private initialize(init: Track[]): string | null {
    const c0 = init[0].obs[0].c;
    const pairs = init.map((t) => ({ t, b1: t.obs[0].b, b2: t.b, n: cross(t.obs[0].b, t.b) })).filter((p) => len(p.n) > 0.017);
    if (pairs.length < 14) return 'not enough parallax';
    // RANSAC on the baseline direction: every correspondence says t is perpendicular to n = b1 x b2
    const nn = pairs.map((p) => norm(p.n));
    let bestT: V3 | null = null, bestIn: number[] = [];
    for (let it = 0; it < 120; it++) {
      const i = (Math.random() * nn.length) | 0, j = (Math.random() * nn.length) | 0;
      if (i === j) continue;
      const t = cross(nn[i], nn[j]);
      if (len(t) < 0.1) continue;
      const tn = norm(t), ins: number[] = [];
      for (let k = 0; k < nn.length; k++) if (Math.abs(dot(tn, nn[k])) < 0.022) ins.push(k);
      if (ins.length > bestIn.length) { bestIn = ins; bestT = tn; }
    }
    if (!bestT || bestIn.length < 12) return 'cannot find the motion direction';
    // refine with all inliers (smallest eigenvector of sum n n^T)
    const M: M3 = new Array(9).fill(0);
    for (const k of bestIn) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a * 3 + b] += nn[k][a] * nn[k][b];
    let t = smallestEigenvector(M);
    // depths for a unit baseline: lam1 b1 - lam2 b2 = t. Choose the sign with positive depths.
    const depths = (tt: V3) => bestIn.map((k) => {
      const { b1, b2 } = pairs[k];
      // least squares for [lam1, lam2]: [b1, -b2] lam = tt
      const a11 = 1, a12 = -dot(b1, b2), a22 = 1;
      const r1 = dot(b1, tt), r2 = -dot(b2, tt), det = a11 * a22 - a12 * a12;
      return [(r1 * a22 - a12 * r2) / det, (a11 * r2 - a12 * r1) / det];
    });
    const pos = (tt: V3) => depths(tt).filter((d) => d[0] > 0.05 && d[1] > 0.05).length;
    const tneg = mul(t, -1);
    if (pos(tneg) > pos(t)) t = tneg;
    const dd = depths(t);
    // metric scale: floor points (well below the horizon) must lie camera-height below the camera
    const sc: number[] = [];
    bestIn.forEach((k, idx) => {
      const [l1, l2] = dd[idx], b1 = pairs[k].b1;
      if (l1 > 0.05 && l2 > 0.05 && b1[1] < -0.3) sc.push((-this.o.camHeight / b1[1]) / l1);
    });
    if (sc.length < 6) return 'point the camera at the floor while moving';
    const s = median(sc);
    const agree = sc.filter((v) => Math.abs(v / s - 1) < 0.3).length / sc.length;
    if (!(s > 0.03 && s < 3) || agree < 0.45) return `scale unclear (${(agree * 100).toFixed(0)}% agree)`;
    const c1 = add(c0, mul(t, s));

    // triangulate the inliers with both views
    let made = 0;
    bestIn.forEach((k, idx) => {
      const [l1, l2] = dd[idx], p = pairs[k];
      if (l1 <= 0.05 || l2 <= 0.05) return;
      const X = this.triangulate([{ c: c0, b: p.b1 }, { c: c1, b: p.b2 }]);
      if (X) { p.t.map = this.addPoint(X, p.t.color, 2); made++; }
    });
    if (made < 10) return 'too few points';
    this.floorY = c0[1] - this.o.camHeight;
    for (const tr of this.tracks) {
      tr.obs = tr.init ? [tr.obs[0], { c: [...c1] as V3, b: tr.b }] : [{ c: [...c1] as V3, b: tr.b }];
      tr.init = false;
    }
    this.c = c1; this.state = 'track'; this.trail.push([...c0] as V3, [...c1] as V3);
    return null;
  }

  // ---- tracking ----

  /** Linear least squares point from rays (camera centers + world bearings). */
  triangulate(obs: Obs[], maxRms = 0.012): V3 | null {
    const A: M3 = new Array(9).fill(0), r: V3 = [0, 0, 0];
    for (const o of obs) {
      const P = perp(o.b), pc = mulM(P, o.c);
      for (let i = 0; i < 9; i++) A[i] += P[i];
      r[0] += pc[0]; r[1] += pc[1]; r[2] += pc[2];
    }
    const X = solve3(A, r, 1e-4 * obs.length ** 3 * 0.01);
    if (!X) return null;
    let se = 0;
    for (const o of obs) {
      const d = sub(X, o.c), l = len(d);
      if (dot(d, o.b) < 0.3 || l > 80) return null; // behind the camera or too far
      const e = len(mulM(perp(o.b), d)) / l;
      se += e * e;
    }
    return Math.sqrt(se / obs.length) <= maxRms ? X : null;
  }

  private addPoint(X: V3, color: [number, number, number], hits: number): number {
    this.map.push({ X, color, hits, alive: true });
    this.mapVersion++;
    return this.map.length - 1;
  }

  /**
   * Camera center AND a small rotation correction from tracked map points.
   * Center with known rotation: sum (I - b b^T)(X - c) = 0 (linear). The sensor rotation is refined by a small-angle
   * correction d (b' = b + d x b), alternating with the center solve, with a prior pulling d toward 0.
   */
  private solvePose(): { c: V3; d: V3; inliers: number } | null {
    const pts = this.tracks.filter((t) => t.map >= 0 && this.map[t.map].alive);
    if (pts.length < 6) return null;
    let c = this.c, w = pts.map(() => 1), d: V3 = [0, 0, 0];
    const trust = this.o.rotationTrust ?? 0.08;
    const rot = (b: V3): V3 => add(b, cross(d, b)); // sensor bearing corrected by the current d
    for (let it = 0; it < 5; it++) {
      const A: M3 = new Array(9).fill(0), r: V3 = [0, 0, 0];
      let sw = 0;
      pts.forEach((t, i) => {
        if (!w[i]) return;
        const P = perp(norm(rot(t.b))), pX = mulM(P, this.map[t.map].X);
        for (let k = 0; k < 9; k++) A[k] += P[k];
        r[0] += pX[0]; r[1] += pX[1]; r[2] += pX[2]; sw++;
      });
      if (sw < 6) return null;
      const lam = 0.02 * sw;                          // weak pull toward the previous position (stabilizes weak geometry)
      A[0] += lam; A[4] += lam; A[8] += lam;
      r[0] += lam * this.c[0]; r[1] += lam * this.c[1]; r[2] += lam * this.c[2];
      const nc = solve3(A, r, 1e-6);
      if (!nc) return null;
      c = nc;
      const e = pts.map((t) => { const a = sub(this.map[t.map].X, c); return len(mulM(perp(norm(rot(t.b))), a)) / Math.max(0.1, len(a)); });
      const thr = Math.max(0.012, 2.5 * median(e));
      w = e.map((v) => (v < thr ? 1 : 0));
      if (trust > 0 && it >= 1) { // rotation correction given the center: minimize sum |(a x b') / |a| + J d'|^2 + mu |d + d'|^2
        const N: M3 = new Array(9).fill(0), g: V3 = [0, 0, 0];
        let n = 0;
        pts.forEach((t, i) => {
          if (!w[i]) return;
          const a = sub(this.map[t.map].X, c), la = Math.max(0.3, len(a)), b = norm(rot(t.b));
          const res = mul(cross(a, b), 1 / la), ab = dot(a, b) / la;
          // J = (a.b) I - b a^T  (all / |a|)
          const aa = mul(a, 1 / la), J = [ab - b[0] * aa[0], -b[0] * aa[1], -b[0] * aa[2], -b[1] * aa[0], ab - b[1] * aa[1], -b[1] * aa[2], -b[2] * aa[0], -b[2] * aa[1], ab - b[2] * aa[2]];
          for (let p = 0; p < 3; p++) {
            for (let q2 = 0; q2 < 3; q2++) for (let k = 0; k < 3; k++) N[p * 3 + q2] += J[k * 3 + p] * J[k * 3 + q2];
            for (let k = 0; k < 3; k++) g[p] -= J[k * 3 + p] * res[k];
          }
          n++;
        });
        const mu = Math.max(1, trust * n);
        N[0] += mu; N[4] += mu; N[8] += mu;
        g[0] -= mu * d[0]; g[1] -= mu * d[1]; g[2] -= mu * d[2];
        const dd = solve3(N, g, 1e-9);
        if (dd && len(dd) < 0.1) d = add(d, dd);
      }
    }
    const inl = w.reduce((a, b) => a + b, 0);
    if (inl < 6 || len(sub(c, this.c)) > 1.0) return null;
    return { c, d, inliers: inl };
  }

  private stepTrack(): number {
    const pose = this.solvePose();
    if (!pose) { this.reset(true); this.note = 'lost: hold still and move sideways'; return 0; }
    this.c = pose.c;
    const ang = len(pose.d);
    if (ang > 1e-6) { // apply the refined rotation to this frame (all bearings)
      this.q = multiply(fromAxisAngle(pose.d[0] / ang, pose.d[1] / ang, pose.d[2] / ang, ang), this.q);
      for (const t of this.tracks) t.b = this.bearing(t.x, t.y);
    }
    this.note = 'tracking';
    if (this.trail.length === 0 || len(sub(this.c, this.trail[this.trail.length - 1])) > 0.05) this.trail.push([...this.c] as V3);

    const keep: Track[] = [];
    for (const t of this.tracks) {
      if (t.map >= 0) {
        const mp = this.map[t.map], d = sub(mp.X, this.c), e = len(mulM(perp(t.b), d)) / Math.max(0.1, len(d));
        if (e > 0.09) { t.bad++; mp.hits -= 2; if (mp.hits <= 0) { mp.alive = false; this.mapVersion++; } if (t.bad >= 3) { t.map = -1; t.obs = [{ c: [...this.c] as V3, b: t.b }]; } }
        else if (e < 0.026) mp.hits = Math.min(60, mp.hits + 1);
      } else {
        const last = t.obs[t.obs.length - 1];
        if (len(sub(this.c, last.c)) > 0.05) { t.obs.push({ c: [...this.c] as V3, b: t.b }); if (t.obs.length > 8) t.obs.splice(1, 1); }
        const f = t.obs[0], base = len(sub(this.c, f.c)), par = Math.acos(Math.min(1, dot(f.b, t.b))) / DEG;
        if (par > 2 && base > 0.08) {
          const X = this.triangulate(t.obs);
          if (X && X[1] > this.floorY - 0.3) t.map = this.addPoint(X, t.color, 2);
        }
        if (t.map < 0 && t.age > 90) continue; // never became a point: replace
      }
      keep.push(t);
    }
    this.tracks = keep;
    return pose.inliers;
  }

  alivePoints(): MapPoint[] { return this.map.filter((m) => m.alive && m.hits >= 2); }
}
