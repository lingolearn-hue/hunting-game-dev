import { Slam } from '../src/slam/Slam';
import { Quat, multiply, yawQuat, pitchQuat, rotateVec, fromAxisAngle } from '../src/util/quat';

export const W = 192, H = 144;
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x: number, y: number) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx) * (1 - sy) + (hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx) * sy; };
/** Surface texture around a base brightness: neighbouring planes differ in brightness, so their borders are real image edges. */
const tex = (a: number, b: number, seed: number, base = 120) => base - 45 + 90 * (0.5 * vnoise(a * 5 + seed, b * 5) + 0.3 * vnoise(a * 11 + seed, b * 11 + 7) + 0.2 * vnoise(a * 23, b * 23 + seed));

/** Deterministic Math.random for reproducible tests. */
export function seedRandom(seed: number): void { let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export type V3 = [number, number, number];
/** Surfaces: floor y=0, wall z=-7, left wall x=-3.5, box [0.8,1.8]x[0,1]x[-4.5,-3.5]. */
export function scenePoint(c: V3, d: V3): { p: V3; g: number } | null {
  let best = Infinity, g = 0;
  if (d[1] < -1e-6) { const t = -c[1] / d[1]; if (t > 0.1 && t < best) { best = t; g = tex(c[0] + d[0] * t, c[2] + d[2] * t, 1, 95); } }
  if (d[2] < -1e-6) { const t = (-7 - c[2]) / d[2]; const x = c[0] + d[0] * t, y = c[1] + d[1] * t; if (t > 0.1 && t < best && x > -3.5 && x < 8 && y > 0 && y < 4) { best = t; g = tex(x, y, 50, 165); } }
  if (d[0] < -1e-6) { const t = (-3.5 - c[0]) / d[0]; const z = c[2] + d[2] * t, y = c[1] + d[1] * t; if (t > 0.1 && t < best && z > -7 && z < 3 && y > 0 && y < 4) { best = t; g = tex(z, y, 130, 135); } }
  // box slabs
  const lo = [0.8, 0, -4.5], hi = [1.8, 1, -3.5]; let t0 = 0.1, t1 = Infinity, face = -1;
  for (let a = 0; a < 3; a++) { if (Math.abs(d[a]) < 1e-9) { if (c[a] < lo[a] || c[a] > hi[a]) { t1 = -1; } continue; }
    let ta = (lo[a] - c[a]) / d[a], tb = (hi[a] - c[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) { t0 = ta; face = a; } if (tb < t1) t1 = tb; }
  if (t1 > t0 && face >= 0 && t0 < best) { best = t0; const p: V3 = [c[0] + d[0] * t0, c[1] + d[1] * t0, c[2] + d[2] * t0]; const u = face === 0 ? p[2] : p[0], v = face === 1 ? p[2] : p[1]; g = tex(u, v, 90 + face * 17, face === 1 ? 185 : face === 0 ? 70 : 215); }
  if (!isFinite(best)) return null;
  return { p: [c[0] + d[0] * best, c[1] + d[1] * best, c[2] + d[2] * best], g };
}
export function distToScene(p: V3): number {
  const dFloor = Math.abs(p[1]);
  const dWall = p[0] > -3.6 && p[0] < 8.1 && p[1] > -0.1 && p[1] < 4.1 ? Math.abs(p[2] + 7) : Infinity;
  const dWall2 = p[2] > -7.1 && p[2] < 3.1 && p[1] > -0.1 && p[1] < 4.1 ? Math.abs(p[0] + 3.5) : Infinity;
  const dx = Math.max(0.8 - p[0], 0, p[0] - 1.8), dy = Math.max(0 - p[1], 0, p[1] - 1), dz = Math.max(-4.5 - p[2], 0, p[2] + 3.5);
  return Math.min(dFloor, dWall, dWall2, Math.hypot(dx, dy, dz));
}
export function render(c: V3, q: Quat, fov: number, noise = 2): Uint8Array {
  const f = Math.max(W, H) / 2 / Math.tan((fov * Math.PI) / 360), img = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = Math.hypot((x - W / 2) / f, (y - H / 2) / f, 1);
    const d = rotateVec(q, [((x - W / 2) / f) / l, (-(y - H / 2) / f) / l, -1 / l]);
    const s = scenePoint(c, d);
    img[y * W + x] = Math.max(0, Math.min(255, (s ? s.g : 210) + (Math.random() - 0.5) * 2 * noise));
  }
  return img;
}
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
/** Truth path: start 1.5 m high, pitch down 35 deg; slide right 1.2 m, then walk toward the wall. */
export function pathAt(t: number): { c: V3; q: Quat } {
  const s1 = Math.min(1, t / 3), e1 = s1 * s1 * (3 - 2 * s1);
  const s2 = Math.max(0, Math.min(1, (t - 3) / 7)), e2 = s2;
  const x = 1.2 * e1 + 0.15 * Math.sin(t * 2.1) * s1, z = -3.5 * e2, y = 1.5 + 0.03 * Math.sin(t * 5.3);
  const yaw = -0.35 * e1 + 0.15 * Math.sin(t * 0.9) , pitch = (-35 + 22 * e2) * Math.PI / 180;
  return { c: [x, y, z], q: multiply(yawQuat(yaw), pitchQuat(pitch)) };
}
/** Longer path that ends by turning left to see the second wall and the corner. */
export function pathStruct(t: number): { c: V3; q: Quat } {
  const p0 = pathAt(Math.min(t, 10));
  const f = rotateVec(p0.q, [0, 0, -1]), yaw0 = Math.atan2(-f[0], -f[2]);
  const s = Math.max(0, Math.min(1, (t - 10) / 7)), e = s * s * (3 - 2 * s);
  // last phase: turn left (about 90 deg, looking at the left wall) and walk along the left wall (parallel to it), which gives it good parallax
  return { c: [p0.c[0] - 0.6 * e, p0.c[1], p0.c[2] - 1.8 * e], q: multiply(yawQuat(yaw0 + 1.9 * e), pitchQuat((-13 + 5 * e) * Math.PI / 180)) };
}
export function noisyQ(q: Quat, sigmaDeg: number, bias: [number, number, number]): Quat {
  const s = sigmaDeg * Math.PI / 180;
  const e = multiply(multiply(fromAxisAngle(1, 0, 0, gauss() * s + bias[0]), fromAxisAngle(0, 1, 0, gauss() * s + bias[1])), fromAxisAngle(0, 0, 1, gauss() * s + bias[2]));
  return multiply(e, q);
}
export function run(opts: { path?: 'struct'; corr?: number; fov?: number; fovAssumed?: number; hAssumed?: number; sigma?: number; seconds?: number; fps?: number; yawBias?: number }) {
  const fov = opts.fov ?? 65, sigma = opts.sigma ?? 0.2, fps = opts.fps ?? 15, T = opts.seconds ?? 10;
  const slam = new Slam({ width: W, height: H, fovLongDeg: opts.fovAssumed ?? fov, camHeight: opts.hAssumed ?? 1.5 });
  const bias: [number, number, number] = [0, 0, (opts.yawBias ?? 0) * Math.PI / 180];
  let tms = 0; const errs: Array<[number, number]> = []; let state = 'init', initAt = -1;
  for (let i = 0; i <= T * fps; i++) {
    const t = i / fps, p = opts.path === 'struct' ? pathStruct(t) : pathAt(t), img = render(p.c, p.q, fov);
    if (opts.corr) { const dt = 1 / fps, tau = 3, sg = opts.corr * Math.PI / 180; for (let k = 0; k < 3; k++) bias[k] += (-bias[k] / tau) * dt + sg * Math.sqrt(2 * dt / tau) * gauss(); }
    const t0 = performance.now(); const info = slam.process(img, null, noisyQ(p.q, sigma, bias)); tms += performance.now() - t0;
    if (info.state === 'track' && initAt < 0) initAt = t;
    if (info.state === 'track') errs.push([t, Math.hypot(slam.c[0] - p.c[0], slam.c[1] - p.c[1], slam.c[2] - p.c[2])]);
    state = info.state;
  }
  const pts = slam.alivePoints(), d = pts.map((m) => distToScene(m.X)).sort((a, b) => a - b);
  const frac = (th: number) => d.filter((v) => v < th).length / Math.max(1, d.length);
  const tail = errs.slice(-Math.floor(fps * 2)).map((e) => e[1]);
  return { initAt, state, points: pts.length, med: d[d.length >> 1], f10: frac(0.1), f25: frac(0.25), f50: frac(0.5), poseErrFinal: tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : NaN, poseErrMax: Math.max(0, ...errs.map((e) => e[1])), msPerFrame: tms / (T * fps), slam };
}
/** Run with: npx tsx tests/slam-synthetic.ts  (ray-traced test scene with floor, wall and a box; noisy IMU; prints map and pose errors) */
if (process.argv[1]?.endsWith('slam-synthetic.ts')) {
  const row = (name: string, o: Parameters<typeof run>[0]) => {
    const r = run(o);
    console.log(name.padEnd(36), 'init', r.initAt.toFixed(1), 's | pts', r.points, '| median map error', (r.med * 100).toFixed(0), 'cm | within 25 cm', (r.f25 * 100).toFixed(0) + '% | pose error', (r.poseErrFinal * 100).toFixed(0), 'cm |', r.msPerFrame.toFixed(1), 'ms/frame');
  };
  row('white 0.2 deg', {});
  row('white 0.1 + drift 0.5 deg', { sigma: 0.1, corr: 0.5 });
  row('white 0.1 + drift 1.0 deg', { sigma: 0.1, corr: 1.0 });
  row('constant 2 deg tilt bias', { yawBias: 2 });
  row('FOV assumed 55 (true 65)', { fovAssumed: 55 });
  row('FOV assumed 75 (true 65)', { fovAssumed: 75 });
}
