/**
 * Object scan on a synthetic scene: orbit around an object on the marker sheet, detect markers, estimate pose and focal
 * length, carve the voxel hull, compare with the true object. Run: npx tsx tests/object-scan-synthetic.ts
 */
import { ArucoDetector } from '../src/object3d/aruco';
import { makeLayout, renderSheet } from '../src/object3d/sheet';
import { estimatePose, cameraCenter, focalFromH, FocalCalibrator } from '../src/object3d/pose';
import { backgroundMask, Hull, Keyframe } from '../src/object3d/carve';
import { lookAt, renderView, Scene, inside, V3 } from './object-render';

const W = 640, H = 480, DEG = Math.PI / 180;
const scenes: Record<string, Scene> = {
  box: { tint: 140, shapes: [{ kind: 'box', cx: 0, cy: 0, hx: 30, hy: 20, h: 50, rot: 20 * DEG }] },
  snowman: { tint: 170, shapes: [{ kind: 'cyl', cx: 0, cy: 0, r: 28, z0: 0, z1: 38 }, { kind: 'sphere', cx: 0, cy: 0, cz: 58, r: 22 }] },
  lshape: { tint: 120, shapes: [{ kind: 'box', cx: -12, cy: 0, hx: 40, hy: 15, h: 40, rot: 0 }, { kind: 'box', cx: -37, cy: 22, hx: 15, hy: 22, h: 40, rot: 0 }] },
};

const frameCache = new Map<string, Uint8Array>();

export function runScan(name: string, opts: { views?: number; fTrue?: number; fAssumed?: number; noise?: number; gainVar?: boolean; verbose?: boolean; votes?: number; refine?: boolean | { std?: number; minViews?: number; passes?: number } } = {}) {
  const L = makeLayout('A4'), B = renderSheet(L, 3), sc = scenes[name], det = new ArucoDetector(L.markers.map((m) => m.id));
  const fTrue = opts.fTrue ?? 520, fAssumed = opts.fAssumed ?? 502, views = opts.views ?? 36;
  const hull = new Hull(64, 150); if (opts.votes) hull.votesNeeded = opts.votes; const kfs: Keyframe[] = [], cal = new FocalCalibrator();
  const tm = { render: 0, detect: 0, pose: 0, mask: 0, carve: 0, refine: 0 }; let t0r = 0;
  let used = 0, posErr = 0, markersSum = 0;
  for (let i = 0; i < views; i++) {
    const az = (i * 360) / views * DEG, el = [30, 50, 68][i % 3] * DEG, dist = 330 + 30 * Math.sin(i);
    const eye: V3 = [dist * Math.cos(el) * Math.cos(az), dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el)];
    const cam = lookAt(eye, [0, 0, 25], fTrue, W, H);
    let t0 = performance.now();
    const key = `${name}|${i}|${views}|${fTrue}|${opts.noise ?? 2}|${opts.gainVar ? 1 : 0}`;
    let img = frameCache.get(key);
    if (!img) { img = renderView(L, B, sc, cam, { noise: opts.noise ?? 2, blur: true, gain: opts.gainVar ? 0.75 + 0.4 * ((i * 7) % 5) / 4 : 0.95, offset: opts.gainVar ? ((i * 13) % 20) - 5 : 3 }); frameCache.set(key, img); }
    tm.render += performance.now() - t0; t0 = performance.now();
    const ms = det.detect(img, W, H); tm.detect += performance.now() - t0; t0 = performance.now();
    const f = cal.value() ?? fAssumed;
    const r = estimatePose(L, ms, { f, cx: W / 2, cy: H / 2 });
    tm.pose += performance.now() - t0;
    if (!r) continue;
    if (r.pose.markers >= 6) cal.add(focalFromH(r.H, W / 2, H / 2));
    if (r.pose.rms > 1.5 || r.pose.markers < 4) continue;
    const c = cameraCenter(r.pose); posErr += Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]); markersSum += r.pose.markers; used++;
    t0 = performance.now();
    const K = { f, cx: W / 2, cy: H / 2 }, bg = backgroundMask(img, W, H, r.pose, K, L, B);
    tm.mask += performance.now() - t0; t0 = performance.now();
    let sI = 0, sE = 0, cnt = 0; // exposure gain: image mean over the matched sheet pixels relative to the expected sheet
    for (let q = 0; q < bg.length; q += 7) if (bg[q]) { sI += img[q]; cnt++; }
    kfs.push({ R: r.pose.R, t: r.pose.t, K, w: W, h: H, bg, color: new Uint8ClampedArray(4), cw: 1, ch: 1, center: c, gray: img, gain: cnt > 50 ? sI / cnt / 150 : 1 }); void sE;
    hull.carve(kfs[kfs.length - 1]);
    tm.carve += performance.now() - t0;
  }
  hull.keepLargest();
  const preIou = (() => { let tp0 = 0, fp0 = 0, fn0 = 0; for (let k = 0; k < hull.n; k++) for (let j = 0; j < hull.n; j++) for (let i = 0; i < hull.n; i++) { const c0 = hull.center(i, j, k), t0 = inside(sc, c0[0], c0[1], c0[2]), o0 = hull.occ[hull.idx(i, j, k)] === 1; if (t0 && o0) tp0++; else if (!t0 && o0) fp0++; else if (t0) fn0++; } return tp0 / (tp0 + fp0 + fn0); })();
  let refined = 0;
  if (opts.refine) { t0r = performance.now(); refined = hull.refine(kfs, opts.refine === true ? {} : opts.refine); hull.keepLargest(); tm.refine = performance.now() - t0r; }
  // compare with the truth on the same grid
  let tp = 0, fp = 0, fn = 0, trueCount = 0;
  const n = hull.n;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = hull.center(i, j, k), t = inside(sc, c[0], c[1], c[2]), o = hull.occ[hull.idx(i, j, k)] === 1;
    if (t) trueCount++;
    if (t && o) tp++; else if (!t && o) fp++; else if (t && !o) fn++;
  }
  const st = hull.stats();
  let tmin: V3 = [1e9, 1e9, 1e9], tmax: V3 = [-1e9, -1e9, -1e9];
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const c = hull.center(i, j, k); if (inside(sc, c[0], c[1], c[2])) for (let a = 0; a < 3; a++) { tmin[a] = Math.min(tmin[a], c[a]); tmax[a] = Math.max(tmax[a], c[a]); } }
  const dims = (lo: number[], hi: number[]) => [0, 1, 2].map((a) => hi[a] - lo[a]);
  return { preIou, refined, used, views, focal: cal.value() ?? NaN, fTrue, posErr: used ? posErr / used : NaN, markers: markersSum / Math.max(1, used), iou: tp / (tp + fp + fn), recall: tp / trueCount, precision: tp / (tp + fp),
    dimsTrue: dims(tmin, tmax), dims: dims(st.min, st.max), volume: st.volumeMm3 / 1000, volumeTrue: trueCount * hull.vox ** 3 / 1000, tm: Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, k === "refine" ? v : v / Math.max(1, views)])), hull, kfs };
}

if (process.argv[1]?.endsWith('object-scan-synthetic.ts')) {
  const f1 = (v: number, d = 1) => (isNaN(v) ? '-' : v.toFixed(d));
  const cases: Array<[string, Parameters<typeof runScan>[1]]> = [['box', {}], ['snowman', {}], ['lshape', {}], ['box', { gainVar: true, fAssumed: 460 }]];
  for (const [name, o] of cases) {
    const r = runScan(name, o), tag = o?.gainVar ? ' (exposure changes, assumed focal 460 instead of 520)' : '';
    console.log(`\n${name}${tag}: ${r.used}/${r.views} views used, markers per view ${f1(r.markers)}, focal estimate ${f1(r.focal, 0)} (true ${r.fTrue}), camera position error ${f1(r.posErr, 2)} mm`);
    console.log(`  IoU ${f1(r.iou * 100, 0)}%  recall ${f1(r.recall * 100, 0)}%  precision ${f1(r.precision * 100, 0)}% | size ${r.dims.map((v) => f1(v, 0)).join('x')} mm (true ${r.dimsTrue.map((v) => f1(v, 0)).join('x')}) | volume ${f1(r.volume, 0)} cm3 (true ${f1(r.volumeTrue, 0)})`);
    console.log(`  ms per view: render ${f1(r.tm.render, 0)}, markers ${f1(r.tm.detect, 0)}, pose ${f1(r.tm.pose, 0)}, background mask ${f1(r.tm.mask, 0)}, carve ${f1(r.tm.carve, 0)}`);
  }
}
