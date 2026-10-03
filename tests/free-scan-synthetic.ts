/**
 * Markerless object scan on a synthetic scene: textured table, object, handheld-like orbit (one helix) with realistic
 * sensor error. Runs the real tracker (Slam) and the real FreeScan pipeline. Frames are cached on disk.
 * Run: npx tsx tests/free-scan-synthetic.ts [box|snowman|lshape]
 */
import * as fs from 'fs';
import { Slam } from '../src/slam/Slam';
import { FreeScan, quatToMat, UNIT_MM } from '../src/object3d/freescan';
import { lookAt, renderView, Scene, inside, V3 } from './object-render';
import { Quat } from '../src/util/quat';

const DEG = Math.PI / 180;
export const scenes: Record<string, Scene> = {
  box: { tint: 140, shapes: [{ kind: 'box', cx: 0, cy: 0, hx: 30, hy: 20, h: 50, rot: 20 * DEG }] },
  snowman: { tint: 170, shapes: [{ kind: 'cyl', cx: 0, cy: 0, r: 28, z0: 0, z1: 38 }, { kind: 'sphere', cx: 0, cy: 0, cz: 58, r: 22 }] },
  lshape: { tint: 120, shapes: [{ kind: 'box', cx: -12, cy: 0, hx: 40, hy: 15, h: 40, rot: 0 }, { kind: 'box', cx: -37, cy: 22, hx: 15, hy: 22, h: 40, rot: 0 }] },
};

const matToQuat = (m: number[]): Quat => {
  const t = m[0] + m[4] + m[8];
  let x, y, z, w;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = 0.25 * s; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s; }
  else if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / s; x = 0.25 * s; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s; }
  else if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = 0.25 * s; z = (m[5] + m[7]) / s; }
  else { const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = 0.25 * s; }
  return [x, y, z, w];
};
const mul = (a: Quat, b: Quat): Quat => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const axisQ = (x: number, y: number, z: number, a: number): Quat => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

/** Camera pose of frame i of n on the helix (board mm). */
export function orbitPose(i: number, n: number): { eye: V3; target: V3 } {
  const u = i / (n - 1), az = u * 372 * DEG, el = (30 + 24 * u + 3 * Math.sin(u * 9)) * DEG, dist = 340 + 20 * Math.sin(u * 13);
  return { eye: [dist * Math.cos(el) * Math.cos(az), dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el)], target: [0, 0, 22] };
}

/** True camera -> world rotation in the tracker's convention (world y up = board z; world z = -board y). */
export function trackerQuat(cam: { R: number[] }): Quat {
  const row = (i: number): V3 => [cam.R[i * 3], cam.R[i * 3 + 1], cam.R[i * 3 + 2]];
  const toW = (v: V3): V3 => [v[0], v[2], -v[1]];
  const right = toW(row(0)), down = toW(row(1)), fwd = toW(row(2));
  const up: V3 = [-down[0], -down[1], -down[2]], back: V3 = [-fwd[0], -fwd[1], -fwd[2]];
  return matToQuat([right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2]]);
}

export async function runFree(name: string, opts: { frames?: number; fAssumedDeg?: number; sigma?: number; drift?: number; hAssumed?: number; refine?: boolean; log?: (s: string) => void } = {}) {
  const sc = scenes[name], n = opts.frames ?? 240, fTrue320 = 260, fTrue640 = 520, log = opts.log ?? (() => {});
  const slam = new Slam({ width: 320, height: 240, fovLongDeg: opts.fAssumedDeg ?? 63.3, camHeight: opts.hAssumed ?? 2.9, maxTracks: 200 });
  const fs0 = new FreeScan(slam);
  const bias: V3 = [0, 0, 0];
  const dir = `/tmp/t/frames_${name}_${n}`; fs.mkdirSync(dir, { recursive: true });
  const cache = (key: string, make: () => Uint8Array): Uint8Array => { const p = `${dir}/${key}.bin`; if (fs.existsSync(p)) return new Uint8Array(fs.readFileSync(p)); const a = make(); fs.writeFileSync(p, a); return a; };
  let lastKf = -99; const truth: Array<{ eye: V3; q: Quat }> = [];
  for (let i = 0; i < n; i++) {
    const { eye, target } = orbitPose(i, n);
    const cam320 = lookAt(eye, target, fTrue320, 320, 240);
    const img = cache(`s${i}`, () => renderView(null, null, sc, cam320, { noise: 1.5, blur: true, gain: 0.95, offset: 3, ss: 1 }));
    for (let k = 0; k < 3; k++) bias[k] += (-bias[k] / (3 * 15)) + ((opts.drift ?? 0.4) * DEG) * Math.sqrt(2 / 15 / 3) * gauss();
    const sg = (opts.sigma ?? 0.04) * DEG;
    let q = trackerQuat(cam320);
    q = mul(mul(mul(axisQ(1, 0, 0, bias[0] + gauss() * sg), axisQ(0, 1, 0, bias[1] + gauss() * sg)), axisQ(0, 0, 1, bias[2] + gauss() * sg)), q);
    slam.process(img, null, q);
    if (slam.state === 'track' && i - lastKf >= 5) {
      const cam640 = lookAt(eye, target, fTrue640, 640, 480);
      const g640 = cache(`k${i}`, () => renderView(null, null, sc, cam640, { noise: 2, blur: true, gain: 0.95, offset: 3, ss: 1 }));
      fs0.addKeyframe(img, g640, new Uint8ClampedArray(4), 1, 1);
      truth.push({ eye, q: trackerQuat(cam640) }); lastKf = i;
    }
  }
  log(`tracker: ${fs0.kfs.length} keyframes of ${n} frames, state ${slam.state}, map ${slam.alivePoints().length} points`);
  // pose error before the adjustment (tracker world -> board by the known transform of the first keyframe: tracker starts at c=(0,camHeight,0))
  const res = await fs0.build({ refine: opts.refine }, (m) => log('  ' + m));
  if (typeof res === 'string') return { error: res, fs0, truth, slam };
  return { ...res, fs0, truth, slam, sc };
}

/** Similarity fit (scale + translation, rotation already shared) of estimated to true camera centres. */
export function simFit(est: V3[], tru: V3[]): { k: number; t: V3; rms: number } {
  const n = est.length, m = (a: V3[]): V3 => [a.reduce((x, p) => x + p[0], 0) / n, a.reduce((x, p) => x + p[1], 0) / n, a.reduce((x, p) => x + p[2], 0) / n];
  const me = m(est), mt = m(tru);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { num += (est[i][a] - me[a]) * (tru[i][a] - mt[a]); den += (est[i][a] - me[a]) ** 2; }
  const k = num / den, t: V3 = [mt[0] - k * me[0], mt[1] - k * me[1], mt[2] - k * me[2]];
  let e = 0;
  for (let i = 0; i < n; i++) e += (k * est[i][0] + t[0] - tru[i][0]) ** 2 + (k * est[i][1] + t[1] - tru[i][1]) ** 2 + (k * est[i][2] + t[2] - tru[i][2]) ** 2;
  return { k, t, rms: Math.sqrt(e / n) };
}

export async function evaluate(name: string, opts: Parameters<typeof runFree>[1] = {}) {
  const r = await runFree(name, opts);
  if ('error' in r) return { error: r.error };
  const { info, hull, carveKfs, fs0, truth, sc } = r;
  const trackerC = fs0.kfs.map((k) => [k.c[0] * UNIT_MM, -k.c[2] * UNIT_MM, k.c[1] * UNIT_MM] as V3);
  const trueC = truth.map((t) => t.eye);
  const before = simFit(trackerC, trueC), after = simFit(carveKfs.map((k) => k.center), trueC);
  // hull voxel (estimated board mm) -> true board mm: x_true = (x_est - t) / k  where the fit maps est -> true: x_true = k x_est + t
  const { k, t } = after;
  let tp = 0, fp = 0, fn = 0, trueCount = 0;
  const n = hull.n, step = hull.vox * k;
  const mapPt = (c: V3): V3 => [k * c[0] + t[0], k * c[1] + t[1], k * c[2] + t[2]];
  for (let kk = 0; kk < n; kk++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = mapPt(hull.center(i, j, kk)), tr = inside(sc, p[0], p[1], p[2]), o = hull.occ[hull.idx(i, j, kk)] === 1;
    if (tr) trueCount++;
    if (tr && o) tp++; else if (o) fp++; else if (tr) fn++;
  }
  // true object volume not covered by the cube is also a miss: estimate from a fine scan of the true shape
  let totalTrue = 0; for (let x = -70; x <= 70; x += 2) for (let y = -70; y <= 70; y += 2) for (let z = 0; z <= 100; z += 2) if (inside(sc, x, y, z)) totalTrue++;
  const trueVol = totalTrue * 8 / 1000, estVol = hull.stats().volumeMm3 * k ** 3 / 1000;
  void step; void trueCount;
  const st = hull.stats();
  return { info, scale: k, before, after, iou: tp / (tp + fp + fn), recall: tp * (hull.vox * k) ** 3 / 1000 / trueVol, precision: tp / Math.max(1, tp + fp), estVol, trueVol, dims: [0, 1, 2].map((a) => (st.max[a] - st.min[a]) * k) };
}

if (process.argv[1]?.endsWith('free-scan-synthetic.ts')) {
  const name = process.argv[2] || 'snowman';
  (async () => {
    const t0 = performance.now();
    const r = await evaluate(name, { log: (s) => { if (!s.includes('masks') ) console.log(s); } });
    if ('error' in r) { console.log('FAILED:', r.error); return; }
    const f = (v: number, d = 1) => v.toFixed(d);
    console.log(`${name}: ${r.info.keyframes} keyframes, ${r.info.tracks} points, ${r.info.observations} observations (+${r.info.loopObs} loop), reprojection ${f(r.info.rmsBefore, 2)} -> ${f(r.info.rmsAfter, 2)} px, focal(320) ${f(r.info.focal320, 1)} (true 260)`);
    console.log(`scale: tracker is ${f(r.scale, 3)}x too ${r.scale > 1 ? 'small' : 'large'} before the user scale correction (assumed phone height 290 mm, true 170 mm at start)`);
    console.log(`camera position error after similarity fit: tracker ${f(r.before.rms)} mm -> adjusted ${f(r.after.rms)} mm`);
    console.log(`table masks cover ${f(r.info.maskPct, 0)}% of the image area around the object`);
    console.log(`model (true units): size ${r.dims.map((v) => f(v, 0)).join('x')} mm, volume ${f(r.estVol, 0)} cm3 (true ${f(r.trueVol, 0)}), IoU ${f(r.iou * 100, 0)}%, recall ${f(r.recall * 100, 0)}%, precision ${f(r.precision * 100, 0)}%`);
    console.log(`total ${f((performance.now() - t0) / 1000, 0)} s`);
  })();
}
